const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('dashboard and birth report reconcile real categories, date boundaries and audit-independent counts', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'This test refuses remote databases');
  const { Client } = require('pg');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME,
    user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  });
  await client.connect();
  const database = require('../src/config/database');
  const originalQuery = database.query;
  const controllerPath = require.resolve('../src/controllers/report.controller');
  const previousController = require.cache[controllerPath];
  try {
    await client.query('BEGIN');
    // A non-clinic session zone must not move the Manila reporting boundaries.
    await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
    // Only connection-local temporary tables are written; clinic rows are never used.
    await client.query(`
      CREATE TEMP TABLE patients (id uuid, first_name text, last_name text, risk_level text) ON COMMIT DROP;
      CREATE TEMP TABLE pregnancies (status text) ON COMMIT DROP;
      CREATE TEMP TABLE appointments (scheduled_date date, scheduled_time time, status text, appointment_type text, patient_id uuid) ON COMMIT DROP;
      CREATE TEMP TABLE deliveries (delivery_date date, delivery_type text, birth_recorded boolean, birth_weight_kg numeric) ON COMMIT DROP;
      CREATE TEMP TABLE billing (payment_status text) ON COMMIT DROP;
      CREATE TEMP TABLE inventory (quantity numeric, reorder_level numeric, category text) ON COMMIT DROP;
      CREATE TEMP TABLE vitals (created_at timestamptz, bp_systolic integer, bp_diastolic integer, fetal_movement text) ON COMMIT DROP;
      CREATE TEMP TABLE conversation_participants (user_id uuid, thread_id uuid, last_read_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE conversation_threads (id uuid) ON COMMIT DROP;
      CREATE TEMP TABLE conversation_messages (thread_id uuid, sender_id uuid, created_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE care_tasks (status text, assigned_to uuid) ON COMMIT DROP;
      CREATE TEMP TABLE users (last_login_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE media_feed_posts (is_published boolean) ON COMMIT DROP;
      CREATE TEMP TABLE patient_documents (id uuid) ON COMMIT DROP;
      CREATE TEMP TABLE reviews (rating numeric, is_published boolean) ON COMMIT DROP;
      CREATE TEMP TABLE backup_logs (created_at timestamptz, status text) ON COMMIT DROP;
      CREATE TEMP TABLE audit_logs (created_at timestamptz) ON COMMIT DROP;
    `);
    assert.equal((await client.query("SELECT 'deliveries'::regclass::oid = 'pg_temp.deliveries'::regclass::oid AS isolated")).rows[0].isolated, true);
    await client.query(`
      INSERT INTO pg_temp.deliveries VALUES
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, 'NSD', true, 3.0),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, 'CS', true, 3.2),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, 'Forceps', true, 2.8),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, 'Vacuum', true, 3.1),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, NULL, true, NULL),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date, 'NSD', false, NULL),
        ((NOW() AT TIME ZONE 'Asia/Manila')::date + 1, 'CS', true, 9),
        (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date) - INTERVAL '5 months', 'Forceps', true, 2.9),
        (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date) - INTERVAL '5 months' - INTERVAL '1 day', 'Vacuum', true, 3.0),
        (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date) - INTERVAL '11 months', 'NSD', true, 3.3),
        (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila')::date) - INTERVAL '11 months' - INTERVAL '1 day', 'NSD', true, 8);
      INSERT INTO pg_temp.audit_logs VALUES (NOW());
    `);
    database.query = (sql, params) => client.query(sql, params);
    delete require.cache[controllerPath];
    const { getDashboard, getBirthsMonthly } = require(controllerPath);
    const invoke = async (handler) => {
      let response;
      let failure;
      await handler({ user: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' } },
        { json: (payload) => { response = payload; } }, (error) => { failure = error; });
      assert.equal(failure, undefined);
      assert.equal(response.success, true);
      return response.data;
    };
    const dashboard = await invoke(getDashboard);
    const months = await invoke(getBirthsMonthly);
    assert.equal(dashboard.stats.deliveriesThisMonth, 5, 'Only recorded births through today enter the current-month total');
    assert.equal(dashboard.deliveryTrend.reduce((total, row) => total + Number(row.total), 0), 6, 'Six-month boundary includes its first day and excludes older records');
    assert.equal(months.reduce((total, row) => total + Number(row.total), 0), 8, 'Twelve-month boundary includes its first day and excludes older/future/non-birth rows');
    const latest = months.at(-1);
    assert.deepEqual(['nsd', 'cs', 'forceps', 'vacuum', 'unknown'].map((key) => Number(latest[key])), [1, 1, 1, 1, 1]);
    assert.equal(Number(latest.avg_birth_weight), 3.025, 'Missing weight is excluded from the average');
    for (const row of [...dashboard.deliveryTrend, ...months]) {
      assert.equal(Number(row.total), ['nsd', 'cs', 'forceps', 'vacuum', 'unknown'].reduce((total, key) => total + Number(row[key]), 0));
    }
    const currentDashboard = dashboard.deliveryTrend.at(-1);
    for (const key of ['total', 'nsd', 'cs', 'forceps', 'vacuum', 'unknown']) assert.equal(currentDashboard[key], latest[key]);
    await client.query('INSERT INTO pg_temp.audit_logs SELECT NOW() FROM generate_series(1, 100)');
    const afterActivity = await invoke(getDashboard);
    assert.deepEqual(afterActivity.stats, dashboard.stats, 'Audit activity cannot change clinical counts');
    assert.deepEqual(afterActivity.deliveryTrend, dashboard.deliveryTrend);
    assert.equal(afterActivity.usageTrend.reduce((total, row) => total + row.events, 0), 101);
    assert.deepEqual(await invoke(getBirthsMonthly), months);
  } finally {
    database.query = originalQuery;
    if (previousController) require.cache[controllerPath] = previousController;
    else delete require.cache[controllerPath];
    await client.query('ROLLBACK');
    await client.end();
    await database.pool.end();
  }
});
