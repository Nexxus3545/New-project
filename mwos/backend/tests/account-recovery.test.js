const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const source = path.join(__dirname, '../src/controllers/auth.controller.js');
const originalRequire = createRequire(source);
function runtime(query, { configured = true, sendMail = async () => {} } = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module, URL, process: { env: { FRONTEND_URL: 'https://clinic.example.invalid,https://preview.example.invalid', NODE_ENV: 'production' } },
    require(name) {
      if (name === '../config/database') return { query };
      if (name === '../utils/mailer') return { sendMail, isEmailConfigured: () => configured };
      if (name === 'bcryptjs') return { hash: async () => 'synthetic-password-hash', compare: async () => false };
      return originalRequire(name);
    },
  });
  return module.exports;
}
async function invoke(handler, body, user) {
  const response = { status: 200 };
  await handler({ body, user }, { status(code) { response.status = code; return this; }, json(body) { response.body = body; } }, (error) => { throw error; });
  return response;
}
test('password recovery goes to the Google-verified address and a real single-origin reset link', async () => {
  const messages = [], statements = [];
  const controller = runtime(async (sql, args) => {
    statements.push(sql);
    if (sql.includes('SELECT u.id')) return { rows: [{ id: 'synthetic-user', email: 'changed@example.invalid', recovery_email: 'verified@example.invalid' }] };
    if (sql.includes('INSERT INTO password_reset_tokens')) { assert.match(args[1], /^[a-f0-9]{64}$/); }
    return { rows: [] };
  }, { sendMail: async (message) => messages.push(message) });
  assert.equal((await invoke(controller.forgotPassword, { email: 'changed@example.invalid' })).status, 200);
  assert.equal(messages[0].to, 'verified@example.invalid');
  assert.match(messages[0].text, /https:\/\/clinic\.example\.invalid\/reset-password\?token=[a-f0-9]{64}/);
  assert.doesNotMatch(messages[0].text, /preview\.example/);
  assert.ok(statements.some((sql) => sql.includes('u.is_active = TRUE')));
});
test('unavailable recovery cannot falsely claim a reset email or mutate accounts', async () => {
  const controller = runtime(() => { throw new Error('Must not query'); }, { configured: false });
  assert.equal((await invoke(controller.forgotPassword, { email: 'fixture@example.invalid' })).status, 503);
});
test('reset consumes its token atomically, invalidates every session, and refuses weak passwords', async () => {
  let calls = 0;
  const controller = runtime(async (sql, args) => {
    calls++;
    assert.match(sql, /WITH consumed AS/); assert.match(sql, /used_at IS NULL AND expires_at > NOW/);
    assert.match(sql, /sessions_revoked_at = NOW/); assert.match(sql, /is_active = TRUE/);
    assert.equal(args[1], 'synthetic-password-hash');
    return { rows: calls === 1 ? [{ id: 'synthetic-user' }] : [] };
  });
  const body = { token: 'a'.repeat(64), newPassword: 'Synthetic-password1!' };
  assert.equal((await invoke(controller.resetPassword, body)).status, 200);
  assert.equal((await invoke(controller.resetPassword, body)).status, 400);
  assert.equal((await invoke(controller.resetPassword, { ...body, newPassword: 'short' })).status, 400);
  assert.equal(calls, 2);
});
test('a hijacked session cannot change the recovery/login email without reauthentication', async () => {
  const controller = runtime(async (sql) => {
    assert.equal(sql, 'SELECT password FROM users WHERE id = $1');
    return { rows: [{ password: 'existing-hash' }] };
  });
  const result = await invoke(controller.updateProfile, { email: 'attacker@example.invalid', firstName: 'Test', lastName: 'Person' }, { id: 'synthetic-user', email: 'original@example.invalid' });
  assert.equal(result.status, 403);
});
