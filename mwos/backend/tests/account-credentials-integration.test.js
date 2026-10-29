const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const helpers = require('../src/utils/accountCredentials');
const safeAnalysis = () => ({ version: 1, outcome: 'ready_for_review', authenticity: 'not_verified', source: 'local_ocr', confidence: 90, pagesScanned: 1,
  checks: [{ code: 'issuer_authentication', result: 'unknown', label: 'Not authenticated by the issuing authority.' }], summary: 'Synthetic text comparison only; clinic and issuer review remain required.' });
const attestation = { verificationMethod: 'in_person_original', officialCheckConfirmed: true };

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
  const pool = new Pool({ ...config, max: 1, options: `-c search_path=${schema}` });
  let created = false;
  await setup.connect();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); created = true;
    await setup.query(`SET search_path TO ${schema}`);
    await setup.query(`CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      first_name varchar(100) NOT NULL DEFAULT 'Synthetic', last_name varchar(100) NOT NULL DEFAULT 'Person')`);
    await setup.query(`CREATE TABLE patients (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      first_name varchar(100), last_name varchar(100), date_of_birth date)`);
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
    await setup.query(`INSERT INTO patients (user_id,first_name,last_name,date_of_birth) VALUES ($1,'Synthetic','Person','1990-02-14'),($2,'Synthetic','Other','1990-03-15')`, [patientId, otherId]);
    const originalSql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261028181230_account_credentials.sql'), 'utf8');
    // Only the migration's explicitly qualified tables move into the isolated synthetic schema.
    const sql = originalSql.replaceAll('public.account_credentials', `${schema}.account_credentials`).replaceAll('public.users', `${schema}.users`);
    const scanningSql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261028233717_credential_scanning.sql'), 'utf8').replaceAll('public.', `${schema}.`);
    assert.ok(!sql.includes('public.account_credentials') && !sql.includes('public.users'));
    await setup.query('BEGIN');
    await setup.query("SET LOCAL lock_timeout='2s'");
    await setup.query("SET LOCAL statement_timeout='5s'");
    await setup.query(sql); await setup.query(sql);
    await setup.query(scanningSql); await setup.query(scanningSql);
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
    let acquired = 0, active = 0, scanCalls = 0;
    const scanFixture = async ({ userId, revision }) => {
      assert.equal(active, 0, 'OCR is invoked after the only submission connection is released');
      scanCalls++;
      const saved = await pool.query(`UPDATE account_credentials SET scan_status='completed',scan_revision=$2,
        scan_started_at=NOW(),scanned_at=NOW(),scan_token=NULL,scan_result=$3::jsonb
        WHERE user_id=$1 AND revision=$2 RETURNING user_id`, [userId, revision, JSON.stringify(safeAnalysis())]);
      return { outcome: saved.rows.length ? 'scanned' : 'stale', revision };
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/credential.controller.js'), 'utf8'), {
      module, exports: module.exports, Date, Set, JSON, Buffer,
      require: (name) => {
        if (name === '../config/database') return { getClient: async () => {
          acquired++; const client = await pool.connect(); active++;
          return { query: client.query.bind(client), release: () => { active--; client.release(); } };
        } };
        if (name === '../utils/accountCredentials') return helpers;
        if (name === 'node:crypto') return crypto;
        if (name === '../utils/credentialScan') return { scanCredential: scanFixture };
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
    assert.equal(submitted.payload.data.credential.scan.status, 'completed');
    assert.equal(submitted.payload.data.credential.scan.analysis.authenticity, 'not_verified');
    assert.equal(scanCalls, 1);
    const privateDto = await invoke('getMine', { target: otherId });
    assert.equal(privateDto.payload.data.credential.userId, patientId, 'Own endpoints ignore target tampering');
    assert.equal(privateDto.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(privateDto.payload).includes(document.toString('base64')));
    assert.ok(!Object.hasOwn(privateDto.payload.data.credential, 'document_bytes'));
    const verified = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 1, reviewNotes: 'Reviewed synthetic government ID.', ...attestation } });
    assert.equal(verified.payload.data.credential.status, 'verified');
    assert.equal((await setup.query('SELECT reviewed_by FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].reviewed_by, adminId);
    assert.equal(verified.payload.data.credential.verificationMethod, 'in_person_original');
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

    await setup.query("UPDATE account_credentials SET scanned_at=NOW()-INTERVAL '31 minutes' WHERE user_id=$1", [patientId]);
    const expiredScan = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Synthetic stale scan review.', ...attestation } });
    assert.equal(expiredScan.status, 409); assert.equal(expiredScan.payload.code, 'CREDENTIAL_SCAN_REQUIRED');
    await invoke('scanMine', { body: { revision: 2 } });
    const noAttestation = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Synthetic review without issuer/original confirmation.' } });
    assert.equal(noAttestation.status, 400); assert.equal(noAttestation.payload.code, 'CREDENTIAL_AUTHENTICITY_CONFIRMATION_REQUIRED');
    await setup.query("UPDATE account_credentials SET scan_result=jsonb_set(scan_result,'{outcome}','\"needs_attention\"') WHERE user_id=$1", [patientId]);
    const noAcknowledgment = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Synthetic concern review.', ...attestation } });
    assert.equal(noAcknowledgment.status, 400); assert.equal(noAcknowledgment.payload.code, 'CREDENTIAL_SCAN_CONCERNS_REQUIRED');
    assert.equal((await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Synthetic original ID checked and scan concerns reviewed.', ...attestation, acknowledgeScanFlags: true } })).status, 200);

    await setup.query("UPDATE users SET first_name='Changed' WHERE id=$1", [patientId]);
    let invalidated = (await setup.query('SELECT revision,status,scan_status,scan_revision,scan_result,verification_method,reviewed_at FROM account_credentials WHERE user_id=$1', [patientId])).rows[0];
    assert.equal(invalidated.revision, 3); assert.equal(invalidated.status, 'pending'); assert.equal(invalidated.scan_status, 'not_scanned');
    assert.equal(invalidated.scan_revision, null); assert.equal(invalidated.scan_result, null); assert.equal(invalidated.verification_method, null); assert.equal(invalidated.reviewed_at, null);
    assert.equal((await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 2, reviewNotes: 'Old review after identity change.', ...attestation } })).payload.code, 'CREDENTIAL_REVISION_CONFLICT');
    await invoke('scanMine', { body: { revision: 3 } });
    assert.equal((await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 3, reviewNotes: 'Synthetic identity rechecked after name update.', verificationMethod: 'issuer_check', officialCheckConfirmed: true } })).status, 200);
    await setup.query("UPDATE patients SET date_of_birth='1990-02-15' WHERE user_id=$1", [patientId]);
    invalidated = (await setup.query('SELECT revision,status,scan_status,scan_revision,scan_result FROM account_credentials WHERE user_id=$1', [patientId])).rows[0];
    assert.equal(invalidated.revision, 4); assert.equal(invalidated.status, 'pending'); assert.equal(invalidated.scan_status, 'not_scanned'); assert.equal(invalidated.scan_revision, null); assert.equal(invalidated.scan_result, null);
    assert.ok((await setup.query('SELECT document_bytes FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].document_bytes.equals(replacement), 'Changing identity invalidates verification, not the privately retained ID file');
    assert.equal((await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 3, reviewNotes: 'Old review after DOB update.', ...attestation } })).payload.code, 'CREDENTIAL_REVISION_CONFLICT');

    await setup.query("UPDATE users SET role='nurse' WHERE id=$1", [patientId]);
    assert.equal((await setup.query('SELECT revision FROM account_credentials WHERE user_id=$1', [patientId])).rows[0].revision, 5);
    assert.equal((await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 4, reviewNotes: 'Outdated patient review after role change.' } })).payload.code, 'CREDENTIAL_REVISION_CONFLICT');
    const changedRole = await invoke('reviewForUser', { user: admin, body: { status: 'verified', revision: 5, reviewNotes: 'Outdated patient ID after role change.' } });
    assert.equal(changedRole.status, 409); assert.equal(changedRole.payload.code, 'CREDENTIAL_ROLE_MISMATCH');
    await setup.query("UPDATE users SET role='patient' WHERE id=$1", [patientId]);

    const license = { ...draft(), documentType: 'professional_license', idLast4: undefined, licenseNumber: 'SYNTHETIC-PRC-12345', expiresAt: '2099-12-31' };
    assert.equal((await invoke('submitMine', { user: clinician, body: license })).status, 201);
    let staff = (await setup.query('SELECT license_status, license_number, credential_expires_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'pending'); assert.equal(staff.license_number, license.licenseNumber);
    const approved = await invoke('reviewForUser', { user: admin, target: clinicianId, body: { status: 'verified', revision: 1, reviewNotes: 'Reviewed synthetic professional card and expiry.', ...attestation } });
    assert.equal(approved.payload.data.credential.expiresAt, '2099-12-31');
    staff = (await setup.query('SELECT license_status, verified_by, verified_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'verified'); assert.equal(staff.verified_by, adminId); assert.ok(staff.verified_at instanceof Date);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM license_verification_events')).rows[0].count, 1);

    await setup.query("UPDATE users SET last_name='ChangedProfessional' WHERE id=$1", [clinicianId]);
    invalidated = (await setup.query('SELECT revision,status,scan_status,scan_result,verification_method FROM account_credentials WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(invalidated.revision, 2); assert.equal(invalidated.status, 'pending'); assert.equal(invalidated.scan_status, 'not_scanned'); assert.equal(invalidated.scan_result, null); assert.equal(invalidated.verification_method, null);
    staff = (await setup.query('SELECT license_status,verified_at,verified_by FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'pending'); assert.equal(staff.verified_at, null); assert.equal(staff.verified_by, null);
    assert.equal((await invoke('reviewForUser', { user: admin, target: clinicianId, body: { status: 'verified', revision: 1, reviewNotes: 'Old professional approval after name update.', ...attestation } })).payload.code, 'CREDENTIAL_REVISION_CONFLICT');
    await invoke('scanMine', { user: clinician, body: { revision: 2 } });
    assert.equal((await invoke('reviewForUser', { user: admin, target: clinicianId, body: { status: 'verified', revision: 2, reviewNotes: 'Synthetic updated professional identity reviewed.', ...attestation } })).status, 200);
    await invoke('submitMine', { user: clinician, body: { ...license, licenseNumber: 'SYNTHETIC-PRC-REPLACED' } });
    staff = (await setup.query('SELECT license_status, verified_at FROM staff_registry WHERE user_id=$1', [clinicianId])).rows[0];
    assert.equal(staff.license_status, 'pending'); assert.equal(staff.verified_at, null);

    // Exercise the real installed OCR runtime and lease service against the
    // isolated schema, beyond the deterministic controller-scan fixture above.
    const sharp = require('sharp');
    const syntheticPng = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="64" fill="black"><text x="70" y="130">SYNTHETIC TEST DOCUMENT</text><text x="70" y="270">PHILHEALTH</text><text x="70" y="410">SYNTHETIC PERSON</text><text x="70" y="550">DATE OF BIRTH: 1990-03-15</text><text x="70" y="690">NOT A REAL GOVERNMENT ID</text></g></svg>')).png().toBuffer();
    const other = { id: otherId, role: 'patient' };
    const realDraft = { documentType: 'philhealth_id', consent: true, file: { name: 'synthetic-ocr-only.png', mimeType: 'image/png', dataBase64: syntheticPng.toString('base64') } };
    assert.equal((await invoke('submitMine', { user: other, target: otherId, body: realDraft })).status, 201);
    const actualOcr = require('../src/utils/credentialOcr');
    const { analyzeCredential } = require('../src/utils/credentialAnalysis');
    const scanner = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/credentialScan.js'), 'utf8'), {
      module: scanner, Buffer, Date,
      require: (name) => {
        if (name === 'node:crypto') return crypto;
        if (name === '../config/database') return { getClient: async () => {
          assert.equal(active, 0); const client = await pool.connect(); active++;
          return { query: client.query.bind(client), release: () => { active--; client.release(); } };
        } };
        if (name === './accountCredentials') return helpers;
        if (name === './credentialAnalysis') return { analyzeCredential };
        if (name === './credentialOcr') return { extractCredentialText: async (...args) => { assert.equal(active, 0, 'No DB connection is held by the real OCR worker'); return actualOcr.extractCredentialText(...args); } };
        throw Error('Unexpected scan integration dependency: ' + name);
      },
    });
    const realReceipt = await scanner.exports.scanCredential({ userId: otherId, revision: 1, actorId: otherId });
    assert.equal(realReceipt.outcome, 'scanned');
    const realRecord = (await setup.query('SELECT status,revision,scan_status,scan_revision,scan_result,document_sha256,scan_token FROM account_credentials WHERE user_id=$1', [otherId])).rows[0];
    assert.equal(realRecord.status, 'pending'); assert.equal(realRecord.scan_status, 'completed'); assert.equal(realRecord.scan_revision, 1); assert.equal(realRecord.scan_token, null);
    assert.equal(realRecord.scan_result.authenticity, 'not_verified');
    assert.equal(realRecord.scan_result.checks.find((item) => item.code === 'ocr_readability').result, 'pass');
    assert.match(realRecord.document_sha256, /^[a-f0-9]{64}$/);
    const safeScan = JSON.stringify(realRecord.scan_result);
    assert.equal(safeScan.includes('SYNTHETIC PERSON'), false); assert.equal(safeScan.includes('1990-03-15'), false); assert.equal(safeScan.includes(syntheticPng.toString('base64')), false);
    assert.equal(active, 0);

    for (const [statement, params, code] of [
      ["UPDATE account_credentials SET status='automatically_verified' WHERE user_id=$1", [patientId], '23514'],
      ["UPDATE account_credentials SET scan_status='automatically_verified' WHERE user_id=$1", [patientId], '23514'],
      ["UPDATE account_credentials SET verification_method='automatic_scan' WHERE user_id=$1", [patientId], '23514'],
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
