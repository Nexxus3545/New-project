const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { notificationMigrationSql } = require('../src/utils/migratePatientCare');

test('email migration is additive, repeatable, and keeps delivery data private', { skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1' }, async () => {
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'Remote/production databases are not allowed');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : { host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const schema = `mwos_email_test_${crypto.randomBytes(6).toString('hex')}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query('CREATE TABLE users (id uuid PRIMARY KEY)');
    await client.query('CREATE TABLE notifications (id uuid PRIMARY KEY)');
    await client.query('CREATE TABLE oauth_login_codes (id uuid PRIMARY KEY)');
    const id = crypto.randomUUID();
    await client.query('INSERT INTO oauth_login_codes VALUES ($1)', [id]);
    await client.query(notificationMigrationSql);
    await client.query(notificationMigrationSql);
    const legacy = (await client.query('SELECT id, email_otp_required FROM oauth_login_codes')).rows;
    assert.deepEqual(legacy, [{ id, email_otp_required: false }]);
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'notification_email_events'::regclass")).rows[0].relrowsecurity, true);
    assert.ok(!(await client.query("SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = $1 AND table_name = 'notification_email_events' AND grantee IN ('PUBLIC','anon','authenticated')", [schema])).rows.length);
    await client.query('INSERT INTO users VALUES ($1)', [id]);
    const insert = `INSERT INTO notification_email_events (id,event_key,user_id,subject,text_body,delivery_status) VALUES ($1,'test-event',$2,'Test','No real email','unconfigured') ON CONFLICT (event_key) DO NOTHING RETURNING id`;
    assert.equal((await client.query(insert, [crypto.randomUUID(), id])).rowCount, 1);
    assert.equal((await client.query(insert, [crypto.randomUUID(), id])).rowCount, 0);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
