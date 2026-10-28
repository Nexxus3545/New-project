const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { migratePatientCare, teleconsultSchedulingMigrationSql } = require('../src/utils/migratePatientCare');
const { lockScheduling, assertSchedulingAvailable, findSchedulingConflicts } = require('../src/utils/teleconsultScheduling');

test('the bounded migration runner includes teleconsult scheduling and commits only after it succeeds', async () => {
  const statements = [];
  await migratePatientCare({ query: async (sql) => { statements.push(sql); return { rows: [] }; } });
  assert.equal(statements[0], 'BEGIN');
  assert.ok(statements.includes("SET LOCAL lock_timeout = '5s'"));
  assert.ok(statements.includes("SET LOCAL statement_timeout = '20s'"));
  assert.ok(statements.includes(teleconsultSchedulingMigrationSql));
  assert.equal(statements.at(-1), 'COMMIT');
  const failed = [];
  await assert.rejects(migratePatientCare({ query: async (sql) => {
    failed.push(sql);
    if (sql === teleconsultSchedulingMigrationSql) throw new Error('Scheduling migration failed');
    return { rows: [] };
  } }), /Scheduling migration failed/);
  assert.equal(failed.at(-1), 'ROLLBACK');
  assert.ok(!failed.includes('COMMIT'));
});

test('local PostgreSQL preserves legacy sessions, validates durations, and serializes conflicting bookings', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'This test refuses remote/production databases');
  if (!connectionString) assert.ok(env.DB_NAME && env.DB_USER, 'Explicit local database configuration is required');
  const config = connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  };
  const schema = `mwos_scheduling_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(schema, /^mwos_scheduling_test_[a-f0-9]{16}$/);
  const setup = new Client(config), first = new Client(config), second = new Client(config);
  await setup.connect();
  let schemaCreated = false;
  const clients = [];
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    await setup.query(`SET search_path TO ${schema}`);
    await setup.query(`CREATE TABLE tele_consult_sessions (
      id uuid PRIMARY KEY, clinician_id uuid, patient_id uuid, status text NOT NULL,
      start_at timestamptz, end_at timestamptz, created_at timestamptz DEFAULT now()
    )`);
    await setup.query(`CREATE TABLE appointments (
      id uuid PRIMARY KEY, assigned_to uuid, patient_id uuid, status text NOT NULL,
      scheduled_date date, scheduled_time time
    )`);
    const legacy = crypto.randomUUID(), clinician = crypto.randomUUID(), patient = crypto.randomUUID();
    await setup.query("INSERT INTO tele_consult_sessions (id,status) VALUES ($1,'requested')", [legacy]);
    // Rewrite only the migration's explicit table qualification into an isolated synthetic schema.
    const sql = teleconsultSchedulingMigrationSql.replaceAll('public.tele_consult_sessions', `${schema}.tele_consult_sessions`);
    assert.ok(!sql.includes('public.tele_consult_sessions'));
    await setup.query('BEGIN');
    await setup.query("SET LOCAL lock_timeout = '2s'");
    await setup.query("SET LOCAL statement_timeout = '5s'");
    await setup.query(sql);
    await setup.query(sql);
    await setup.query('COMMIT');
    assert.deepEqual((await setup.query('SELECT id, status, preferred_start_at, duration_minutes FROM tele_consult_sessions WHERE id=$1', [legacy])).rows,
      [{ id: legacy, status: 'requested', preferred_start_at: null, duration_minutes: 30 }]);
    for (const duration of [15, 30, 45, 60]) {
      await setup.query('UPDATE tele_consult_sessions SET duration_minutes=$1 WHERE id=$2', [duration, legacy]);
    }
    for (const duration of [0, 20, 90]) {
      await assert.rejects(setup.query('UPDATE tele_consult_sessions SET duration_minutes=$1 WHERE id=$2', [duration, legacy]), { code: '23514' });
    }
    await assert.rejects(setup.query('UPDATE tele_consult_sessions SET duration_minutes=NULL WHERE id=$1', [legacy]), { code: '23502' });
    await setup.query("UPDATE tele_consult_sessions SET preferred_start_at='2030-01-01T02:00:00Z', duration_minutes=30 WHERE id=$1", [legacy]);
    await setup.query(sql);
    assert.equal((await setup.query('SELECT preferred_start_at FROM tele_consult_sessions WHERE id=$1', [legacy])).rows[0].preferred_start_at.toISOString(), '2030-01-01T02:00:00.000Z');

    for (const client of [first, second]) {
      await client.connect();
      clients.push(client);
      await client.query(`SET search_path TO ${schema}`);
      await client.query("SET statement_timeout = '5s'");
    }
    const slot = { clinicianId: clinician, patientId: patient, startAt: '2030-01-01T02:00:00Z', durationMinutes: 30 };
    // Transaction A reserves a video slot. Transaction B must wait before checking an overlapping clinic visit.
    await first.query('BEGIN');
    await second.query('BEGIN');
    await lockScheduling(first);
    await assertSchedulingAvailable(first, slot);
    const videoId = crypto.randomUUID();
    await first.query("INSERT INTO tele_consult_sessions (id,clinician_id,patient_id,status,start_at,duration_minutes) VALUES ($1,$2,$3,'scheduled',$4,30)", [videoId, clinician, patient, slot.startAt]);
    let secondAcquired = false;
    const competing = (async () => {
      await lockScheduling(second);
      secondAcquired = true;
      try {
        await assertSchedulingAvailable(second, { ...slot, patientId: crypto.randomUUID(), startAt: '2030-01-01T02:15:00Z' });
      } finally { await second.query('ROLLBACK'); }
    })();
    // Attach rejection handling before releasing A to avoid an unhandled-rejection race.
    const rejection = assert.rejects(competing, (error) => error.code === 'SCHEDULE_CONFLICT' && error.statusCode === 409 && error.conflicts[0].kind === 'teleconsult');
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(secondAcquired, false, 'A competing booking cannot check availability before the reservation commits');
    await first.query('COMMIT');
    await rejection;
    assert.equal(secondAcquired, true);
    // Adjacent half-open slots are allowed; legacy requests do not reserve a confirmed slot.
    assert.deepEqual(await findSchedulingConflicts(setup, { ...slot, startAt: '2030-01-01T02:30:00Z' }), []);
    const appointmentId = crypto.randomUUID();
    await setup.query("INSERT INTO appointments (id,assigned_to,patient_id,status,scheduled_date,scheduled_time) VALUES ($1,$2,$3,'confirmed','2030-01-01','11:00:00')", [appointmentId, clinician, patient]);
    const conflicts = await findSchedulingConflicts(setup, { ...slot, startAt: '2030-01-01T03:15:00Z' });
    assert.deepEqual(conflicts, [{ kind: 'appointment', startAt: '2030-01-01T03:00:00.000Z', endAt: '2030-01-01T03:30:00.000Z' }]);
    assert.deepEqual(Object.keys(conflicts[0]), ['kind', 'startAt', 'endAt'], 'Conflict details do not reveal patient or clinician identities');
  } finally {
    for (const client of clients) { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
    if (schemaCreated) await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    await setup.end();
  }
});
