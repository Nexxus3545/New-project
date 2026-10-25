const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { issuedAfterRevocation } = require('../src/utils/sessionRevocation');

test('session revocation rejects old and legacy tokens but allows a newly issued session', () => {
  const revoked = new Date('2026-10-25T00:00:00.500Z');
  assert.equal(issuedAfterRevocation({ iat: revoked.getTime() / 1000 - 60 }, revoked), false);
  assert.equal(issuedAfterRevocation({ issuedAtMs: revoked.getTime() }, revoked), false);
  assert.equal(issuedAfterRevocation({ issuedAtMs: revoked.getTime() + 1 }, revoked), true);
  assert.equal(issuedAfterRevocation({}, revoked), false);
  assert.equal(issuedAfterRevocation({}, null), true);
});

const runtime = (database, mailer) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/accountSecurity.controller.js'), 'utf8'), {
    module, Buffer, Date, process: { env: { JWT_SECRET: 'synthetic-account-security-secret' } },
    require(name) {
      if (name === '../config/database') return database;
      if (name === '../utils/mailer') return mailer;
      if (name === '../utils/googleEmailVerification') return { maskEmail: () => 'v***@example.invalid' };
      return require(name);
    },
  });
  return module.exports;
};
const invoke = async (handler, path, body, id) => {
  const response = { status: 200 };
  await handler({ path, body, user: id ? { id } : undefined }, {
    status(code) { response.status = code; return this; }, json(body) { response.body = body; },
  }, (error) => { throw error; });
  return response;
};

test('unavailable email and invalid actions cannot create or close accounts', async () => {
  const controller = runtime({ getClient() { throw new Error('Must not query'); } }, { isEmailConfigured: () => false });
  assert.equal((await invoke(controller.requestCode, '/account/security/request', { purpose: 'delete' }, 'fixture')).status, 503);
  assert.equal((await invoke(controller.requestCode, '/account/security/request', { purpose: 'erase_clinical_records' }, 'fixture')).status, 400);
  assert.equal((await invoke(controller.confirm, '/account/security/confirm', { requestId: 'not-a-uuid', code: '123456' }, 'fixture')).status, 400);
});

test('PostgreSQL verifies closure, bounded codes, ownership, reactivation, review and additive migration without clinic writes', { skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1' }, async () => {
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'Never use a remote clinic database');
  const client = new Client(connectionString ? { connectionString } : { host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD });
  await client.connect();
  const schema = `mwos_security_test_${crypto.randomBytes(6).toString('hex')}`;
  const owner = crypto.randomUUID(), other = crypto.randomUUID(), noticeId = crypto.randomUUID();
  let held = false, available = true, failMail = false;
  const sent = [];
  const run = async (sql, parameters) => {
    if (sql === 'BEGIN') return client.query('SAVEPOINT account_action');
    if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT account_action');
    if (sql === 'ROLLBACK') { await client.query('ROLLBACK TO SAVEPOINT account_action'); return client.query('RELEASE SAVEPOINT account_action'); }
    return client.query(sql, parameters);
  };
  const controller = runtime({ query: (...args) => client.query(...args), getClient: async () => { assert.equal(held, false); held = true; return { query: run, release() { held = false; } }; } }, {
    isEmailConfigured: () => available,
    async sendMail(message) { assert.equal(held, false, 'Release the only database connection before sending'); sent.push(message); if (failMail) throw new Error('Synthetic mail rejection'); },
  });
  const request = (purpose, extra = {}, userId = owner, route = '/account/security/request') => invoke(controller.requestCode, route, { purpose, ...extra }, userId);
  const verify = (requestId, code, userId = owner, route = '/account/security/confirm') => invoke(controller.confirm, route, { requestId, code }, userId);
  const code = () => sent.at(-1).text.match(/ is (\d{6})\./)[1];
  const coolDown = () => client.query("UPDATE account_security_requests SET created_at = NOW() - INTERVAL '2 minutes'");
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query('CREATE TABLE users (id uuid PRIMARY KEY, email text, first_name text, last_name text, password text, role text, is_active boolean, refresh_token text, updated_at timestamptz)');
    await client.query('CREATE TABLE oauth_identities (user_id uuid, provider text, provider_email text)');
    await client.query('CREATE TABLE audit_logs (user_id uuid, action text, entity_type text, entity_id uuid)');
    await client.query('CREATE TABLE notifications (id uuid DEFAULT uuid_generate_v4(), user_id uuid, title text, body text, type text, channel text, metadata jsonb)');
    const migration = fs.readFileSync(path.join(__dirname, '../src/config/account-security.sql'), 'utf8');
    await client.query(migration); await client.query(migration);
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'account_security_requests'::regclass")).rows[0].relrowsecurity, true);
    await client.query("INSERT INTO users VALUES ($1,'changed@example.invalid','Test','Patient','random','patient',TRUE,'old-refresh',NOW(),NULL),($2,'admin@example.invalid','Test','Admin','random','admin',TRUE,NULL,NOW(),NULL)", [owner, other]);
    await client.query("INSERT INTO oauth_identities VALUES ($1,'google','original@example.invalid')", [owner]);
    await client.query(`INSERT INTO notifications (id,user_id,metadata) VALUES ($1,$2,'{"event":"google_sign_in"}')`, [noticeId, owner]);
    const wrongNotice = await request('sign_in_confirm', { noticeId }, other);
    assert.equal(wrongNotice.status, 403); assert.equal(sent.length, 0);
    const review = await request('sign_in_confirm', { noticeId });
    assert.equal(review.status, 200); assert.equal(sent.at(-1).to, 'original@example.invalid');
    const reviewCode = code();
    assert.equal((await verify(review.body.data.requestId, reviewCode, other)).status, 400);
    assert.equal((await verify(review.body.data.requestId, reviewCode)).status, 200);
    assert.equal((await client.query('SELECT metadata FROM notifications WHERE id = $1', [noticeId])).rows[0].metadata.reviewResult, 'confirmed');
    assert.equal((await verify(review.body.data.requestId, reviewCode)).status, 400, 'Code is single-use');
    assert.equal((await request('deactivate')).status, 429, 'Email cooldown cannot be bypassed');
    await coolDown();
    const deactivate = await request('deactivate');
    assert.equal((await client.query('SELECT is_active FROM users WHERE id = $1', [owner])).rows[0].is_active, true, 'Sending a code never closes access');
    const deactivateCode = code();
    const stored = (await client.query('SELECT code_hash FROM account_security_requests WHERE id = $1', [deactivate.body.data.requestId])).rows[0].code_hash;
    assert.equal(stored.includes(deactivateCode), false);
    assert.equal((await verify(deactivate.body.data.requestId, deactivateCode)).body.data.signOut, true);
    const closed = (await client.query('SELECT is_active,refresh_token,sessions_revoked_at FROM users WHERE id = $1', [owner])).rows[0];
    assert.equal(closed.is_active, false); assert.equal(closed.refresh_token, null); assert.ok(closed.sessions_revoked_at);
    await coolDown();
    const reactivate = await request(null, { email: 'changed@example.invalid' }, null, '/account/reactivate/request');
    assert.equal((await verify(reactivate.body.data.requestId, code(), null, '/account/reactivate/confirm')).status, 200);
    assert.equal((await client.query('SELECT is_active FROM users WHERE id = $1', [owner])).rows[0].is_active, true);
    await coolDown();
    const attempts = await request('delete');
    const realCode = code(), wrongCode = realCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) assert.equal((await verify(attempts.body.data.requestId, wrongCode)).status, 400);
    assert.equal((await verify(attempts.body.data.requestId, realCode)).status, 400, 'Exhausted codes stay invalid');
    await coolDown();
    failMail = true;
    const failed = await request('delete');
    assert.equal(failed.status, 503);
    assert.equal((await client.query('SELECT is_active FROM users WHERE id = $1', [owner])).rows[0].is_active, true);
    await coolDown(); failMail = false;
    const deletion = await request('delete');
    assert.equal((await verify(deletion.body.data.requestId, code())).status, 200);
    assert.equal((await client.query("SELECT COUNT(*) FROM notifications WHERE metadata->>'event' = 'account_deletion_request' AND user_id = $1", [other])).rows[0].count, '1');
    await coolDown();
    const sentBefore = sent.length;
    const deniedRecovery = await request(null, { email: 'changed@example.invalid' }, null, '/account/reactivate/request');
    assert.equal(deniedRecovery.status, 200); assert.equal(sent.length, sentBefore, 'Deletion cannot be bypassed through reactivation');
    assert.equal((await verify(deniedRecovery.body.data.requestId, '123456', null, '/account/reactivate/confirm')).status, 400);
    assert.equal((await client.query('SELECT COUNT(*) FROM users')).rows[0].count, '2', 'No account or record is erased');
    available = false;
    assert.equal((await request('delete')).status, 503);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
