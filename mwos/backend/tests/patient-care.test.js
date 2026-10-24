const assert = require('node:assert/strict');
const { test, after, beforeEach } = require('node:test');
const { normalizePatientCare } = require('../src/utils/patientCare');
const { migratePatientCare } = require('../src/utils/migratePatientCare');

test('care selection is independent from gender and legacy records are not guessed', () => {
  assert.deepEqual(normalizePatientCare({}), {});
  assert.deepEqual(normalizePatientCare({}, { newPatient: true }), { gender: null, careType: 'general' });
  for (const gender of ['male', 'female', 'other', 'prefer_not_to_say']) {
    assert.deepEqual(normalizePatientCare({ gender, careType: 'general' }), { gender, careType: 'general' });
  }
  assert.equal(normalizePatientCare({ gender: 'male', careType: 'maternal' }).careType, 'maternal');
  for (const payload of [{ gender: 'invalid' }, { careType: 'pregnant' }, { gender: {} }]) {
    assert.throws(() => normalizePatientCare(payload), { statusCode: 400 });
  }
});

test('migration is transactional, bounded, and rolls back on error', async () => {
  const statements = [];
  await assert.rejects(migratePatientCare({ query: async (sql) => {
    statements.push(sql);
    if (sql.includes('ALTER TABLE')) throw new Error('locked');
  } }), /locked/);
  assert.equal(statements[0], 'BEGIN');
  assert.ok(statements.includes("SET LOCAL lock_timeout = '5s'"));
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.ok(!statements.includes('COMMIT'));
});

const database = require('../src/config/database');
const originalQuery = database.query;
let statements;
let ownsPatient;
let pregnancyMatches;
let hasProfile;
database.query = async (sql, params = []) => {
  statements.push({ sql, params });
  if (sql.startsWith('SELECT id FROM patients')) return { rows: hasProfile ? [{ id: ownsPatient ? 'patient-1' : 'other-patient' }] : [] };
  if (sql.startsWith('SELECT id FROM pregnancies')) return { rows: pregnancyMatches ? [{ id: 'pregnancy-1' }] : [] };
  if (sql.startsWith('SELECT id FROM appointments')) return { rows: [] };
  if (sql.startsWith('INSERT INTO appointments')) return { rows: [{ id: 'appointment-1', appointment_type: params[3], pregnancy_id: params[1] }] };
  throw new Error(`Unexpected query: ${sql}`);
};
const controller = require('../src/controllers/appointment.controller');
beforeEach(() => { statements = []; ownsPatient = true; pregnancyMatches = true; hasProfile = true; });
after(async () => { database.query = originalQuery; await database.pool.end(); });

async function invoke(handler, body = {}) {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(payload) { result.payload = payload; } };
  await handler({ user: { id: 'user-1', role: 'patient' }, query: {}, body: { patientId: 'patient-1', scheduledDate: '2026-11-01', scheduledTime: '09:00', ...body } }, res, (error) => { throw error; });
  return result;
}

test('general checkup is the default and is never attached to a pregnancy', async () => {
  const result = await invoke(controller.create);
  assert.equal(result.status, 201);
  assert.equal(result.payload.data.appointment_type, 'consultation');
  assert.equal(result.payload.data.pregnancy_id, null);
  assert.equal((await invoke(controller.create, { pregnancyId: 'pregnancy-1' })).status, 400);
});

test('maternal appointments require an owned pregnancy when supplied, not a gender guess', async () => {
  assert.equal((await invoke(controller.create, { appointmentType: 'prenatal' })).status, 201);
  pregnancyMatches = false;
  assert.equal((await invoke(controller.create, { appointmentType: 'prenatal', pregnancyId: 'pregnancy-1' })).status, 400);
});

test('patient appointments cannot access or book someone else\'s record', async () => {
  ownsPatient = false;
  assert.equal((await invoke(controller.create)).status, 403);
  assert.ok(!statements.some(({ sql }) => sql.startsWith('INSERT')));
  hasProfile = false;
  const empty = await invoke(controller.getAll);
  assert.deepEqual(empty.payload.data, []);
});
