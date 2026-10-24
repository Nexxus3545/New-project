const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function runtime(query) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/account.controller.js'), 'utf8'), {
    module, exports: module.exports,
    require: (name) => { assert.equal(name, '../config/database'); return { query }; },
  });
  return module.exports.getActivity;
}
async function invoke(handler, user) {
  const result = { status: 200 };
  const res = { set(name, value) { result[name] = value; }, status(code) { result.status = code; return this; }, json(body) { result.body = body; } };
  await handler({ user, query: { userId: 'someone-else', limit: 9999 }, params: { id: 'someone-else' } }, res, (error) => { result.error = error; });
  return result;
}

test('activity rejects unauthenticated requests before querying', async () => {
  const result = await invoke(runtime(() => { throw new Error('Must not query'); }));
  assert.equal(result.status, 401);
  assert.equal(result['Cache-Control'], 'no-store');
  assert.equal(result.body.success, false);
});

test('activity scopes both bounded query branches to authenticated identity, not client IDs', async () => {
  let calls = 0;
  const result = await invoke(runtime(async (sql, parameters) => {
    calls += 1;
    assert.deepEqual(Array.from(parameters), ['own-user']);
    assert.equal((sql.match(/WHERE user_id = \$1/g) || []).length, 2);
    assert.equal((sql.match(/LIMIT 50/g) || []).length, 3);
    assert.match(sql, /metadata->>'event' = 'google_sign_in'/);
    assert.doesNotMatch(sql, /SELECT \*|old_values|new_values|ip_address|user_agent|entity_id/i);
    return { rows: [
      { id: 'audit:1', action: 'POST', entity_type: 'appointments', created_at: '2026-10-24T00:00:00Z', new_values: { secret: 'medical-data' }, user_id: 'own-user' },
      { id: 'notice:2', action: 'GOOGLE_SIGN_IN', entity_type: 'account', created_at: '2026-10-23T00:00:00Z', body: 'private message' },
      { id: 'audit:3', action: 'private-action-value', entity_type: 'private-area-value', created_at: null },
    ] };
  }), { id: 'own-user', role: 'patient' });
  assert.equal(calls, 1);
  const body = JSON.parse(JSON.stringify(result.body));
  assert.deepEqual(body.data[0], { id: 'audit:1', action: 'POST', area: 'appointments', createdAt: '2026-10-24T00:00:00Z' });
  assert.equal(body.data[1].action, 'GOOGLE_SIGN_IN');
  assert.equal(body.data[2].area, 'clinic');
  assert.equal(body.data[2].action, 'UPDATE');
  assert.doesNotMatch(JSON.stringify(body), /medical-data|private message|private-action|private-area|user_id|new_values/);
});

test('activity exposes a real empty result and forwards database failures', async () => {
  const empty = await invoke(runtime(async () => ({ rows: [] })), { id: 'staff', role: 'nurse' });
  assert.deepEqual(JSON.parse(JSON.stringify(empty.body)), { success: true, data: [] });
  const error = new Error('Database unavailable');
  const failed = await invoke(runtime(async () => { throw error; }), { id: 'own-user' });
  assert.equal(failed.error, error);
  assert.equal(failed.body, undefined);
});

test('activity route is registered behind the existing authentication middleware', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf8');
  assert.ok(routes.indexOf('router.use(authenticate, activityLogger)') < routes.indexOf("router.get('/account/activity'"));
  assert.match(routes, /router.get\('\/account\/activity', accountCtrl.getActivity\)/);
});

test('local PostgreSQL executes the own-activity union with safe bounds and isolated temporary rows', {
  skip: process.env.MWOS_RUN_LOCAL_SQL_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const envFile = process.env.MWOS_LOCAL_TEST_ENV_FILE || path.join(__dirname, '../.env');
  const env = { ...(fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {}), ...process.env };
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  const host = connectionString ? new URL(connectionString).hostname : env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), 'This test refuses remote databases');
  const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 2000 } : {
    host, port: Number(env.DB_PORT) || 5432, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE audit_logs (id uuid, user_id uuid, action varchar(50), entity_type varchar(50), created_at timestamptz) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE notifications (id uuid, user_id uuid, metadata jsonb, created_at timestamptz) ON COMMIT DROP');
    assert.equal((await client.query("SELECT 'audit_logs'::regclass::oid = 'pg_temp.audit_logs'::regclass::oid AS isolated")).rows[0].isolated, true);
    const own = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const audits = await client.query("INSERT INTO pg_temp.audit_logs SELECT gen_random_uuid(), $1, 'POST', 'appointments', timestamptz '2026-10-24 00:00:00+00' + n * interval '1 minute' FROM generate_series(1,60) n RETURNING id", [own]);
    const notices = await client.query(`INSERT INTO pg_temp.notifications SELECT gen_random_uuid(), $1, '{"event":"google_sign_in"}'::jsonb, timestamptz '2026-10-24 01:00:00+00' + n * interval '1 minute' FROM generate_series(1,10) n RETURNING id`, [own]);
    await client.query("INSERT INTO pg_temp.audit_logs VALUES (gen_random_uuid(), $1, 'DELETE', 'patients', NOW())", [other]);
    await client.query(`INSERT INTO pg_temp.notifications VALUES (gen_random_uuid(), $1, '{"event":"google_sign_in"}', NOW()), (gen_random_uuid(), $2, '{"event":"appointment"}', NOW())`, [other, own]);
    const result = await invoke(runtime((...args) => client.query(...args)), { id: own });
    assert.equal(result.error, undefined);
    assert.equal(result.body.data.length, 50);
    const allowed = new Set([...audits.rows.map((row) => 'audit:' + row.id), ...notices.rows.map((row) => 'notice:' + row.id)]);
    assert.ok(result.body.data.every((row) => allowed.has(row.id)));
    assert.equal(result.body.data.filter((row) => row.action === 'GOOGLE_SIGN_IN').length, 10);
    assert.equal(new Date(result.body.data[0].createdAt).toISOString(), '2026-10-24T01:10:00.000Z');
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
