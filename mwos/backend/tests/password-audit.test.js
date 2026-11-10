const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('managed user creation and nested account changes never copy passwords or tokens into activity history', async () => {
  let values, finish;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/middleware/activityLogger.js'), 'utf8'), {
    module, Buffer, console,
    require: (name) => {
      assert.equal(name, '../config/database');
      return { query: async (_sql, parameters) => { values = parameters[4]; } };
    },
  });
  const body = { email: 'synthetic@example.invalid', role: 'nurse', password: 'Never-write-this1!',
    settings: { currentPassword: 'old-secret', new_password: 'new-secret', confirmPassword: 'confirmation-secret', accessToken: 'access-secret', notifications: false, volume: 0, note: '', disabledAt: null },
    changes: [{ PASSWORD: 'uppercase-secret', stepUpToken: 'step-secret', note: 'Keep this non-secret note.' }],
  };
  const req = { method: 'POST', originalUrl: '/api/users', body, user: { id: 'synthetic-user' }, headers: {} };
  module.exports.activityLogger(req, { statusCode: 201, on: (_event, handler) => { finish = handler; } }, () => {});
  await finish();
  assert.deepEqual(JSON.parse(JSON.stringify(values)), { statusCode: 201 });
  const encoded = JSON.stringify(values);
  for (const secret of ['Never-write-this1!', 'old-secret', 'new-secret', 'confirmation-secret', 'access-secret', 'uppercase-secret', 'step-secret']) assert.equal(encoded.includes(secret), false);
  assert.equal(encoded.includes(body.email), false);
  assert.equal(body.password, 'Never-write-this1!', 'Audit redaction must not mutate the actual registration request');
});
