const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { migrationSql } = require('../src/utils/migratePatientCare');

test('patient-care migration is repeatable and preserves legacy rows in isolated local tables', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'Remote databases are not permitted for this test');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE patients (id integer PRIMARY KEY) ON COMMIT DROP');
    await client.query("CREATE TEMP TABLE appointments (appointment_type text DEFAULT 'prenatal') ON COMMIT DROP");
    await client.query('INSERT INTO pg_temp.patients (id) VALUES (1)');
    await client.query("INSERT INTO pg_temp.appointments VALUES ('prenatal')");
    assert.equal((await client.query("SELECT 'patients'::regclass::oid = 'pg_temp.patients'::regclass::oid AS isolated")).rows[0].isolated, true);
    await client.query(migrationSql);
    await client.query(migrationSql);
    assert.deepEqual((await client.query('SELECT * FROM pg_temp.patients')).rows, [{ id: 1, gender: null, care_type: null }]);
    await client.query("INSERT INTO pg_temp.patients VALUES (2, 'male', 'general')");
    await client.query('INSERT INTO pg_temp.appointments DEFAULT VALUES');
    assert.deepEqual((await client.query('SELECT appointment_type FROM pg_temp.appointments')).rows.map((row) => row.appointment_type), ['prenatal', 'consultation']);
    await client.query('SAVEPOINT invalid_choice');
    await assert.rejects(client.query("UPDATE pg_temp.patients SET gender = 'invalid' WHERE id = 2"), { code: '23514' });
    await client.query('ROLLBACK TO SAVEPOINT invalid_choice');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
