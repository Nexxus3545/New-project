const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const helpers = require('../src/utils/accountCredentials');

const patient = '11111111-1111-4111-8111-111111111111';
const admin = '22222222-2222-4222-8222-222222222222';
const different = '33333333-3333-4333-8333-333333333333';
const pdf = Buffer.from('%PDF-1.7\nSynthetic credential fixture only.');
const file = () => ({ name: 'synthetic-id.pdf', mimeType: 'application/pdf', dataBase64: pdf.toString('base64') });
const patientSubmission = () => ({ documentType: 'philhealth_id', idLast4: '1234', consent: true, file: file() });
const licenseSubmission = () => ({ documentType: 'professional_license', licenseNumber: 'PRC-SYNTHETIC-123', expiresAt: '2099-12-31', consent: true, file: file() });
const record = (role = 'patient') => ({ user_id: patient, kind: helpers.requirementForRole(role), document_type: role === 'patient' ? 'national_id' : 'professional_license', document_label: role === 'patient' ? 'National ID' : 'PRC / professional license', license_number: role === 'patient' ? null : 'PRC-SYNTHETIC-123', id_last4: '1234', expires_at: role === 'patient' ? null : '2099-12-31', status: 'pending', revision: 1, document_bytes: pdf, has_document: true, file_name: 'synthetic-id.pdf', mime_type: 'application/pdf', submitted_at: '2026-10-29T01:00:00Z', reviewed_at: null, review_notes: null });

function harness(options = {}) {
  const role = options.role || 'patient';
  let current = options.missingCredential ? null : { ...record(role), ...options.record };
  let backup;
  let acquired = 0, released = 0, committed = 0, rolledBack = 0, audits = 0, staffWrites = 0;
  const queries = [];
  const query = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim(); queries.push({ sql: text, params });
    if (text === 'BEGIN') { backup = current && { ...current }; return { rows: [] }; }
    if (text === 'COMMIT') { committed++; return { rows: [] }; }
    if (text === 'ROLLBACK') { rolledBack++; current = backup; return { rows: [] }; }
    if (text.startsWith('SELECT id, role, is_active FROM users')) return { rows: options.missingUser ? [] : [{ id: params[0], role: params[0] === admin ? 'admin' : role, is_active: true }] };
    if (text.startsWith('SELECT user_id, kind,')) return { rows: current ? [{ ...current }] : [] };
    if (text.startsWith('SELECT document_bytes, mime_type')) return { rows: current ? [{ document_bytes: current.document_bytes, mime_type: current.mime_type }] : [] };
    if (text.startsWith('INSERT INTO account_credentials')) {
      current = { user_id: params[0], kind: params[1], document_type: params[2], document_label: params[3], license_number: params[4], id_last4: params[5], expires_at: params[6], status: 'pending', revision: (current?.revision || 0) + 1, document_bytes: params[7], file_name: params[8], mime_type: params[9], has_document: true, submitted_at: '2026-10-29T02:00:00Z', reviewed_at: null, review_notes: null };
      return { rows: [{ ...current }] };
    }
    if (text.startsWith('UPDATE account_credentials')) { current = { ...current, status: params[1], reviewed_by: params[2], review_notes: params[3], reviewed_at: '2026-10-29T03:00:00Z' }; return { rows: [{ ...current }] }; }
    if (text.startsWith('INSERT INTO staff_registry')) { staffWrites++; return { rows: [{ id: different }] }; }
    if (text.startsWith('INSERT INTO license_verification_events')) { if (options.failLicenseEvent) throw Error('Synthetic license event failure'); return { rows: [] }; }
    if (text.startsWith('INSERT INTO security_audit')) { if (options.failAudit) throw Error('Synthetic audit failure'); audits++; return { rows: [] }; }
    throw Error('Unexpected SQL in credential test: ' + text);
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/credential.controller.js'), 'utf8'), {
    module, exports: module.exports, Date, Set, JSON, Buffer,
    require: (name) => {
      if (name === '../config/database') return { getClient: async () => { acquired++; return { query, release: () => { released++; } }; } };
      if (name === '../utils/accountCredentials') return helpers;
      if (name === '../middleware/stepUp') return { resolveStepUpContext: (req, purpose) => { assert.equal(purpose, 'license-change'); if (options.noStepUp) throw Error('Verification needed'); req.stepUp = { authMethod: 'Passkey', credentialStrength: 'Step_Up' }; } };
      throw Error('Unexpected require: ' + name);
    },
  });
  return {
    async invoke(action, body, user = { id: patient, role }, params = { userId: patient }) {
      let status = 200, payload, failure; const headers = {};
      const res = { set(k, v) { headers[k] = v; return res; }, status(value) { status = value; return res; }, json(value) { payload = value; return res; }, send(value) { payload = value; return res; } };
      await module.exports[action]({ user, params, body, headers: {}, ip: '127.0.0.1' }, res, (error) => { failure = error; });
      return { status, payload, failure, headers };
    },
    state: () => ({ current, acquired, released, committed, rolledBack, audits, staffWrites, queries }),
  };
}

test('patients require one government ID and clinical roles require a professional license', () => {
  assert.equal(helpers.requirementForRole('admin'), 'none');
  for (const role of ['doctor', 'nurse', 'midwife']) {
    assert.equal(helpers.requirementForRole(role), 'professional_license');
    assert.equal(helpers.validateSubmission(role, licenseSubmission()).kind, 'professional_license');
    assert.throws(() => helpers.validateSubmission(role, patientSubmission()));
  }
  for (const documentType of Object.keys(helpers.PATIENT_DOCUMENTS)) {
    const draft = { ...patientSubmission(), documentType, documentLabel: 'Synthetic government card' };
    assert.equal(helpers.validateSubmission('patient', draft).kind, 'patient_id');
  }
  assert.throws(() => helpers.validateSubmission('admin', licenseSubmission()));
  assert.throws(() => helpers.validateSubmission('patient', licenseSubmission()));
  assert.throws(() => helpers.validateSubmission('patient', { ...patientSubmission(), idLast4: '123456789' }));
  assert.throws(() => helpers.validateSubmission('patient', { ...patientSubmission(), consent: false }));
  assert.throws(() => helpers.validateSubmission('patient', { ...patientSubmission(), documentType: 'other_government_id' }));
});

test('documents require exact base64, size, permitted MIME and matching content signatures', () => {
  assert.equal(helpers.decodeDocument(file()).bytes.equals(pdf), true);
  for (const invalidFile of [
    { ...file(), mimeType: 'text/html' }, { ...file(), dataBase64: 'data:application/pdf;base64,' + file().dataBase64 },
    { ...file(), dataBase64: file().dataBase64 + '\n' }, { ...file(), dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') },
    { ...file(), mimeType: 'image/png' }, { ...file(), dataBase64: Buffer.alloc(helpers.MAX_DOCUMENT_BYTES + 1).toString('base64') },
  ]) assert.throws(() => helpers.decodeDocument(invalidFile));
  assert.equal(helpers.decodeDocument({ name: 'photo.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64') }).mimeType, 'image/jpeg');
  assert.equal(helpers.decodeDocument({ name: 'photo.png', mimeType: 'image/png', dataBase64: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString('base64') }).mimeType, 'image/png');
});

test('license expiry uses valid calendar dates strictly after today in Manila', () => {
  const now = new Date('2030-06-13T17:00:00Z');
  assert.equal(helpers.manilaToday(now), '2030-06-14');
  assert.equal(helpers.futureExpiry('2030-06-15', true, now), '2030-06-15');
  for (const value of [undefined, '2030-06-14', '2030-02-30', '2030-13-01', '2030-06-15T00:00:00Z']) assert.throws(() => helpers.futureExpiry(value, true, now));
  assert.equal(helpers.futureExpiry(undefined, false, now), null);
  assert.throws(() => helpers.validateSubmission('nurse', { ...licenseSubmission(), licenseNumber: '' }));
});

test('credential metadata never serializes document bytes or a full patient ID', async () => {
  const app = harness({ record: { valid_id_number: 'PRIVATE-FULL-ID', document_bytes: Buffer.from('PRIVATE-BYTES') } });
  const result = await app.invoke('getMine', {}, { id: patient, role: 'patient' }, { userId: different });
  assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.payload.data.credential.userId, patient);
  assert.equal(JSON.stringify(result.payload).includes('PRIVATE'), false);
  assert.equal(Object.hasOwn(result.payload.data.credential, 'document_bytes'), false);
  assert.equal(app.state().queries[0].params[0], patient, 'An own-credential request ignores target ID tampering');
  assert.equal(app.state().queries.some((entry) => entry.sql.includes('SELECT *')), false);
});

test('authentication, role and step-up failures cannot read or mutate someone else’s credentials', async () => {
  for (const action of ['getMine', 'submitMine', 'downloadMine']) {
    const app = harness(); const result = await app.invoke(action, patientSubmission(), null);
    assert.equal(result.status, 401); assert.equal(app.state().acquired, 0);
  }
  for (const action of ['getForUser', 'submitForUser', 'reviewForUser', 'downloadForUser']) {
    const app = harness(); const result = await app.invoke(action, patientSubmission());
    assert.equal(result.status, 403); assert.equal(app.state().acquired, 0);
  }
  for (const action of ['submitForUser', 'reviewForUser']) {
    const app = harness({ noStepUp: true }); const result = await app.invoke(action, patientSubmission(), { id: admin, role: 'admin' });
    assert.equal(result.status, 403); assert.equal(result.payload.code, 'STEP_UP_REQUIRED'); assert.equal(app.state().acquired, 0);
  }
});

test('replacement submissions reset review and professional verification in the same transaction', async () => {
  const app = harness({ role: 'nurse', record: { status: 'verified', revision: 4, review_notes: 'Old approval' } });
  const result = await app.invoke('submitMine', licenseSubmission());
  assert.equal(result.status, 201); assert.equal(result.failure, undefined);
  assert.equal(result.payload.data.credential.status, 'pending'); assert.equal(result.payload.data.credential.revision, 5);
  assert.equal(result.payload.data.credential.reviewNotes, null); assert.equal(app.state().staffWrites, 1);
  assert.equal(app.state().committed, 1); assert.equal(app.state().audits, 1); assert.equal(app.state().released, 1);
  assert.ok(app.state().queries[1].sql.endsWith('FOR UPDATE'), 'The user lock serializes replacement and review');
  assert.equal(app.state().queries.find((entry) => entry.sql.startsWith('INSERT INTO security_audit')).params.at(-1).includes('PRC-SYNTHETIC'), false);
});

test('admin approval binds to the current pending revision and syncs clinical license verification atomically', async () => {
  const app = harness({ role: 'doctor' });
  const result = await app.invoke('reviewForUser', { status: 'verified', revision: 1, reviewNotes: 'Reviewed synthetic card and expiry.' }, { id: admin, role: 'admin' });
  assert.equal(result.status, 200); assert.equal(result.failure, undefined);
  assert.equal(result.payload.data.credential.status, 'verified'); assert.equal(app.state().staffWrites, 1);
  assert.equal(app.state().committed, 1); assert.equal(app.state().audits, 1);
  const repeated = await app.invoke('reviewForUser', { status: 'verified', revision: 1, reviewNotes: 'Repeat' }, { id: admin, role: 'admin' });
  assert.equal(repeated.status, 409); assert.equal(repeated.payload.code, 'CREDENTIAL_REVISION_CONFLICT');
  for (const options of [{ record: { revision: 2 } }, { record: { status: 'rejected' } }, { record: { kind: 'professional_license' } }, { record: { has_document: false } }]) {
    const rejected = harness(options); const response = await rejected.invoke('reviewForUser', { status: 'verified', revision: 1, reviewNotes: 'Reviewed fixture' }, { id: admin, role: 'admin' });
    assert.equal(response.status, 409); assert.equal(rejected.state().committed, 0);
  }
  const self = harness({ role: 'admin' });
  assert.equal((await self.invoke('reviewForUser', { status: 'verified', revision: 1, reviewNotes: 'Self' }, { id: admin, role: 'admin' }, { userId: admin })).status, 403);
});

test('expired licenses, missing review notes, audit or license-event failures never commit an approval', async () => {
  for (const options of [{ failAudit: true }, { failLicenseEvent: true }, { record: { expires_at: '2000-01-01' } }]) {
    const app = harness({ role: 'doctor', ...options });
    const result = await app.invoke('reviewForUser', { status: 'verified', revision: 1, reviewNotes: 'Reviewed fixture' }, { id: admin, role: 'admin' });
    assert.ok(result.failure || result.status === 400); assert.equal(app.state().committed, 0); assert.equal(app.state().current.status, 'pending'); assert.equal(app.state().rolledBack, 1);
  }
  const missingNotes = harness();
  assert.equal((await missingNotes.invoke('reviewForUser', { status: 'rejected', revision: 1 }, { id: admin, role: 'admin' })).status, 400);
  assert.equal(missingNotes.state().acquired, 0);
  const failedSubmission = harness({ failAudit: true });
  const result = await failedSubmission.invoke('submitMine', patientSubmission());
  assert.ok(result.failure); assert.equal(failedSubmission.state().committed, 0); assert.equal(failedSubmission.state().current.revision, 1);
});

test('private document downloads are authenticated attachments, audited, and never public URLs', async () => {
  const app = harness(); const result = await app.invoke('downloadMine');
  assert.equal(result.status, 200); assert.equal(Buffer.isBuffer(result.payload), true); assert.ok(result.payload.equals(pdf));
  assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.headers['Content-Type'], 'application/pdf'); assert.match(result.headers['Content-Disposition'], /^attachment;/);
  assert.match(result.headers['Content-Security-Policy'], /sandbox/); assert.equal(app.state().audits, 1);
  const failedAudit = harness({ failAudit: true });
  const denied = await failedAudit.invoke('downloadForUser', {}, { id: admin, role: 'admin' });
  assert.ok(denied.failure); assert.equal(denied.payload, undefined);
});
