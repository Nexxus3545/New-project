const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { manilaDateKey } = require('../src/middleware/professionalCredential');
const validation = require('../src/utils/workflowValidation');

const source = readFileSync(join(__dirname, '../src/controllers/ward.controller.js'), 'utf8');
const migration = readFileSync(join(__dirname, '../src/config/migrations/20261128-ward-operations.sql'), 'utf8');
const exampleId = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = { role: 'doctor', id: exampleId(90) };
const assignee = { role: 'nurse', id: exampleId(91) };
const unrelated = { role: 'midwife', id: exampleId(92) };
const portalPatient = { role: 'patient', id: exampleId(93) };

function wardController(query) {
  const module = { exports: {} };
  runInNewContext(source, {
    module,
    require(name) {
      if (name === '../config/database') return { query };
      if (name === '../middleware/professionalCredential') return { manilaDateKey };
      if (name === '../utils/workflowValidation') return validation;
      throw new Error(`Unexpected test dependency: ${name}`);
    },
  });
  return module.exports;
}

async function invoke(handler, input = {}) {
  let status = 200;
  let body;
  let error;
  const headers = {};
  const response = {
    set(key, value) { headers[key] = value; return this; },
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler({ user: owner, query: {}, params: {}, body: {}, ...input }, response, problem => { error = problem; });
  return { status, body, error, headers };
}

test('ward dates, medication tasks and times are validated before storage', async () => {
  const actualQuery = async () => assert.fail('Invalid assignment reached the database');
  const ctrl = wardController(actualQuery);
  const valid = {
    patientId: exampleId(1), assignedTo: assignee.id, category: 'medication',
    title: 'Coordinate medication round', dueDate: '2026-11-28', dueTime: '07:30',
  };
  assert.equal((await invoke(ctrl.getWard, { query: { date: '2026-02-30' } })).error.statusCode, 400);
  for (const change of [{ patientId: 'x' }, { assignedTo: '' }, { category: 'prescription' }, { title: ' ' }, { dueTime: '24:30' }, { dueTime: '8' }]) {
    const { error } = await invoke(ctrl.createWardTask, { body: { ...valid, ...change } });
    assert.equal(error.statusCode, 400);
  }
});

test('ward routes enforce access and legacy care tasks do not expose the ward workflow', () => {
  const routes = readFileSync(join(__dirname, '../src/routes/index.js'), 'utf8');
  const interactions = readFileSync(join(__dirname, '../src/controllers/interaction.controller.js'), 'utf8');
  assert.match(routes, /get\('\/deliveries\/ward', authorize\(\.\.\.wardCtrl\.WARD_STAFF\), authorizePermission\('patients:read'\)/);
  assert.match(routes, /post\('\/deliveries\/ward\/tasks', authorize\(\.\.\.wardCtrl\.WARD_STAFF\), authorizePermission\('communication:write'\)/);
  assert.match(routes, /patch\('\/deliveries\/ward\/tasks\/:id\/complete', authorize\(\.\.\.wardCtrl\.WARD_STAFF\), authorizePermission\('communication:write'\)/);
  assert.match(interactions, /const conditions = \['ct\.ward_category IS NULL'\]/);
  assert.match(interactions, /WHERE id = \$1 AND ward_category IS NULL/);
  assert.ok(!wardController(() => {}).WARD_STAFF.includes('patient'));
});

test('real PostgreSQL deduplicates admissions and stores private assignments and audit events', {
  skip: process.env.MWOS_RUN_LOCAL_WARD_TEST !== '1',
}, async () => {
  const { Client } = require('pg');
  const { connection, inspectDatabase } = require('../src/utils/demo/runtime');
  const pg = new Client(connection());
  await pg.connect();
  try {
    assert.ok(await inspectDatabase(pg), 'Expected the marked local fictional database');
    await pg.query('BEGIN');
    await pg.query(`
      CREATE TEMP TABLE patients (
        id uuid PRIMARY KEY, patient_code text, is_active boolean DEFAULT true,
        first_name text DEFAULT 'Synthetic', last_name text DEFAULT 'Patient', suffix text
      );
      CREATE TEMP TABLE deliveries (
        patient_id uuid, pregnancy_id uuid, delivery_date date, status text, birth_recorded boolean,
        labor_started_at timestamptz
      );
      CREATE TEMP TABLE pregnancies (id uuid, patient_id uuid, status text);
      CREATE TEMP TABLE patient_visits (patient_id uuid, status text, stage text, created_at timestamptz);
      CREATE TEMP TABLE users (
        id uuid PRIMARY KEY, role text, is_active boolean DEFAULT true,
        first_name text DEFAULT 'Synthetic', last_name text DEFAULT 'Staff'
      );
      CREATE TEMP TABLE care_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text,
        patient_id uuid, assigned_to uuid, created_by uuid, status text DEFAULT 'open',
        patient_visible boolean DEFAULT false, due_date date, completed_at timestamptz,
        created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW()
      );
      CREATE TEMP TABLE audit_logs (user_id uuid, action text, entity_type text, entity_id uuid, request_id text);
      SET LOCAL search_path TO pg_temp, public;
    `);
    const tempMigration = migration.replaceAll('public.care_tasks', 'pg_temp.care_tasks');
    assert.doesNotMatch(tempMigration, /public\.care_tasks/);
    await pg.query(tempMigration);
    await pg.query(tempMigration);

    const [overlap, newborn, walkin, future, inactive, historic] = [1, 2, 3, 4, 5, 6].map(exampleId);
    await pg.query('INSERT INTO patients (id, patient_code, is_active) SELECT id, id::text, id <> $2 FROM UNNEST($1::uuid[]) AS id',
      [[overlap, newborn, walkin, future, inactive, historic], inactive]);
    await pg.query(`INSERT INTO pregnancies (id, patient_id, status) VALUES
      ($1,$2,'active'), ($3,$4,'active'), ($5,$6,'delivered')`,
    [exampleId(21), overlap, exampleId(22), future, exampleId(23), historic]);
    await pg.query(`INSERT INTO deliveries (pregnancy_id, patient_id, delivery_date, status, birth_recorded, labor_started_at) VALUES
      ($1,$2,CURRENT_DATE - 1,'active',FALSE,NOW() - INTERVAL '1 day'),
      ($3,$4,CURRENT_DATE + 2,'active',FALSE,NULL),
      ($5,$6,CURRENT_DATE - 4,'completed',TRUE,NOW() - INTERVAL '4 days')`,
    [exampleId(21), overlap, exampleId(22), future, exampleId(23), historic]);
    await pg.query(`INSERT INTO patient_visits (patient_id, status, stage, created_at) VALUES
      ($1,'open','postnatal_monitoring',NOW() - INTERVAL '2 hours'),
      ($2,'open','newborn_monitoring',NOW() - INTERVAL '1 hour'),
      ($3,'open','checked_in',NOW() - INTERVAL '2 days'),
      ($4,'open','labor_monitoring',NOW() - INTERVAL '2 days'),
      ($5,'completed','delivery',NOW() - INTERVAL '4 days')`,
    [overlap, newborn, walkin, inactive, historic]);
    for (const person of [owner, assignee, unrelated, portalPatient, { id: exampleId(94), role: 'nurse' }]) {
      await pg.query('INSERT INTO users (id, role, is_active) VALUES ($1, $2, $3)', [person.id, person.role, person.id !== exampleId(94)]);
    }

    // Serialize requests on this one connection. Runtime requests use the app pool.
    let queued = Promise.resolve();
    const ctrl = wardController((sql, args) => {
      const done = queued.then(() => pg.query(sql, args));
      queued = done.catch(() => {});
      return done;
    });
    const today = manilaDateKey();
    const empty = await invoke(ctrl.getWard, { query: { date: today } });
    if (empty.error) throw empty.error;
    assert.equal(empty.headers['Cache-Control'], 'no-store');
    assert.deepEqual(empty.body.data.admissions.map(row => [row.number, row.patient_id, row.stage]),
      [[1, overlap, 'postnatal_monitoring'], [2, newborn, 'newborn_monitoring']]);
    assert.ok(!empty.body.data.staff.some(person => person.role === 'patient' || person.id === exampleId(94)));

    const fixture = {
      patientId: overlap, assignedTo: assignee.id, category: 'medication',
      title: 'Synthetic coordination assignment', dueDate: today, dueTime: '07:30',
    };
    assert.equal((await invoke(ctrl.createWardTask, { body: { ...fixture, patientId: walkin } })).error.statusCode, 409);
    assert.equal((await invoke(ctrl.createWardTask, { body: { ...fixture, assignedTo: portalPatient.id } })).error.statusCode, 409);
    assert.equal((await invoke(ctrl.createWardTask, { body: { ...fixture, assignedTo: exampleId(94) } })).error.statusCode, 409);
    const saved = await invoke(ctrl.createWardTask, { body: fixture });
    if (saved.error) throw saved.error;
    assert.equal(saved.status, 201);
    const id = saved.body.data.id;
    assert.equal(saved.body.data.due_time, '07:30');
    assert.equal((await pg.query('SELECT patient_visible FROM care_tasks WHERE id = $1', [id])).rows[0].patient_visible, false);

    const ward = await invoke(ctrl.getWard, { user: assignee, query: { date: today } });
    if (ward.error) throw ward.error;
    assert.equal(ward.body.data.tasks[0].assigned_to, assignee.id);
    assert.equal(ward.body.data.tasks[0].can_complete, true);
    assert.equal((await invoke(ctrl.completeWardTask, { user: unrelated, params: { id } })).error.statusCode, 404);

    const complete = await invoke(ctrl.completeWardTask, { user: assignee, params: { id } });
    if (complete.error) throw complete.error;
    assert.equal(complete.body.data.status, 'completed');
    const retry = await invoke(ctrl.completeWardTask, { user: assignee, params: { id } });
    if (retry.error) throw retry.error;
    assert.equal(retry.body.data.completed_at.toISOString(), complete.body.data.completed_at.toISOString());
    assert.deepEqual((await pg.query('SELECT action FROM audit_logs ORDER BY action')).rows.map(row => row.action),
      ['ward_task_assigned', 'ward_task_completed']);
  } finally {
    await pg.query('ROLLBACK').catch(() => {});
    await pg.end();
  }
});
