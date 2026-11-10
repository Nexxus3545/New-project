const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

async function logRequest(originalUrl, method = 'POST', options = {}) {
  const calls = []; let finish, continued = false;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/middleware/activityLogger.js'), 'utf8'), {
    module, exports: module.exports, Buffer, Set, console,
    require: (name) => {
      assert.equal(name, '../config/database');
      return { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    },
  });
  const req = { originalUrl, method, user: options.unauthenticated ? null : { id: '11111111-1111-4111-8111-111111111111' },
    body: options.body || { file: { dataBase64: 'PRIVATE_BASE64_EVIDENCE' }, licenseNumber: 'PRIVATE_PROFESSIONAL_NUMBER', idLast4: '1234', reviewNotes: 'PRIVATE_REVIEW_NOTES' },
    requestId: 'synthetic-request', ip: '127.0.0.1', headers: { 'user-agent': 'synthetic-audit-test' } };
  await module.exports.activityLogger(req, { statusCode: options.statusCode || 200, on: (name, handler) => { assert.equal(name, 'finish'); finish = handler; } }, () => { continued = true; });
  if (finish) await finish();
  assert.equal(continued, true);
  return calls;
}

test('generic activity logging redacts credential files, ID numbers and review notes on all credential mutations', async () => {
  for (const [url, method, action] of [
    ['/api/credentials/mine', 'POST', 'submitted'],
    ['/api/credentials/users/synthetic-user', 'POST', 'submitted'],
    ['/api/credentials/users/synthetic-user/review', 'PATCH', 'reviewed'],
    ['/api/v1/credentials/users/synthetic-user/review?revision=1', 'PATCH', 'reviewed'],
  ]) {
    const calls = await logRequest(url, method);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].params[4])), { credentialAction: action, statusCode: 200 });
    assert.equal(JSON.stringify(calls).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(calls).includes('1234'), false);
  }
});

test('audit logs authenticated reads and denials without copying sensitive payloads', async () => {
  const rejected = await logRequest('/api/credentials/mine', 'POST', { statusCode: 400 });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].params[1], 'POST_DENIED');
  assert.equal(rejected[0].params[4].statusCode, 400);
  const failed = await logRequest('/api/patients', 'POST', { statusCode: 500 });
  assert.equal(failed[0].params[1], 'POST_ERROR');
  assert.equal(failed[0].params[4].statusCode, 500);
  assert.equal((await logRequest('/api/credentials/mine', 'POST', { unauthenticated: true })).length, 0);
  const reads = await logRequest('/api/v1/credentials/mine', 'GET');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].params[2], 'credentials');
  assert.equal(reads[0].params[4].credentialAction, 'accessed');
  const calls = await logRequest('/api/patients?search=PRIVATE_SEARCH', 'PATCH', { body: { notes: 'PRIVATE_CLINICAL_NOTES', name: 'PRIVATE_NAME', file: 'PRIVATE_FILE' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].params[4])), { statusCode: 200 });
  assert.equal(JSON.stringify(calls).includes('PRIVATE'), false);
});

test('audit database failures emit a bounded operational event without request content or database details', async () => {
  let finish;
  const logs = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/middleware/activityLogger.js'), 'utf8'), {
    module, exports: module.exports, Set,
    console: { error: (...args) => logs.push(args) },
    require: (name) => {
      assert.equal(name, '../config/database');
      return { query: async () => { throw Object.assign(new Error('PRIVATE_QUERY_AND_PATIENT_DETAILS'), { code: 'PRIVATE ERROR CONTENT' }); } };
    },
  });
  const req = { originalUrl: '/api/patients?search=PRIVATE_SEARCH', method: 'GET', user: { id: 'synthetic-user' },
    requestId: 'synthetic-request', body: { note: 'PRIVATE_NOTE' }, headers: {} };
  await module.exports.activityLogger(req, { statusCode: 200, on: (_name, handler) => { finish = handler; } }, () => {});
  await finish();
  assert.deepEqual(JSON.parse(JSON.stringify(logs)), [['AUDIT_WRITE_FAILED', { requestId: 'synthetic-request', code: 'AUDIT_ERROR' }]]);
  assert.equal(JSON.stringify(logs).includes('PRIVATE'), false);
});
