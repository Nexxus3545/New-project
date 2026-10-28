const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const loadModule = (file, imports) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    module, exports: module.exports, require: (name) => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'crypto') return require('node:crypto');
      throw new Error('Unexpected import: ' + name);
    }, Date, Intl, Set, Buffer, console, process,
  }, { filename: file });
  return module.exports;
};

const valid = (changes = {}) => ({
  credential_role: 'doctor', license_status: 'verified', license_number: 'PRC-1234567',
  credential_expires_at: '2099-10-29', account_credential_kind: 'professional_license',
  account_credential_status: 'verified', account_credential_license_number: 'PRC-1234567',
  account_credential_expires_at: '2099-10-29', account_credential_has_document: true,
  ...changes,
});

const helper = loadModule('middleware/professionalCredential.js', {
  '../config/database': { query: async () => { throw new Error('Unexpected database call'); } },
});

test('professional eligibility requires the current reviewed evidence and matching registry metadata', () => {
  for (const role of ['doctor', 'nurse', 'midwife']) assert.equal(helper.isCurrentProfessionalCredential(valid({ credential_role: role })), true);
  for (const changes of [
    { credential_role: 'patient' }, { credential_role: 'admin' },
    { license_status: 'pending' }, { license_status: 'suspended' }, { license_status: 'expired' },
    { license_number: '' }, { license_number: null },
    { credential_expires_at: null }, { credential_expires_at: '2099-02-30' },
    { account_credential_kind: 'patient_id' }, { account_credential_status: 'pending' },
    { account_credential_status: 'rejected' }, { account_credential_license_number: 'DIFFERENT' },
    { account_credential_expires_at: '2099-10-28' }, { account_credential_has_document: false },
    { account_credential_has_document: 'true' },
    { credential_expires_at: '2000-01-01', account_credential_expires_at: '2000-01-01' },
  ]) assert.equal(helper.isCurrentProfessionalCredential(valid(changes)), false, JSON.stringify(changes));
  assert.equal(helper.isCurrentProfessionalCredential(null), false);
});

test('license expiry includes its Manila calendar day and expires at Manila midnight', () => {
  const row = valid({ credential_expires_at: '2030-01-02', account_credential_expires_at: '2030-01-02' });
  assert.equal(helper.isCurrentProfessionalCredential(row, new Date('2030-01-02T15:59:59Z')), true);
  assert.equal(helper.isCurrentProfessionalCredential(row, new Date('2030-01-02T16:00:00Z')), false);
  assert.equal(helper.credentialDateKey(new Date(2030, 0, 2)), '2030-01-02');
});

test('clinical request guard rejects pending evidence but exempts patient and admin without queries', async () => {
  let row = valid(), queries = [], failure;
  const middleware = loadModule('middleware/professionalCredential.js', {
    '../config/database': { query: async (sql, params) => { queries.push({ sql, params }); return { rows: row ? [row] : [] }; } },
  });
  const invoke = async (user) => {
    let status = 200, payload, next = 0;
    const req = { user, requestId: 'fixture-request' };
    await middleware.requireCurrentProfessionalCredential(req, { status: (code) => { status = code; return { json: (body) => { payload = body; } }; } }, (error) => { if (error) failure = error; else next++; });
    return { status, payload, next, req };
  };
  for (const role of ['admin', 'patient']) assert.equal((await invoke({ id: 'self', role })).next, 1);
  assert.equal(queries.length, 0);
  assert.equal((await invoke(undefined)).status, 401);
  assert.equal(queries.length, 0);
  const accepted = await invoke({ id: 'doctor-self', role: 'doctor' });
  assert.equal(accepted.next, 1);
  assert.equal(accepted.req.professionalCredential.checked, true);
  assert.deepEqual(JSON.parse(JSON.stringify(queries[0].params)), ['doctor-self']);
  assert.match(queries[0].sql, /LEFT JOIN account_credentials/);
  assert.match(queries[0].sql, /octet_length\(ac\.document_bytes\)/);
  row = valid({ account_credential_status: 'pending' });
  const rejected = await invoke({ id: 'doctor-self', role: 'doctor' });
  assert.equal(rejected.status, 403); assert.equal(rejected.next, 0);
  assert.equal(rejected.payload.code, 'PROFESSIONAL_CREDENTIAL_REQUIRED');
  assert.equal(failure, undefined);
});

test('professional guard forwards database errors without allowing access', async () => {
  const error = new Error('Synthetic database failure');
  const middleware = loadModule('middleware/professionalCredential.js', { '../config/database': { query: async () => { throw error; } } });
  let forwarded;
  await middleware.requireCurrentProfessionalCredential({ user: { id: 'self', role: 'nurse' } }, {}, (value) => { forwarded = value; });
  assert.equal(forwarded, error);
});

test('staff security profiles use evidence eligibility and never serialize document bytes', async () => {
  let captured;
  const staff = loadModule('utils/staff.js', {
    '../config/database': { query: async (sql) => { captured = sql; return { rows: [valid({ id: 'registry', user_id: 'self', document_bytes: Buffer.from('private-file') })] }; } },
    '../middleware/professionalCredential': helper,
  });
  const profile = await staff.fetchStaffProfileByUserId('self');
  assert.equal(profile.isVerified, true); assert.equal(profile.role, 'doctor');
  assert.equal(JSON.stringify(profile).includes('private-file'), false);
  assert.equal(Object.hasOwn(profile, 'document_bytes'), false);
  assert.match(captured, /LEFT JOIN account_credentials/);
  assert.equal(staff.publicStaffProfile({ license_status: 'verified', license_number: 'LEGACY' }).isVerified, false);
});

test('permission checks exempt administrative licensing but retain step-up and reject stale clinical proof', async () => {
  let eligibility = false, clinicalLookups = 0, stepUps = 0;
  const permissions = loadModule('middleware/permissions.js', {
    '../config/database': { query: async (sql) => ({ rows: [] }) },
    '../config/permissions': { ROLE_PERMISSION_MATRIX: { admin: ['*'], doctor: ['clinical:vitals:write'] }, SENSITIVE_PERMISSIONS: new Set(['clinical:vitals:write']), normalizePermissionRows: () => new Set() },
    './stepUp': { resolveStepUpContext: () => { stepUps++; return {}; } },
    './professionalCredential': { PROFESSIONAL_ROLES: helper.PROFESSIONAL_ROLES, loadProfessionalCredential: async () => { clinicalLookups++; return {}; }, isCurrentProfessionalCredential: () => eligibility },
  });
  const invoke = async (role) => {
    let status = 200, payload, accepted = false;
    const res = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
    await permissions.authorizePermission('clinical:vitals:write')({ user: { id: role, role } }, res, () => { accepted = true; });
    return { status, payload, accepted };
  };
  assert.equal((await invoke('admin')).accepted, true);
  assert.equal(clinicalLookups, 0); assert.equal(stepUps, 1);
  assert.equal((await invoke('doctor')).payload.code, 'PROFESSIONAL_CREDENTIAL_REQUIRED');
  assert.equal(stepUps, 1);
  eligibility = true;
  assert.equal((await invoke('doctor')).accepted, true);
  assert.equal(stepUps, 2);
});

test('clinical signatures reject pending, suspended, expired and administrative credentials before writing', async () => {
  const writes = [];
  const security = loadModule('utils/security.js', {
    jsonwebtoken: {}, './mailer': {}, './staff': { fetchStaffProfileByUserId: async () => null },
    '../config/database': { query: async (sql) => { writes.push(sql); return { rows: [{ id: 'signature' }] }; } },
    '../middleware/professionalCredential': helper,
  });
  const profile = { staffId: 'fixture', role: 'doctor', licenseNumber: 'PRC-1234567', credentialExpiresAt: '2099-10-29', isVerified: true };
  for (const changes of [{ isVerified: false }, { role: 'admin' }, { licenseNumber: null }, { credentialExpiresAt: null }, { credentialExpiresAt: '2000-01-01' }]) {
    await assert.rejects(security.signClinicalRecord({ staffProfile: { ...profile, ...changes }, entityType: 'vital', entityId: 'fixture', actionType: 'SIGN' }), (error) => error.statusCode === 403 && error.code === 'PROFESSIONAL_CREDENTIAL_REQUIRED');
  }
  assert.equal(writes.length, 0);
  await security.signClinicalRecord({ staffProfile: profile, entityType: 'vital', entityId: 'fixture', actionType: 'SIGN' });
  assert.equal(writes.filter((sql) => /INSERT INTO digital_signatures/.test(sql)).length, 1);
});
