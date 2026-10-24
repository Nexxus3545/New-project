const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
process.env.JWT_SECRET = 'test-email-verification-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh';
process.env.FRONTEND_URL = 'https://clinic.example.invalid';
const database = require('../src/config/database');
const mailer = require('../src/utils/mailer');
const { codeHash } = require('../src/utils/oauthHandoff');
let held = false;
let challenge;
let emails;
let failMail;
let smtpReady;
let user;
let notices;
let event;
const statements = [];
const originalQuery = database.query;
const originalGetClient = database.getClient;
const originalSend = mailer.sendMail;
const originalConfigured = mailer.isEmailConfigured;
const execute = async (sql, params = []) => {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  statements.push(normalized);
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
  if (normalized.startsWith('SELECT c.id AS code_id')) return { rows: !challenge.consumed && params[0] === codeHash('test-proof') ? [{ ...challenge, ...user }] : [] };
  if (normalized.startsWith('UPDATE oauth_login_codes SET email_otp_hash')) {
    challenge.email_otp_hash = params[0]; challenge.email_otp_expires_at = params[1]; return { rows: [] };
  }
  if (normalized.startsWith('UPDATE oauth_login_codes SET email_otp_attempts')) {
    challenge.email_otp_attempts = params[0]; if (params[1]) challenge.consumed = true; return { rows: [] };
  }
  if (normalized.startsWith('UPDATE oauth_login_codes SET consumed_at')) { challenge.consumed = true; return { rows: [] }; }
  if (normalized.startsWith('SELECT id, gender')) return { rows: [{ id: 'patient-1', care_type: 'general' }] };
  if (normalized.startsWith('INSERT INTO notification_email_events')) { event = { id: params[0], recipient: params[3], subject: params[4], text_body: params[5], delivery_status: params[6] }; return { rows: [{ id: event.id }] }; }
  if (normalized.startsWith('INSERT INTO notifications')) { notices += 1; return { rows: [{ id: 'notice-1' }] }; }
  if (normalized.startsWith('UPDATE notification_email_events SET notification_id')) return { rows: [] };
  if (normalized.startsWith('UPDATE notification_email_events SET delivery_status')) {
    if (sql.includes("= 'sending'")) { if (event.delivery_status !== 'pending') return { rows: [] }; event.delivery_status = 'sending'; return { rows: [event] }; }
    event.delivery_status = sql.includes("= 'accepted'") ? 'accepted' : 'failed'; return { rows: [] };
  }
  if (normalized.startsWith('SELECT delivery_status')) return { rows: [event] };
  if (normalized.startsWith('UPDATE users') || normalized.startsWith('INSERT INTO audit_logs')) return { rows: [] };
  throw new Error(`Unexpected mocked SQL: ${normalized}`);
};
database.query = (...args) => { assert.equal(held, false, 'SMTP and delivery queries must happen after releasing the only connection'); return execute(...args); };
database.getClient = async () => { assert.equal(held, false); held = true; return { query: execute, release: () => { held = false; } }; };
mailer.isEmailConfigured = () => smtpReady;
mailer.sendMail = async (message) => { assert.equal(held, false, 'SMTP must not hold a database transaction'); emails.push(message); if (failMail) throw new Error('Simulated rejection'); return { accepted: true }; };
const { exchange } = require('../src/controllers/oauth.controller');
const { assertEmailCodeRolloutDisabled } = require('../src/utils/googleEmailVerification');
beforeEach(() => {
  held = false; emails = []; notices = 0; failMail = false; smtpReady = true; event = null; statements.length = 0;
  user = { id: 'user-1', role: 'patient', email: 'changed@example.invalid', is_active: true };
  challenge = { code_id: 'code-1', provider: 'google', verified_email: 'verified@gmail.example.invalid', email_otp_required: true, email_otp_attempts: 0, consumed: false };
});
after(async () => { database.query = originalQuery; database.getClient = originalGetClient; mailer.sendMail = originalSend; mailer.isEmailConfigured = originalConfigured; await database.pool.end(); });
async function invoke(body = {}) {
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(payload) { result.payload = payload; } };
  await exchange({ body: { code: 'test-proof', ...body }, get: () => '', user: {} }, res, (error) => { throw error; });
  assert.equal(held, false);
  return result;
}
const sentCode = () => emails[0].text.match(/code is (\d{6})/)[1];

test('the approved notification rollout cannot accidentally enable mandatory email codes', () => {
  assert.doesNotThrow(() => assertEmailCodeRolloutDisabled({}));
  assert.doesNotThrow(() => assertEmailCodeRolloutDisabled({ GOOGLE_EMAIL_OTP_REQUIRED: 'false' }));
  assert.throws(() => assertEmailCodeRolloutDisabled({ GOOGLE_EMAIL_OTP_REQUIRED: 'true' }), /separate approved rollout/);
});

test('Google identity alone cannot issue a session before the required email code', async () => {
  const pending = await invoke();
  assert.equal(pending.payload.data.verificationRequired, true);
  assert.equal(pending.payload.data.accessToken, undefined);
  assert.equal(notices, 0);
  assert.equal(emails[0].to, challenge.verified_email, 'Use the verified provider email, not an editable profile email');
  assert.ok(!challenge.email_otp_hash.includes(sentCode()));
  await invoke();
  assert.equal(emails.length, 1, 'Replaying the pending proof cannot resend codes');
  const verified = await invoke({ verificationCode: sentCode() });
  assert.ok(verified.payload.data.accessToken);
  assert.equal(verified.payload.data.user.role, 'patient');
  assert.equal(notices, 1);
  assert.equal(emails.length, 2, 'A successful sign-in sends one security alert');
  assert.equal(verified.payload.data.notification.email, 'accepted');
  assert.doesNotMatch(emails[1].text, new RegExp(sentCode()));
  assert.equal((await invoke({ verificationCode: sentCode() })).status, 400);
  assert.equal(notices, 1);
});

test('wrong, expired, and exhausted codes never authorize access', async () => {
  await invoke();
  const rightCode = sentCode();
  const wrong = rightCode === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i += 1) assert.equal((await invoke({ verificationCode: wrong })).status, 400);
  assert.equal((await invoke({ verificationCode: rightCode })).status, 400);
  assert.equal(notices, 0);
});

test('delivery failure and unavailable sender fail closed without a session', async () => {
  smtpReady = false;
  assert.equal((await invoke()).status, 503);
  assert.equal(emails.length, 0);
  smtpReady = true; failMail = true;
  assert.equal((await invoke()).status, 503);
  assert.equal(challenge.consumed, true);
  assert.equal(notices, 0);
});

test('a staff role cannot be authorized through a patient Google handoff', async () => {
  user.role = 'admin';
  assert.equal((await invoke()).status, 403);
  assert.equal(emails.length, 0);
});

test('the notification-only rollout keeps Google login working without asking for an email code', async () => {
  challenge.email_otp_required = false;
  const result = await invoke();
  assert.ok(result.payload.data.accessToken);
  assert.equal(result.payload.data.verificationRequired, undefined);
  assert.equal(notices, 1);
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /Google sign-in/);
  assert.doesNotMatch(emails[0].text, /additional email code check|sign-in code is/);
});

test('expired verification codes are rejected even with the right digits', async () => {
  await invoke();
  challenge.email_otp_expires_at = new Date(Date.now() - 1000);
  assert.equal((await invoke({ verificationCode: sentCode() })).status, 400);
  assert.equal(notices, 0);
});
