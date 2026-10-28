const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const userId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const initialMessage = 'Emergency transport request\nTest-only pickup and symptoms';

function harness() {
  const records = new Map();
  const locks = new Map();
  const counts = { clients: 0, releases: 0, messages: 0, notifications: 0 };
  let failNotifications = false;
  const database = {
    query: async () => { throw new Error('Do not acquire another pool connection inside the transaction'); },
    getClient: async () => {
      counts.clients += 1;
      let local = null;
      let released = false;
      const unlock = () => {
        if (local) { locks.get(local.id)?.finish(); locks.delete(local.id); }
      };
      return {
        query: async (sql, params = []) => {
          assert.equal(released, false);
          const text = sql.replace(/\s+/g, ' ').trim();
          if (text === 'BEGIN') return { rows: [] };
          if (text === 'COMMIT') {
            if (local) {
              records.set(local.id, local);
              counts.messages += local.messages.length;
              counts.notifications += local.notifications;
              unlock();
              local = null;
            }
            return { rows: [] };
          }
          if (text === 'ROLLBACK') { unlock(); local = null; return { rows: [] }; }
          if (text.startsWith('SELECT id, first_name, last_name, user_id FROM patients')) {
            return { rows: [{ id: patientId, user_id: userId, first_name: 'Test', last_name: 'Patient' }] };
          }
          if (text.startsWith('SELECT id FROM users WHERE role')) return { rows: [{ id: staffId }] };
          if (text.startsWith('SELECT id FROM users WHERE id')) return { rows: params[0].map((id) => ({ id })) };
          if (text.startsWith('INSERT INTO conversation_threads')) {
            assert.match(text, /ON CONFLICT \(id\) DO NOTHING RETURNING \*/);
            const id = params[0];
            if (locks.has(id)) await locks.get(id).promise;
            if (records.has(id)) return { rows: [] };
            let finish;
            const promise = new Promise((resolve) => { finish = resolve; });
            locks.set(id, { promise, finish });
            local = {
              id, thread_type: params[1], title: params[2], patient_id: params[3], created_by: params[4],
              status: params[5], priority: params[6], created_at: '2026-10-22T10:00:00Z',
              participants: [], messages: [], notifications: 0,
            };
            return { rows: [local] };
          }
          if (text.startsWith('INSERT INTO conversation_participants')) {
            local.participants.push(params[1]); return { rows: [] };
          }
          if (text.startsWith('INSERT INTO conversation_messages')) {
            local.messages.push({ body: params[2] }); return { rows: [] };
          }
          if (text.startsWith('INSERT INTO notifications')) {
            if (failNotifications) throw new Error('Notification write failed');
            local.notifications += 1; return { rows: [] };
          }
          if (text.startsWith('SELECT ct.*')) {
            const row = records.get(params[0]);
            return { rows: row && row.participants.includes(params[1]) ? [row] : [] };
          }
          if (text.startsWith('SELECT u.id, u.first_name')) return { rows: [] };
          if (text.startsWith('SELECT cm.id, cm.body')) return { rows: records.get(params[0])?.messages || [] };
          throw new Error('Unexpected test query: ' + text);
        },
        release: () => { assert.equal(released, false); released = true; counts.releases += 1; },
      };
    },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/controllers/interaction.controller.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console, Date, Set, JSON,
    require: (name) => {
      if (name === '../config/database') return database;
      if (name === 'node:crypto') return require(name);
      if (name === '../middleware/stepUp') return {};
      if (name === '../utils/teleconsult') return {};
      if (name === '../utils/dailyVideo') return {};
      if (name === '../utils/security') return {};
      throw new Error('Unexpected module: ' + name);
    },
  }, { filename });
  const invoke = async (body = {}) => {
    let status = 200;
    let payload;
    let failure;
    const response = { status: (value) => { status = value; return response; }, json: (value) => { payload = value; } };
    await module.exports.createThread({
      user: { id: userId, role: 'patient', first_name: 'Test', last_name: 'Patient' },
      body: { title: 'Emergency transport request', priority: 'urgent', initialMessage, clientRequestId: requestId, ...body },
    }, response, (error) => { failure = error; });
    return { status, payload, failure };
  };
  return { invoke, records, counts, setNotificationFailure: (value) => { failNotifications = value; } };
}

test('simultaneous retries create one thread, message, and staff notification', async () => {
  const app = harness();
  const results = await Promise.all([app.invoke(), app.invoke()]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 201]);
  for (const result of results) { assert.equal(result.failure, undefined); assert.equal(result.payload.data.id, requestId); }
  assert.equal(app.records.size, 1);
  assert.equal(app.counts.messages, 1);
  assert.equal(app.counts.notifications, 1);
  assert.equal(app.counts.clients, app.counts.releases);
});

test('retrying a committed request returns its receipt without repeating writes', async () => {
  const app = harness();
  await app.invoke();
  const retried = await app.invoke();
  assert.equal(retried.status, 200);
  assert.equal(retried.payload.replayed, true);
  assert.equal(app.counts.messages, 1);
  assert.equal(app.counts.notifications, 1);
});

test('a reference cannot be reused for different content or another creator', async () => {
  const app = harness();
  await app.invoke();
  assert.equal((await app.invoke({ initialMessage: 'Different request' })).status, 409);
  app.records.get(requestId).created_by = staffId;
  assert.equal((await app.invoke()).status, 409);
  assert.equal(app.counts.notifications, 1);
  assert.equal(app.counts.clients, app.counts.releases);
});

test('invalid references are rejected and failed transactions can safely retry', async () => {
  const app = harness();
  assert.equal((await app.invoke({ clientRequestId: 'not-a-uuid' })).status, 400);
  assert.equal(app.records.size, 0);
  app.setNotificationFailure(true);
  assert.match((await app.invoke()).failure.message, /Notification write failed/);
  assert.equal(app.records.size, 0);
  app.setNotificationFailure(false);
  assert.equal((await app.invoke()).status, 201);
  assert.equal(app.counts.notifications, 1);
  assert.equal(app.counts.clients, app.counts.releases);
});

test('existing clients without a request reference still create ordinary threads', async () => {
  const app = harness();
  const response = await app.invoke({ clientRequestId: undefined });
  assert.equal(response.status, 201);
  assert.notEqual(response.payload.data.id, requestId);
  assert.equal(app.counts.messages, 1);
});
