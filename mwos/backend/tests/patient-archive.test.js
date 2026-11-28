const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const patientId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const controllerSource = fs.readFileSync(path.join(__dirname, '../src/controllers/patient.controller.js'), 'utf8');
const workflowValidation = require('../src/utils/workflowValidation');

function makePatientController(database) {
  const module = { exports: {} };
  vm.runInNewContext(controllerSource, {
    module,
    require(name) {
      if (name === '../config/database') return database;
      if (name === '../utils/workflowValidation') return workflowValidation;
      return {};
    },
  });
  return module.exports;
}

async function archive({ active = true, archived = true, openVisit = false, auditError = false, patient = true } = {}) {
  const calls = [];
  let released = false;
  let response;
  let error;
  const { setArchiveStatus: handler } = makePatientController({ getClient: async () => ({
    async query(sql, args) {
      calls.push({ sql, args: JSON.parse(JSON.stringify(args ?? [])) });
      if (/^SELECT id, is_active FROM patients/.test(sql)) {
        return { rows: patient ? [{ id: patientId, is_active: active }] : [] };
      }
      if (sql.includes('FROM patient_visits')) return { rowCount: openVisit ? 1 : 0 };
      if (/^UPDATE patients/.test(sql)) return { rows: [{ id: patientId, is_active: args[0] }] };
      if (auditError && /^INSERT INTO audit_logs/.test(sql)) throw new Error('Audit unavailable');
    },
    release() { released = true; },
  }) });
  await handler({ params: { id: patientId }, user: { id: actorId }, body: { archived }, requestId: 'fixture' }, {
    json(body) { response = JSON.parse(JSON.stringify(body)); },
  }, problem => { error = problem; });
  return { calls, released, response, error };
}

test('archiving locks the same patient record as check-in and audits only the status change', async () => {
  const { calls, released, response, error } = await archive();
  assert.equal(error, undefined);
  assert.equal(released, true);
  assert.deepEqual(response, { success: true, data: { id: patientId, is_active: false } });
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /FROM patients WHERE id = \$1 FOR UPDATE/);
  assert.match(calls[2].sql, /FROM patient_visits.*status = 'open'/);
  assert.match(calls[3].sql, /^UPDATE patients SET is_active = \$1, updated_at = NOW\(\)/);
  assert.deepEqual(calls[3].args, [false, patientId]);
  assert.deepEqual(calls[4].args, [actorId, 'patient_archived', patientId, { is_active: true }, { is_active: false }, 'fixture']);
  assert.equal(calls[5].sql, 'COMMIT');
  assert.ok(calls.every(({ sql }) => !sql.includes('UPDATE users')));
});

test('restore uses the same patient ID and retries do not duplicate audit events', async () => {
  const restored = await archive({ active: false, archived: false });
  assert.deepEqual(restored.response.data, { id: patientId, is_active: true });
  assert.equal(restored.calls.find(({ sql }) => /INSERT INTO audit_logs/.test(sql)).args[1], 'patient_restored');
  assert.ok(restored.calls.every(({ sql }) => !sql.includes('patient_visits')));

  const retried = await archive({ active: false });
  assert.deepEqual(retried.response.data, { id: patientId, is_active: false });
  assert.equal(retried.calls.length, 3);
  assert.equal(retried.calls.at(-1).sql, 'COMMIT');
});

test('rejects malformed requests, missing records, and open visits without writing', async () => {
  const invalid = await archive({ archived: 'true' });
  assert.equal(invalid.error.statusCode, 400);
  assert.equal(invalid.calls.length, 0);

  for (const [options, status] of [[{ patient: false }, 404], [{ openVisit: true }, 409]]) {
    const rejected = await archive(options);
    assert.equal(rejected.error.statusCode, status);
    assert.ok(rejected.calls.every(({ sql }) => !/^(INSERT|UPDATE)/.test(sql)));
    assert.equal(rejected.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(rejected.released, true);
  }
});

test('an audit failure rolls back the status change', async () => {
  const { calls, response, error, released } = await archive({ auditError: true });
  assert.equal(response, undefined);
  assert.equal(error.message, 'Audit unavailable');
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(released, true);
});

test('staff-only user operations and patient archive retain separate server-side guards', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf8');
  assert.match(routes, /router\.patch\('\/patients\/:id\/archive', authenticate, authorizePermission\('patients:write'\), patientCtrl\.setArchiveStatus\)/);
  assert.match(routes, /\['all', 'staff'\]\) === 'staff'\) \{\s+conditions\.push\("u\.role IN \('admin', 'doctor', 'nurse', 'midwife'\)"\)/);
  assert.match(routes, /HAVING count\(\*\) = 1\s+\) linked_patient ON u\.role = 'patient'/);
  assert.match(routes, /UPDATE users SET is_active = NOT is_active[^`]+WHERE id = \$1 AND role IN \('admin', 'doctor', 'nurse', 'midwife'\)/);
});

test('archive and restore run against real PostgreSQL without changing demo records', {
  skip: process.env.MWOS_RUN_LOCAL_ARCHIVE_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const { connection, inspectDatabase } = require('../src/utils/demo/runtime');
  const client = new Client(connection());
  await client.connect();
  try {
    assert.ok(await inspectDatabase(client), 'Expected the marked local fictional demo database');
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE patients (id uuid PRIMARY KEY, is_active boolean NOT NULL, updated_at timestamptz)');
    await client.query('CREATE TEMP TABLE patient_visits (patient_id uuid, status text)');
    await client.query('CREATE TEMP TABLE pregnancies (id uuid PRIMARY KEY, patient_id uuid, status text)');
    await client.query('CREATE TEMP TABLE deliveries (patient_id uuid, pregnancy_id uuid, birth_recorded boolean, status text)');
    await client.query('CREATE TEMP TABLE audit_logs (user_id uuid, action text, entity_type text, entity_id uuid, old_values jsonb, new_values jsonb, request_id text)');
    await client.query('INSERT INTO pg_temp.patients (id, is_active) VALUES ($1, true)', [patientId]);
    const { setArchiveStatus: handler } = makePatientController({ getClient: async () => ({
      async query(sql, args) {
        if (sql === 'BEGIN') return client.query('SAVEPOINT archive_action');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT archive_action');
        if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT archive_action');
        return client.query(sql, args);
      },
      release() {},
    }) });
    const setArchived = async archived => {
      let data;
      await handler({ user: { id: actorId }, params: { id: patientId }, body: { archived } }, {
        json(payload) { data = payload.data; },
      }, error => { throw error; });
      return JSON.parse(JSON.stringify(data));
    };

    await client.query("INSERT INTO pg_temp.patient_visits VALUES ($1, 'open')", [patientId]);
    await assert.rejects(setArchived(true), { statusCode: 409 });
    await client.query("UPDATE pg_temp.patient_visits SET status = 'completed' WHERE patient_id = $1", [patientId]);
    await client.query("INSERT INTO pg_temp.pregnancies VALUES ($1, $2, 'active')", [actorId, patientId]);
    await client.query("INSERT INTO pg_temp.deliveries VALUES ($1, $2, false, 'active')", [patientId, actorId]);
    await assert.rejects(setArchived(true), { statusCode: 409 });
    await client.query('UPDATE pg_temp.deliveries SET birth_recorded = true WHERE patient_id = $1', [patientId]);
    assert.deepEqual(await setArchived(true), { id: patientId, is_active: false });
    assert.deepEqual(await setArchived(true), { id: patientId, is_active: false });
    assert.deepEqual(await setArchived(false), { id: patientId, is_active: true });
    const { rows } = await client.query('SELECT action, old_values, new_values FROM pg_temp.audit_logs ORDER BY action');
    assert.deepEqual(rows, [
      { action: 'patient_archived', old_values: { is_active: true }, new_values: { is_active: false } },
      { action: 'patient_restored', old_values: { is_active: false }, new_values: { is_active: true } },
    ]);
    assert.equal((await client.query('SELECT status FROM pg_temp.patient_visits WHERE patient_id = $1', [patientId])).rows[0].status, 'completed');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('PostgreSQL patient lookup finds both name forms, clinic codes, and an exact record UUID', {
  skip: process.env.MWOS_RUN_LOCAL_ARCHIVE_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const { connection, inspectDatabase } = require('../src/utils/demo/runtime');
  const client = new Client(connection());
  await client.connect();
  try {
    assert.ok(await inspectDatabase(client), 'Expected the marked local fictional demo database');
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE patients (
      id uuid, first_name text, middle_name text, last_name text, suffix text, patient_code text, birthing_id text,
      philhealth_id text, valid_id_number text, phone text, is_active boolean, created_at timestamptz, date_of_birth date
    )`);
    await client.query('CREATE TEMP TABLE appointments (patient_id uuid, status text, scheduled_date date)');
    await client.query('CREATE TEMP TABLE patient_visits (patient_id uuid, status text, updated_at timestamptz)');
    await client.query('CREATE TEMP TABLE pregnancies (id uuid, patient_id uuid, status text, edd date, created_at timestamptz)');
    await client.query('CREATE TEMP TABLE deliveries (patient_id uuid, delivery_code text, delivery_date date, created_at timestamptz)');
    await client.query(`INSERT INTO pg_temp.patients (id, first_name, middle_name, last_name, suffix, patient_code, birthing_id, is_active, created_at, date_of_birth)
      VALUES ($1, 'Alba', 'Sample', 'Rivera', 'Jr.', 'DEMO-PAT_001', 'DEMO-BIRTH-001', false, NOW(), DATE '1990-01-01')`, [patientId]);
    const { getAll } = makePatientController({ query: (sql, args) => client.query(sql, args) });
    const recordsFor = async (search, status = 'archived') => {
      let result;
      await getAll({ query: { search, status } }, { json(payload) { result = payload; } }, error => { throw error; });
      return result.data.map(row => row.id);
    };

    for (const search of ['albA rivera', 'ALBA  sample rivera JR.', 'PAT_001', 'birth-001', patientId]) {
      assert.deepEqual(await recordsFor(search), [patientId], search);
    }
    for (const search of ['Alba %', 'PAT%001', '111111111111']) {
      assert.deepEqual(await recordsFor(search), [], search);
    }
    assert.deepEqual(await recordsFor('Alba', 'active'), []);
    assert.deepEqual(await recordsFor('Alba', 'inactive'), [patientId]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
