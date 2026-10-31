const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getTeleconsultProviders, isTeleconsultProviderAvailable } = require('../src/utils/teleconsultProviders');

const admin = { id: '11111111-1111-4111-8111-111111111111', role: 'admin', first_name: 'Test', last_name: 'Coordinator', is_active: true };
const professional = { id: '22222222-2222-4222-8222-222222222222', role: 'doctor', first_name: 'Test', last_name: 'Clinician',
  is_active: true, license_status: 'verified', license_number: 'TEST-LICENSE', credential_expires_at: '2099-12-31',
  account_credential_kind: 'professional_license', account_credential_status: 'verified', account_credential_license_number: 'TEST-LICENSE',
  account_credential_expires_at: '2099-12-31', account_credential_has_document: true };
const clientWith = rows => ({ query: async () => ({ rows }) });

test('pending, missing, expired or inconsistent professional proof leaves the admin coordination fallback', async () => {
  for (const change of [{ account_credential_status: 'pending' }, { account_credential_has_document: false },
    { license_status: 'suspended' }, { credential_expires_at: '2001-01-01', account_credential_expires_at: '2001-01-01' },
    { account_credential_license_number: 'OTHER' }]) {
    const providers = await getTeleconsultProviders(clientWith([admin, { ...professional, ...change }]));
    assert.equal(providers.length, 1);
    assert.equal(providers[0].id, admin.id);
    assert.equal(providers[0].provider_label, 'Admin · Clinic coordinator');
    assert.equal(providers[0].provider_kind, 'coordination');
  }
});

test('verified doctor, nurse or midwife replaces the fallback without leaking credential details', async () => {
  for (const role of ['doctor', 'nurse', 'midwife']) {
    const providers = await getTeleconsultProviders(clientWith([admin, { ...professional, role }]));
    assert.equal(providers.length, 1);
    assert.equal(providers[0].role, role);
    assert.equal(providers[0].provider_kind, 'clinical');
    assert.equal(JSON.stringify(providers).includes('TEST-LICENSE'), false);
    assert.equal(Object.hasOwn(providers[0], 'account_credential_has_document'), false);
  }
});

test('inactive or nonstaff assignees are rejected; existing active coordinator assignments can finish', async () => {
  const client = clientWith([professional, admin]);
  assert.equal(await isTeleconsultProviderAvailable(client, admin), false);
  assert.equal(await isTeleconsultProviderAvailable(client, admin, { existingAssignment: true }), true);
  assert.equal(await isTeleconsultProviderAvailable(client, { ...admin, is_active: false }, { existingAssignment: true }), false);
  assert.equal(await isTeleconsultProviderAvailable(client, { ...admin, role: 'patient' }), false);
  assert.deepEqual(await getTeleconsultProviders(clientWith([])), []);
});

test('local PostgreSQL verifies active roster, credentials and fallback without changing clinic tables', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const fs = require('node:fs'), path = require('node:path');
  const { Client } = require('pg');
  const env = { ...require('dotenv').parse(fs.readFileSync(process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env'))), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'Local databases only');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL search_path TO pg_temp");
    await client.query(`CREATE TEMP TABLE users (id uuid PRIMARY KEY, first_name text, last_name text, role text, avatar_url text, is_active boolean) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE staff_registry (user_id uuid, license_status text, license_number text, credential_expires_at date) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE account_credentials (user_id uuid, kind text, status text, license_number text, expires_at date, document_bytes bytea) ON COMMIT DROP`);
    await client.query(`INSERT INTO users VALUES ($1, 'Test', 'Admin', 'admin', NULL, true), ($2, 'Test', 'Nurse', 'nurse', NULL, true)`, [admin.id, professional.id]);
    assert.equal((await getTeleconsultProviders(client))[0].id, admin.id);
    await client.query(`INSERT INTO staff_registry VALUES ($1, 'verified', 'TEST-LICENSE', '2099-12-31')`, [professional.id]);
    await client.query(`INSERT INTO account_credentials VALUES ($1, 'professional_license', 'verified', 'TEST-LICENSE', '2099-12-31', $2)`, [professional.id, Buffer.from('synthetic proof')]);
    assert.deepEqual((await getTeleconsultProviders(client)).map(p => p.role), ['nurse']);
    await client.query('UPDATE users SET is_active = false WHERE id = $1', [professional.id]);
    assert.deepEqual((await getTeleconsultProviders(client)).map(p => p.role), ['admin']);
    await client.query('UPDATE users SET is_active = false WHERE id = $1', [admin.id]);
    assert.deepEqual(await getTeleconsultProviders(client), []);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
