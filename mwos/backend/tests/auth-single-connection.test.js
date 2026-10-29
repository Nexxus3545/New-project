const assert = require('node:assert/strict');
const { after, beforeEach, test } = require('node:test');

process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const database = require('../src/config/database');
const originalQuery = database.query;
const originalGetClient = database.getClient;
const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'patient@example.invalid', role: 'patient', first_name: 'Test',
  last_name: 'Patient', is_active: true, ui_preferences: {},
};
let held;
let statements;
let patientId;
let consumed;
let availableCode;
let auditFailure;
let payloadFailure;
let identityLinked;
let selectedUser;
let expectedCodeHash;
let patientCare;

const execute = async (sql, params = []) => {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  statements.push(normalized);
  if (normalized.startsWith('SELECT c.id AS code_id')) {
    return { rows: availableCode && !consumed && (!expectedCodeHash || params[0] === expectedCodeHash) ? [{ ...selectedUser, code_id: 'login-code' }] : [] };
  }
  if (normalized.startsWith('INSERT INTO oauth_login_codes')) expectedCodeHash = params[1];
  if (normalized.startsWith('UPDATE oauth_login_codes')) consumed = true;
  if (normalized === 'ROLLBACK') consumed = false;
  if (normalized.startsWith('SELECT id') && normalized.includes('FROM patients WHERE user_id')) {
    if (payloadFailure) throw new Error('Patient lookup failed');
    return { rows: patientId ? [{ id: patientId, ...patientCare }] : [] };
  }
  if (normalized.startsWith('SELECT 1 FROM patients')) return { rows: [] };
  if (normalized.startsWith('SELECT') && normalized.includes('FROM staff_registry')) {
    return { rows: [{ id: 'staff-record', user_id: selectedUser.id, license_status: 'verified' }] };
  }
  if (normalized.startsWith('SELECT') && normalized.includes('FROM oauth_identities')) {
    return { rows: identityLinked ? [selectedUser] : [] };
  }
  if (normalized === 'SELECT id FROM users WHERE email = $1') return { rows: [] };
  if (normalized.startsWith('SELECT') && normalized.includes('FROM sms_login_challenges')) {
    return { rows: [{ id: 'sms-code', code_hash: hashOtpCode('123456'), attempt_count: 0 }] };
  }
  if (normalized.startsWith('SELECT') && normalized.includes('FROM users')) return { rows: [selectedUser] };
  if (normalized.startsWith('INSERT INTO users')) {
    selectedUser = { ...user, role: params[2] === 'admin' ? 'admin' : 'patient' };
    return { rows: [selectedUser] };
  }
  if (normalized.startsWith('INSERT INTO staff_registry')) return { rows: [{ id: 'staff-record' }] };
  if (normalized.startsWith('INSERT INTO patients')) {
    patientId = 'patient-record';
    patientCare = { gender: params[10], care_type: params[11] };
  }
  if (normalized.startsWith('INSERT INTO audit_logs') && auditFailure) throw new Error('Audit unavailable');
  if (normalized.startsWith('UPDATE users') && normalized.includes('RETURNING')) return { rows: [selectedUser] };
  return { rows: [] };
};

// Refuse nested pool acquisition instead of waiting ten seconds for the same timeout as production.
database.query = async (...args) => {
  assert.equal(held, false, 'A helper requested another connection while the only client was checked out');
  return execute(...args);
};
database.getClient = async () => {
  assert.equal(held, false);
  held = true;
  return {
    query: (...args) => {
      assert.equal(held, true, 'Released clients must not be reused');
      return execute(...args);
    },
    release: () => {
      assert.equal(held, true);
      held = false;
    },
  };
};

const auth = require('../src/controllers/auth.controller');
const oauth = require('../src/controllers/oauth.controller');
const { hashOtpCode } = require('../src/utils/security');

beforeEach(() => {
  held = false;
  statements = [];
  patientId = null;
  consumed = false;
  availableCode = true;
  auditFailure = false;
  payloadFailure = false;
  identityLinked = false;
  selectedUser = { ...user };
  expectedCodeHash = null;
  patientCare = {};
});

after(async () => {
  database.query = originalQuery;
  database.getClient = originalGetClient;
  await database.pool.end();
});

const invoke = async (handler, { body = {}, ...overrides } = {}) => {
  let payload;
  let failure;
  let status = 200;
  let location;
  await handler(
    { body, user, ip: '127.0.0.1', get: () => 'test', ...overrides },
    {
      status: (value) => { status = value; return { json: (value) => { payload = value; } }; },
      json: (value) => { payload = value; },
      redirect: (value) => { location = value; },
    },
    (error) => { failure = error; }
  );
  assert.equal(held, false, 'Every path must return the checked-out client');
  return { payload, failure, status, location };
};

test('OAuth code exchange returns tokens and profile with only one connection', async () => {
  for (const existingPatientId of [null, 'patient-record']) {
    patientId = existingPatientId;
    consumed = false;
    const result = await invoke(oauth.exchange, { body: { code: 'one-time-test-code' } });
    assert.ifError(result.failure);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.user.patientId, existingPatientId);
    assert.ok(result.payload.data.accessToken);
    assert.ok(result.payload.data.refreshToken);
    assert.equal(consumed, true);
  }
  const replay = await invoke(oauth.exchange, { body: { code: 'one-time-test-code' } });
  assert.ifError(replay.failure);
  assert.equal(replay.status, 400);
  assert.equal(replay.payload.data, undefined);
});

test('expired and inactive OAuth logins return no session and release the client', async () => {
  availableCode = false;
  const expired = await invoke(oauth.exchange, { body: { code: 'expired-code' } });
  assert.equal(expired.status, 400);
  availableCode = true;
  selectedUser.is_active = false;
  const inactive = await invoke(oauth.exchange, { body: { code: 'inactive-code' } });
  assert.equal(inactive.status, 403);
  assert.equal(consumed, false);
});

test('OAuth failures roll back before exposing tokens or consuming the sign-in code', async () => {
  for (const failureMode of ['audit', 'profile']) {
    statements = [];
    auditFailure = failureMode === 'audit';
    payloadFailure = failureMode === 'profile';
    const result = await invoke(oauth.exchange, { body: { code: 'retryable-code' } });
    assert.ok(result.failure);
    assert.equal(result.payload, undefined);
    assert.equal(statements.at(-1), 'ROLLBACK');
    assert.equal(statements.includes('COMMIT'), false);
    assert.equal(consumed, false);
  }
});

test('required Google patient details generate identifiers on the transaction connection', async () => {
  const result = await invoke(oauth.completePatientProfile, { body: { dateOfBirth: '2000-01-01' } });
  assert.ifError(result.failure);
  assert.equal(result.payload.data.patientId, 'patient-record');
  assert.equal(statements.filter((sql) => sql.startsWith('SELECT 1 FROM patients')).length, 2);
});

test('email and Google patient registration persist male/general selections without a pregnancy', async () => {
  const body = { email: user.email, password: 'Test-password1!', role: 'patient', firstName: 'Test', lastName: 'Patient', dateOfBirth: '2000-01-01', gender: 'male', careType: 'general' };
  for (const handler of [auth.register, oauth.completePatientProfile]) {
    patientId = null;
    statements = [];
    const result = await invoke(handler, { body });
    assert.ifError(result.failure);
    const payload = handler === auth.register ? result.payload.data.user : result.payload.data;
    assert.equal(payload.patientGender, 'male');
    assert.equal(payload.careType, 'general');
    assert.equal(payload.hasActivePregnancy, false);
    assert.ok(!statements.some((sql) => sql.startsWith('INSERT INTO pregnancies')));
  }
});

test('new Google patients finish the callback, exchange, and required profile with one connection', async () => {
  const callback = await invoke(oauth.finish, {
    user: { provider: 'google', subject: 'test-google-subject', email: user.email, emailVerified: true, firstName: 'Test', lastName: 'Patient' },
  });
  assert.ifError(callback.failure);
  const destination = new URL(callback.location);
  assert.equal(destination.pathname, '/oauth-callback');
  assert.equal(destination.searchParams.get('new_account'), '1');
  const code = destination.searchParams.get('code');
  assert.ok(code);
  const exchange = await invoke(oauth.exchange, { body: { code } });
  assert.ifError(exchange.failure);
  assert.equal(exchange.payload.data.user.patientId, null);
  const completion = await invoke(oauth.completePatientProfile, { body: { dateOfBirth: '2000-01-01' } });
  assert.ifError(completion.failure);
  assert.equal(completion.payload.data.patientId, 'patient-record');
  assert.equal(statements.filter((sql) => sql.startsWith('INSERT INTO patients')).length, 1);
  const repeat = await invoke(oauth.completePatientProfile, { body: { dateOfBirth: '2000-01-01' } });
  assert.ifError(repeat.failure);
  assert.equal(statements.filter((sql) => sql.startsWith('INSERT INTO patients')).length, 1);
});

test('existing Google patients finish callback and exchange without creating another account', async () => {
  identityLinked = true;
  patientId = 'patient-record';
  const result = await invoke(oauth.finish, { user: { provider: 'google', subject: 'known-subject', email: user.email, emailVerified: true } });
  assert.ifError(result.failure);
  assert.equal(new URL(result.location).searchParams.has('new_account'), false);
  const login = await invoke(oauth.exchange, { body: { code: new URL(result.location).searchParams.get('code') } });
  assert.ifError(login.failure);
  assert.equal(login.payload.data.user.patientId, patientId);
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO users')), false);
});

test('patient and authorized admin-created registration reuse the transaction without leaking staff sessions', async () => {
  for (const role of ['patient', 'admin']) {
    const result = await invoke(auth.register, { user: role === 'admin' ? { ...user, role: 'admin' } : user, body: {
      email: `${role}@example.invalid`, password: 'Test-only-password1!', role,
      firstName: 'Test', lastName: 'Account', dateOfBirth: '2000-01-01',
    } });
    assert.ifError(result.failure);
    assert.equal(result.status, 201);
    assert.equal(result.payload.data.user.role, role);
    if (role === 'admin') {
      assert.equal(result.payload.data.user.staffProfile.staffId, 'staff-record');
      assert.equal(result.payload.data.accessToken, undefined);
      assert.equal(result.payload.data.refreshToken, undefined);
    }
  }
});

test('public registration cannot self-assign any staff or administrator role', async () => {
  for (const role of ['admin', 'doctor', 'midwife', 'nurse']) {
    statements = [];
    const result = await invoke(auth.register, { user: undefined, body: { email: 'staff@example.invalid', password: 'test-password', role, firstName: 'Test', lastName: 'Staff' } });
    assert.equal(result.status, 403);
    assert.equal(statements.length, 0, 'Reject privilege escalation before any database writes');
  }
});

test('SMS session profile lookup also uses its checked-out client', async () => {
  const result = await invoke(auth.verifySmsLogin, { body: { phone: '09171234567', code: '123456' } });
  assert.ifError(result.failure);
  assert.equal(result.payload.success, true);
  assert.ok(result.payload.data.accessToken);
});

test('native OAuth handoff rejects intercepted codes without the original verifier', async () => {
  const { verifierChallenge } = require('../src/utils/oauthHandoff');
  const verifier = 'v'.repeat(64);
  identityLinked = true;
  const callback = await invoke(oauth.finish, {
    user: { provider: 'google', subject: 'native-google-subject', email: user.email, emailVerified: true },
    mobileOAuth: { codeChallenge: verifierChallenge(verifier) },
  });
  assert.ifError(callback.failure);
  const destination = new URL(callback.location);
  assert.equal(destination.protocol, 'tmccopinomwos:');
  const code = destination.searchParams.get('code');
  for (const body of [{ code }, { code, codeVerifier: 'wrong'.repeat(13) }]) {
    const denied = await invoke(oauth.exchange, { body });
    assert.equal(denied.status, 400);
    assert.equal(consumed, false);
  }
  const accepted = await invoke(oauth.exchange, { body: { code, codeVerifier: verifier } });
  assert.ifError(accepted.failure);
  assert.equal(accepted.payload.success, true);
});
