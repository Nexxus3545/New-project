const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const helpers = require('../src/utils/accountCredentials');

test('isolated PostgreSQL executes private credential submission, review, replacement, role checks and cascade cleanup', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const { Client, Pool } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'This test refuses remote or production databases');
  if (!connectionString) assert.ok(env.DB_NAME && env.DB_USER, 'Explicit local database configuration is required');
  const config = connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  };
  const schema = `mwos_credential_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(schema, /^mwos_credential_test_[a-f0-9]{16}$/);
  const setup = new Client(config);
  const pool = new Pool({ ...config, max: 2, options: `-c search_path=${schema}` });
  let created = false;
  await setup.connect();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); created = true;
    await setup.query(`SET search_path TO ${schema}`);
    await setup.query(`CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL DEFAULT true)`);
    await setup.query(`CREATE TABLE staff_registry (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      professional_title varchar(120), license_number varchar(120), license_type varchar(120), license_status varchar(20) DEFAULT 'pending',
      credential_expires_at date, verified_by uuid, verified_at timestamptz, last_reviewed_at timestamptz, updated_at timestamptz DEFAULT now()
    )`);
    await setup.query(`CREATE TABLE license_verification_events (
      id bigserial PRIMARY KEY, staff_id uuid REFERENCES staff_registry(id), event_type text, previous_status text,
      next_status text, notes text, performed_by uuid
    )`);
    await setup.query(`CREATE TABLE security_audit (
      id bigserial PRIMARY KEY, staff_id uuid, action_performed text, entity_type text, entity_id uuid,
      device_ip text, auth_method text, credential_strength text CHECK (credential_strength IN ('Base','Step_Up','Clinical_Signature')),
      request_id text, details jsonb
    )`);
    const patientId = crypto.randomUUID(), clinicianId = crypto.randomUUID(), adminId = crypto.randomUUID(), otherId = crypto.randomUUID();
    await setup.query(`INSERT INTO users (id,role) VALUES ($1,'patient'),($2,'nurse'),($3,'admin'),($4,'patient')`, [patientId, clinicianId, adminId, otherId]);
    const originalSql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261028181230_account_credentials.sql'), 'utf8');
    // Only the migration's explicitly qualified tables move into the isolated synthetic schema.
    const sql = originalSql.replaceAll('public.account_credentials', `${schema}.account_credentials`).replaceAll('public.users', `${schema}.users`);
    assert.ok(!sql.includes('public.account_credentials') && !sql.includes('public.users'));
    await setup.query('BEGIN');
    await setup.query("SET LOCAL lock_timeout='2s'");
    await setup.query("SET LOCAL statement_timeout='5s'");
    await setup.query(sql); await setup.query(sql);
    await setup.query('COMMIT');
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 4, 'The additive migration preserves existing accounts');
    const owner = (await setup.query(`SELECT c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner, current_user AS executor,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee=0) AS public_access
      FROM pg_class c WHERE c.oid=$1::regclass`, [`${schema}.account_credentials`])).rows[0];
    assert.equal(owner.relrowsecurity, true); assert.equal(owner.public_access, false);
    assert.equal(owner.owner, owner.executor, 'The server migration role owns the private table and can execute authenticated API queries');
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM pg_policies WHERE schemaname=$1 AND tablename=$2', [schema, 'account_credentials'])).rows[0].count, 0);
    for (const role of ['anon', 'authenticated']) {
      if ((await setup.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rows.length) {
        for (const permission of ['SELECT','INSERT','UPDATE','DELETE']) {
          assert.equal((await setup.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, `${schema}.account_credentials`, permission])).rows[0].allowed, false);
        }
      }
    }

    const module = { exports: {} };
    let acquired = 0;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/credential.controller.js'), 'utf8'), {
      module, exports: module.exports, Date, Set, JSON, Buffer,
      require: (name) => {
        if (name === '../config/database') return { getClient: async () => { acquired++; return pool.connect(); } };
        if (name === '../utils/accountCredentials') return helpers;
        if (name === '../middleware/stepUp') return { resolveStepUpContext: (req, purpose) => {
          assert.equal(purpose, 'license-change');
          if (req.headers['x-step-up-token'] !== 'synthetic-verification') throw Error('Synthetic verification missing');
          req.stepUp = { authMethod: 'Passkey', credentialStrength: 'Step_Up' };
        } };
        throw Error('Unexpected integration dependency: ' + name);
      },
    });
    async function invoke(action, { user = { id: patientId, role: 'patient' }, target = patientId, body = {}, stepUp = true } = {}) {
      let status = 200, payload, failure; const headers = {};
      const res = { set(k,v) { headers[k]=v;return res; }, status(v) { status=v;return res; }, json(v) { payload=v;return res; }, send(v) { payload=v;return res; } };
      await module.exports[action]({ user, params: { userId: target }, body, headers: stepUp ? { 'x-step-up-token': 'synthetic-verification' } : {}, ip: '127.0.0.1' }, res, (error) => { failure=error; });
      if (failure) throw failure;
      return { status, payload, headers };
    }
    const document = Buffer.from('%PDF-1.7\nSYNTHETIC-PRIVATE-ID-DOCUMENT-NO-REAL-PERSON');
    const replacement = Buffer.from('%PDF-1.7\nSYNTHETIC-REPLACEMENT-ONLY');
    const draft = (bytes = document) => ({ documentType: 'philhealth_id', idLast4: '1234', consent: true, file: { name: 'synthetic-id.pdf', mimeType: 'application/pdf', dataBase64: bytes.toString('base64') } });
    const admin = { id: adminId, role: 'admin' }, clinician = { id: clinicianId, role: 'nurse' };
    const beforeDenied = acquired;
    assert.equal((await invoke('getMine', { user: null })).status, 401);
    assert.equal((await invoke('getForUser')).status, 403);
    assert.equal((await invoke('reviewForUser', { user: admin, stepUp: false })).status, 403);
    assert.equal(acquired, beforeDenied, 'Denied requests cannot acquire a database connection');

    const submitted = await invoke('submitMine', { body: draft() });
    assert.equal(submitted.status, 201); assert.equal(submitted.payload.data.credential.status, 'pending');
    assert.equal(submitted.payload.data.credential.revision, 1);
    const privateDto = await invoke('getMine', { target: otherId });
    assert.equal(privateDto.payload.data.credential.userId, patientId, 'Own endpoints ignore target tampering');
    assert.equal(privateDto.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(privateDto.payload).includes(document.toString('base64')));
    assert.ok(!Object.hasOwn(privateDto.payload.data.credential, 'document_bytes'));
    const verified = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 1, reviewNotes: 'Reviewed synthetic government ID.' } });
    assert.equal(verified.payload.data.credential.status, 'verified');
    assert.equal((await setup.query('SELECT reviewed_by FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].reviewed_by, adminId);
    const replaced = await invoke('submitMine', { body: draft(replacement) });
    assert.equal(replaced.payload.data.credential.revision, 2); assert.equal(replaced.payload.data.credential.status, 'pending');
    assert.equal(replaced.payload.data.credential.reviewNotes, null);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].count, 1);
    assert.ok((await setup.query('SELECT document_bytes FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].document_bytes.equals(replacement));
    const stale = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 1, reviewNotes: 'Old review of replaced submission.' } });
    assert.equal(stale.status, 409); assert.equal(stale.payload.code, 'CREDENTIAL_REVISION_CONFLICT');
    const download = await invoke('downloadForUser', { user: admin });
    assert.ok(download.payload.equals(replacement)); assert.match(download.headers['Content-Disposition'], /^attachment;/); assert.equal(download.headers['Cache-Control'], 'no-store');
    assert.equal((await invoke('downloadForUser', { user: { id: otherId, role: 'patient' } })).status, 403);

    await setup.query("UPDATE users SET role='nurse' WHERE id=$1", [patientId]);
    const changedRole = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Outdated patient ID after role change.' } });
    assert.equal(changedRole.status, 409); assert.equal(changedRole.payload.code, 'CREDENTIAL_ROLE_MISMATCH');
    await setup.query("UPDATE users SET role='patient' WHERE id=$1", [patientId]);

    const license = { ...draft(), documentType: 'professional_license', idLast4: undefined, licenseNumber: 'SYNTHETIC-PRC-12345', expiresAt: '2099-12-31' };
    assert.equal((await invoke('submitMine', { user: clinician, body: license })).status, 201);
    let staff = (await setup.query('SELECT license_status, license_number, credential_expires_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'pending'); assert.equal(staff.license_number, license.licenseNumber);
    const approved = await invoke('reviewForUser', { user: admin, target: clinicianId, body: { status: 'verified', revision: 1, reviewNotes: 'Reviewed synthetic professional card and expiry.' } });
    assert.equal(approved.payload.data.credential.expiresAt, '2099-12-31');
    staff = (await setup.query('SELECT license_status, verified_by, verified_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'verified'); assert.equal(staff.verified_by, adminId); assert.ok(staff.verified_at instanceof Date);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM license_verification_events')).rows[0].count, 1);
    await invoke('submitMine', { user: clinician, body: { ...license, licenseNumber: 'SYNTHETIC-PRC-REPLACED' } });
    staff = (await setup.query('SELECT license_status, verified_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'pending'); assert.equal(staff.verified_at, null);

    for (const [statement, params, code] of [
      ["UPDATE account_credentials SET status='automatically_verified' WHERE user_id=$1", [patientId], '23514'],
      ['UPDATE account_credentials SET revision=0 WHERE user_id=$1', [patientId], '23514'],
      ['UPDATE account_credentials SET id_last4=$2 WHERE user_id=$1', [patientId,'12'], '23514'],
      ['UPDATE account_credentials SET document_bytes=$2 WHERE user_id=$1', [patientId,Buffer.alloc(0)], '23514'],
      ['UPDATE account_credentials SET document_bytes=$2 WHERE user_id=$1', [patientId,Buffer.alloc(2097153)], '23514'],
      ['UPDATE account_credentials SET expires_at=NULL WHERE user_id=$1', [clinicianId], '23514'],
      ["UPDATE account_credentials SET mime_type='text/html' WHERE user_id=$1", [patientId], '23514'],
    ]) await assert.rejects(setup.query(statement, params), { code });
    await setup.query('DELETE FROM users WHERE id=$1', [patientId]);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].count, 0);
    const auditRows = (await setup.query('SELECT action_performed, details FROM security_audit')).rows;
    assert.ok(auditRows.some((row) => row.action_performed === 'CREDENTIAL_DOCUMENT_VIEWED'));
    const serialized = JSON.stringify(auditRows);
    for (const secret of [document.toString('base64'), replacement.toString('base64'), license.licenseNumber, 'Reviewed synthetic government ID.']) assert.equal(serialized.includes(secret), false, 'Audit receipts retain actions and references, not documents, ID numbers or review text');
  } finally {
    await pool.end();
    if (created) {
      assert.match(schema, /^mwos_credential_test_[a-f0-9]{16}$/);
      await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await setup.end();
  }
});
