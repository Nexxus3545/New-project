const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('mandatory Google codes cannot be advertised ready before a verified and configured sender', () => {
  const env = {};
  let configured = false;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/googleEmailVerification.js'), 'utf8'), {
    module, process: { env }, Buffer,
    require(name) { return name === './mailer' ? { isEmailConfigured: () => configured } : require(name); },
  });
  const { googleEmailCodeReady } = module.exports;
  assert.equal(googleEmailCodeReady(), true, 'The existing notification-only login remains available');
  env.GOOGLE_EMAIL_OTP_REQUIRED = 'true';
  assert.equal(googleEmailCodeReady(), false);
  configured = true;
  assert.equal(googleEmailCodeReady(), false, 'Credentials alone are not delivery verification');
  env.GOOGLE_EMAIL_DELIVERY_VERIFIED = 'true';
  assert.equal(googleEmailCodeReady(), true);
  configured = false;
  assert.equal(googleEmailCodeReady(), false);
});
