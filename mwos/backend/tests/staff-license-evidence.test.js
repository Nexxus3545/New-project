const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const professional = require('../src/middleware/professionalCredential');

test('credential onboarding exceptions do not open clinical or other staff account routes', () => {
  for (const [method, requestPath] of [
    ['GET', '/account/security'], ['POST', '/account/security/request'], ['GET', '/account/activity'],
    ['GET', '/staff/registry/me'], ['POST', '/staff/registry/me/documents'],
    ['GET', '/notifications'], ['GET', '/notifications/settings'], ['PATCH', '/notifications/self/read'],
  ]) assert.equal(professional.isCredentialSelfServiceRoute({ method, path: requestPath }), true);
  for (const [method, requestPath] of [
    ['POST', '/security/sign'], ['POST', '/notifications'], ['GET', '/staff/registry/other/documents'],
    ['PATCH', '/staff/registry/me/license'], ['POST', '/pregnancies'], ['GET', '/patients'],
    ['PATCH', '/interactions/teleconsults/self'],
  ]) assert.equal(professional.isCredentialSelfServiceRoute({ method, path: requestPath }), false);
});

function fixture(proof) {
  const statements = [];
  let saved = 0, released = false;
  const query = async (sql) => {
    const statement = sql.replace(/\s+/g, ' ').trim();
    statements.push(statement);
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [] };
    if (statement.startsWith('SELECT id, role')) return { rows: [{ id: 'target', role: 'nurse' }] };
    if (statement.startsWith('SELECT status, license_number')) return { rows: proof ? [proof] : [] };
    if (statement.startsWith('SELECT sr.*')) return { rows: [{ license_status: 'pending', license_number: 'PRC-123', credential_expires_at: '2099-01-01' }] };
    throw Error('Unexpected query ' + statement);
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/staff.controller.js'), 'utf8'), {
    module, exports: module.exports, Date,
    require: (name) => {
      if (name === '../config/database') return { getClient: async () => ({ query, release: () => { released = true; } }) };
      if (name === '../middleware/professionalCredential') return professional;
      if (name === '../utils/security') return { recordSecurityAudit: async () => {} };
      if (name === '../utils/staff') return { publicStaffProfile: (row) => row, normalizeLicenseStatus: (v) => v,
        upsertStaffRegistry: async () => { saved++; return { staffId: 'staff' }; }, recordLicenseEvent: async () => {},
        fetchStaffProfileByUserId: async () => ({ isVerified: true }) };
      throw Error('Unexpected import ' + name);
    },
  });
  return { invoke: async (body = {}) => {
    let status = 200, payload, error;
    const res = { status: (value) => { status = value; return res; }, json: (value) => { payload = value; } };
    await module.exports.updateLicense({ user: { id: 'reviewer', role: 'admin' }, params: { userId: 'target' }, body: { status: 'verified', ...body }, stepUp: {} }, res, (value) => { error = value; });
    return { status, payload, error, saved, released, statements };
  } };
}

test('legacy license verification cannot bypass evidence review or replace approved license metadata', async () => {
  const valid = { status: 'verified', license_number: 'PRC-123', expires_at: '2099-01-01' };
  for (const [proof, changes] of [
    [null, {}], [{ ...valid, status: 'pending' }, {}], [{ ...valid, status: 'rejected' }, {}],
    [valid, { licenseNumber: 'OTHER' }], [valid, { credentialExpiresAt: '2099-02-01' }],
    [valid, { licenseNumber: 123 }], [{ ...valid, expires_at: '2000-01-01' }, { credentialExpiresAt: '2000-01-01' }],
  ]) {
    const result = await fixture(proof).invoke(changes);
    assert.equal(result.status, 409);
    assert.equal(result.payload.code, 'CREDENTIAL_REVIEW_REQUIRED');
    assert.equal(result.saved, 0); assert.equal(result.released, true);
    assert.equal(result.statements.includes('COMMIT'), false);
    assert.equal(result.statements.at(-1), 'ROLLBACK');
  }
  const result = await fixture(valid).invoke();
  assert.equal(result.error, undefined); assert.equal(result.status, 200); assert.equal(result.saved, 1);
  assert.equal(result.statements.at(-1), 'COMMIT');
});
