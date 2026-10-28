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
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].params[4])), { credentialAction: action });
    assert.equal(JSON.stringify(calls).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(calls).includes('1234'), false);
  }
});

test('generic credential logging does not record rejected or unauthenticated requests and retains ordinary audit behavior', async () => {
  assert.equal((await logRequest('/api/credentials/mine', 'POST', { statusCode: 400 })).length, 0);
  assert.equal((await logRequest('/api/credentials/mine', 'POST', { unauthenticated: true })).length, 0);
  assert.equal((await logRequest('/api/credentials/mine', 'GET')).length, 0);
  const calls = await logRequest('/api/ordinary-synthetic-item', 'PATCH', { body: { status: 'updated' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].params[4])), { status: 'updated' });
});
