const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { passwordPolicyChecks, passwordPolicyError } = require('../src/utils/passwordPolicy');

test('new passwords need letters, numbers and symbols with bounded UTF-8 length', () => {
  for (const value of [undefined, null, false, 12345678, {}, [], '', 'lettersOnly', 'numbers123', 'letters!!!', '12345678!', 'abcdefg1 ', 'a1!' + 'é'.repeat(35), 'Abcdef1!\n']) {
    assert.equal(typeof passwordPolicyError(value), 'string');
  }
  for (const value of ['abcdef1!', 'ABCDEF1!', 'Ábcdef1!', 'abc 123!', 'abc12345🔐', 'a1!' + 'x'.repeat(69)]) assert.equal(passwordPolicyError(value), null);
  assert.notEqual(passwordPolicyError('a1!' + 'x'.repeat(70)), null);
  assert.equal(passwordPolicyChecks('abcdefgh1 ').symbol, false);
  assert.equal(passwordPolicyChecks('abcdef1_').symbol, true);
});

const source = path.join(__dirname, '../src/controllers/auth.controller.js');
const originalRequire = createRequire(source);
function runtime({ query = async () => { throw Error('Unexpected database query'); }, compare = async () => true } = {}) {
  const module = { exports: {} };
  const hashed = [];
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module, URL, process: { env: {} },
    require(name) {
      if (name === '../config/database') return { query, getClient: async () => { throw Error('Unexpected transaction'); } };
      if (name === 'bcryptjs') return { hash: async (value) => { hashed.push(value); return 'synthetic-new-hash'; }, compare };
      if (name === '../utils/staff') return { fetchStaffProfileByUserId: async () => null };
      if (name === '../utils/tokens') return { generateSessionTokens: () => ({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' }) };
      return originalRequire(name);
    },
  });
  return { controller: module.exports, hashed };
}
async function invoke(handler, body, user = { id: 'synthetic-user', role: 'patient' }) {
  let status = 200, payload, failure;
  const res = { status: (value) => { status = value; return res; }, json: (value) => { payload = value; } };
  await handler({ body, user }, res, (error) => { failure = error; });
  if (failure) throw failure;
  return { status, payload };
}

test('registration, admin-created accounts, password changes and resets reject weak input before hashing or writes', async () => {
  const { controller, hashed } = runtime();
  const registration = { email: 'synthetic@example.invalid', role: 'patient', firstName: 'Synthetic', lastName: 'Patient', dateOfBirth: '2000-01-01' };
  for (const weak of ['abcdefgh1', 'abcdefgh!', '12345678!', 'abc12345 ', 'x1!', 'a1!' + 'x'.repeat(70), 123456789]) {
    for (const [handler, body, user] of [
      [controller.register, { ...registration, password: weak }],
      [controller.register, { ...registration, role: 'nurse', password: weak }, { id: 'admin-fixture', role: 'admin' }],
      [controller.changePassword, { currentPassword: 'legacy-password', newPassword: weak }],
      [controller.resetPassword, { token: 'synthetic-reset-token', newPassword: weak }],
    ]) {
      const result = await invoke(handler, body, user);
      assert.equal(result.status, 400); assert.equal(result.payload.code, 'PASSWORD_POLICY_REQUIRED');
      assert.equal(JSON.stringify(result.payload).includes(String(weak)), false, 'Errors do not repeat password values');
    }
  }
  assert.equal(hashed.length, 0);
});

test('a valid password change keeps current-password verification and revokes existing sessions', async () => {
  const statements = [];
  let compared;
  const { controller, hashed } = runtime({
    compare: async (value, hash) => { compared = [value, hash]; return value === 'legacy-password'; },
    query: async (sql, args) => {
      statements.push({ sql, args });
      return { rows: sql.startsWith('SELECT password') ? [{ password: 'synthetic-existing-hash' }] : [] };
    },
  });
  const result = await invoke(controller.changePassword, { currentPassword: 'legacy-password', newPassword: 'New-password1!' });
  assert.equal(result.status, 200);
  assert.deepEqual(compared, ['legacy-password', 'synthetic-existing-hash']);
  assert.deepEqual(hashed, ['New-password1!']);
  assert.match(statements.at(-1).sql, /refresh_token = NULL, sessions_revoked_at = NOW/);
  assert.equal(statements.at(-1).args[0], 'synthetic-new-hash');
});

test('existing passwords can still sign in without satisfying the new-password policy', async () => {
  const { controller, hashed } = runtime({
    query: async (sql) => ({ rows: sql.includes('WHERE email = $1') ? [{ id: 'fixture', email: 'legacy@example.invalid', role: 'admin', first_name: 'Synthetic', last_name: 'Staff', password: 'existing-hash', is_active: true }] : [] }),
  });
  const result = await invoke(controller.login, { email: 'legacy@example.invalid', password: 'legacy-password' });
  assert.equal(result.status, 200); assert.equal(result.payload.success, true); assert.equal(hashed.length, 0);
});
