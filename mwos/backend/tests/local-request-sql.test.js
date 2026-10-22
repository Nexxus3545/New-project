const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('local PostgreSQL enforces the request-reference conflict without touching clinic tables', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const dotenv = require('dotenv');
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'This test refuses all remote/production databases');
  if (!connectionString) assert.ok(env.DB_NAME && env.DB_USER, 'Supply explicit local test database configuration');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME,
    user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE conversation_threads (
      id uuid PRIMARY KEY, thread_type text, title text, patient_id uuid, created_by uuid,
      status text, priority text, last_message_at timestamptz
    ) ON COMMIT DROP`);
    const source = fs.readFileSync(path.join(__dirname, '../src/controllers/interaction.controller.js'), 'utf8');
    const statement = source.match(/`(INSERT INTO conversation_threads \(id,[\s\S]*?ON CONFLICT \(id\) DO NOTHING[\s\S]*?RETURNING \*)`/)[1];
    const values = ['44444444-4444-4444-8444-444444444444', 'patient_support', 'Test only', null, null, 'open', 'urgent'];
    assert.equal((await client.query(statement, values)).rowCount, 1);
    assert.equal((await client.query(statement, values)).rowCount, 0);
    assert.equal((await client.query('SELECT count(*)::int AS total FROM pg_temp.conversation_threads')).rows[0].total, 1);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
