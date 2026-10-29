const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { requirementForRole, dateOnly } = require('../src/utils/accountCredentials');
const { analyzeCredential } = require('../src/utils/credentialAnalysis');

const userId = '11111111-1111-4111-8111-111111111111';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const oldToken = '22222222-2222-4222-8222-222222222222';
const perfect = () => ({ status: 'processed', confidence: 95, pagesScanned: 1,
  text: 'PROFESSIONAL REGULATION COMMISSION\nSYNTHETIC CLINICIAN\nREGISTERED NURSE\nLicense No: 765-4321\nValid Until: 31 December 2099' });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

function fixture(options = {}) {
  const state = {
    birthDate: '1990-02-14',
    user: { id: userId, role: options.role || 'nurse', first_name: 'Synthetic', last_name: 'Clinician' },
    credential: { user_id: userId, kind: options.kind || 'professional_license', document_type: 'professional_license',
      document_label: 'PRC / professional license', license_number: '7654321', expires_at: '2099-12-31',
      document_bytes: Buffer.from('%PDF-1.4\nSYNTHETIC PRIVATE FILE'), mime_type: 'application/pdf', revision: 1,
      status: options.credentialStatus || 'pending', scan_status: 'not_scanned', scan_revision: null, scan_token: null, scan_started_at: null, scan_result: null,
      ...(options.credential || {}) },
    held: 0, acquired: 0, released: 0, ocrCalls: 0, queries: [], audits: [], rollbackCount: 0, startedBuffers: [],
  };
  const copy = (value) => value ? { ...value, ...(value.document_bytes ? { document_bytes: Buffer.from(value.document_bytes) } : {}) } : value;
  const getClient = async () => {
    assert.equal(state.held, 0, 'The service must work with a one-client pool and release it before OCR/failure cleanup');
    state.held++; state.acquired++;
    let open = false, candidate, pendingAudit;
    const query = async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      state.queries.push({ sql: text, params });
      const row = () => candidate || state.credential;
      if (text === 'BEGIN') { open = true; return { rows: [] }; }
      if (text === 'COMMIT') {
        if (candidate) state.credential = candidate;
        if (pendingAudit) state.audits.push(pendingAudit);
        open = false; candidate = null; return { rows: [] };
      }
      if (text === 'ROLLBACK') { state.rollbackCount++; open = false; candidate = null; pendingAudit = null; return { rows: [] }; }
      if (text.startsWith('SELECT id, role, first_name')) return { rows: options.noUser ? [] : [copy(state.user)] };
      if (text.startsWith('SELECT user_id, kind, document_type')) {
        const value = copy(row());
        const started = new Date(value.scan_started_at).getTime();
        value.scan_lease_active = Number.isFinite(started) && started > Date.now() - 90000 && started <= Date.now() + 5000;
        return { rows: options.noCredential ? [] : [value] };
      }
      if (text.startsWith('SELECT EXISTS')) {
        assert.match(params[0], /^[a-f0-9]{64}$/);
        assert.equal(params[1], userId);
        return { rows: [{ duplicate_detected: Boolean(options.duplicate), other_user_name: 'PRIVATE OTHER USER', other_user_id: 'PRIVATE-ID' }] };
      }
      if (text.startsWith('SELECT date_of_birth')) return { rows: [{ date_of_birth: state.birthDate }] };
      if (text.startsWith("UPDATE account_credentials SET document_sha256")) {
        assert.ok(open); candidate = { ...row(), document_sha256: params[1], scan_status: 'processing', scan_revision: params[2], scan_token: params[3], scan_started_at: new Date().toISOString(), scanned_at: null, scan_result: null };
        return { rows: [] };
      }
      if (text.startsWith('UPDATE account_credentials SET scan_status = $2')) {
        assert.ok(open);
        if (options.failFinalize) throw Error('Synthetic finalization database failure');
        if (options.zeroRows || row().revision !== params[3] || row().scan_token !== params[4]) return { rows: [] };
        candidate = { ...row(), scan_status: params[1], scan_result: JSON.parse(params[2]), scanned_at: new Date().toISOString(), scan_token: null };
        return { rows: [{ user_id: userId }] };
      }
      if (text.startsWith('INSERT INTO security_audit')) {
        assert.ok(open);
        if (options.failAudit) throw Error('Synthetic strict audit failure');
        pendingAudit = JSON.parse(params[1]);
        return { rows: [] };
      }
      if (text.startsWith("UPDATE account_credentials SET scan_status = 'failed'")) {
        assert.equal(open, false);
        if (state.credential.revision === params[1] && state.credential.scan_revision === params[1] && state.credential.scan_token === params[2]) state.credential = { ...state.credential, scan_status: 'failed', scan_token: null };
        return { rows: [] };
      }
      throw Error('Unexpected query ' + text);
    };
    return { query, release: () => { assert.equal(state.held, 1); state.held--; state.released++; } };
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/credentialScan.js'), 'utf8'), {
    module, Buffer, Date,
    require: (name) => {
      if (name === 'node:crypto') return crypto;
      if (name === '../config/database') return { getClient };
      if (name === './accountCredentials') return { requirementForRole, dateOnly };
      if (name === './credentialAnalysis') return { analyzeCredential };
      if (name === './credentialOcr') return { extractCredentialText: async (bytes, type, config) => {
        assert.equal(state.held, 0, 'OCR must never hold a database connection');
        assert.equal(type, 'application/pdf');
        assert.deepEqual(JSON.parse(JSON.stringify(config)), { timeoutMs: 25000, maxPages: 2 });
        assert.ok(bytes.equals(Buffer.from('%PDF-1.4\nSYNTHETIC PRIVATE FILE')));
        state.ocrCalls++; state.startedBuffers.push(bytes);
        return options.ocr ? options.ocr(state.ocrCalls, state) : perfect();
      } };
      throw Error('Unexpected import ' + name);
    },
  });
  return { state, scan: (values = {}) => module.exports.scanCredential({ userId, revision: 1, actorId, ...values }) };
}

test('a successful scan releases the lease connection before OCR and never verifies the credential', async () => {
  const app = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(await app.scan())), { outcome: 'scanned', revision: 1 });
  const { state } = app;
  assert.equal(state.credential.status, 'pending');
  assert.equal(state.credential.scan_status, 'completed');
  assert.equal(state.credential.scan_result.outcome, 'ready_for_review');
  assert.equal(state.credential.scan_result.authenticity, 'not_verified');
  assert.equal(state.credential.scan_token, null);
  assert.deepEqual(state.audits, [{ actorId, revision: 1, outcome: 'ready_for_review' }]);
  assert.equal(state.held, 0); assert.equal(state.acquired, state.released);
  assert.ok(state.startedBuffers[0].every((byte) => byte === 0), 'The transient OCR buffer is released after use');
  for (const query of state.queries.filter((entry) => entry.sql.startsWith('UPDATE account_credentials'))) assert.equal(/SET status\s*=/.test(query.sql), false);
  const firstRowLock = state.queries.findIndex((entry) => entry.sql.startsWith('SELECT id, role'));
  assert.ok(firstRowLock < state.queries.findIndex((entry) => entry.sql.startsWith('SELECT user_id, kind')));
});

test('an active processing lease serializes concurrent requests and avoids duplicate OCR work', async () => {
  const entered = deferred(), worker = deferred();
  const app = fixture({ ocr: () => { entered.resolve(); return worker.promise; } });
  const first = app.scan(); await entered.promise;
  assert.equal((await app.scan()).outcome, 'processing');
  assert.equal(app.state.ocrCalls, 1); assert.equal(app.state.held, 0);
  worker.resolve(perfect());
  assert.equal((await first).outcome, 'scanned'); assert.equal(app.state.audits.length, 1);
});

test('an expired lease can be reclaimed and a late older worker cannot overwrite its new receipt', async () => {
  const entered = deferred(), oldWorker = deferred();
  const app = fixture({ ocr: (number) => { if (number === 1) { entered.resolve(); return oldWorker.promise; } return perfect(); } });
  const first = app.scan(); await entered.promise;
  const token = app.state.credential.scan_token;
  app.state.credential.scan_started_at = new Date(Date.now() - 91000).toISOString();
  assert.equal((await app.scan()).outcome, 'scanned');
  const stored = JSON.stringify(app.state.credential.scan_result);
  oldWorker.resolve({ ...perfect(), text: 'OTHER PERSON MISMATCH' });
  assert.equal((await first).outcome, 'stale');
  assert.equal(JSON.stringify(app.state.credential.scan_result), stored);
  assert.equal(app.state.audits.length, 1); assert.equal(app.state.ocrCalls, 2);
  assert.ok(app.state.queries.some((entry) => entry.sql.includes('scan_token = $5') && entry.params[4] !== token));
});

test('replacing the file or changing role/name while OCR is pending makes the old scan stale', async () => {
  for (const change of [
    (state) => { state.credential = { ...state.credential, revision: 2, scan_status: 'not_scanned', scan_revision: null, scan_token: null, scan_result: null }; },
    (state) => { state.user.role = 'doctor'; },
    (state) => { state.user.first_name = 'Changed'; },
  ]) {
    const entered = deferred(), worker = deferred();
    const app = fixture({ ocr: () => { entered.resolve(); return worker.promise; } });
    const running = app.scan(); await entered.promise; change(app.state); worker.resolve(perfect());
    assert.equal((await running).outcome, 'stale');
    assert.equal(app.state.credential.scan_result, null); assert.equal(app.state.audits.length, 0); assert.equal(app.state.held, 0);
  }
});

test('duplicate detection reveals only a fixed additional-review flag, not hashes or other account details', async () => {
  const app = fixture({ duplicate: true }); await app.scan();
  const stored = JSON.stringify(app.state.credential.scan_result) + JSON.stringify(app.state.audits);
  assert.equal(app.state.credential.scan_result.outcome, 'needs_attention');
  for (const value of ['PRIVATE OTHER USER', 'PRIVATE-ID', '7654321', app.state.credential.document_sha256, perfect().text]) assert.equal(stored.includes(value), false);
});

test('worker failures, unsupported input and scan limits become explicit manual-review results', async () => {
  for (const [ocr, expected] of [
    [() => { throw Error('PRIVATE WORKER DIAGNOSTIC'); }, 'unavailable'],
    [() => ({ status: 'unsupported', text: '', confidence: null, pagesScanned: 0 }), 'unreadable'],
    [() => ({ status: 'unreadable', text: '', confidence: 5, pagesScanned: 1 }), 'unreadable'],
    [() => ({ ...perfect(), reason: 'PAGE_LIMIT_REACHED' }), 'completed'],
    [() => ({ ...perfect(), reason: 'TEXT_LIMIT_REACHED' }), 'completed'],
  ]) {
    const app = fixture({ ocr });
    assert.equal((await app.scan()).outcome, 'scanned');
    assert.equal(app.state.credential.scan_status, expected);
    assert.equal(app.state.credential.scan_result.outcome, 'manual_review');
    assert.equal(app.state.credential.status, 'pending');
    assert.equal(JSON.stringify(app.state.credential.scan_result).includes('PRIVATE WORKER'), false);
  }
});

test('strict audit or finalization failures roll back success and mark only the bound lease failed', async () => {
  for (const options of [{ failAudit: true }, { failFinalize: true }]) {
    const app = fixture(options);
    await assert.rejects(app.scan(), /Synthetic/);
    assert.equal(app.state.credential.scan_status, 'failed');
    assert.equal(app.state.credential.scan_result, null); assert.equal(app.state.audits.length, 0);
    assert.equal(app.state.credential.status, 'pending');
    assert.equal(app.state.acquired, app.state.released); assert.equal(app.state.held, 0);
    const failed = app.state.queries.find((entry) => entry.sql.startsWith("UPDATE account_credentials SET scan_status = 'failed'"));
    assert.match(failed.sql, /revision = \$2 AND scan_revision = \$2 AND scan_token = \$3/);
  }
});

test('invalid inputs, missing evidence and initial stale revisions cannot start OCR', async () => {
  for (const values of [{ userId: 'not-a-user' }, { actorId: 'invalid' }, { revision: 0 }, { revision: '1' }]) {
    const app = fixture(); await assert.rejects(app.scan(values), (error) => error.statusCode === 400); assert.equal(app.state.acquired, 0);
  }
  for (const options of [{ noUser: true }, { noCredential: true }, { kind: 'patient_id' }, { role: 'admin' }, { credential: { document_bytes: Buffer.alloc(0) } }]) {
    const app = fixture(options); await assert.rejects(app.scan(), (error) => [404, 409].includes(error.statusCode)); assert.equal(app.state.ocrCalls, 0); assert.equal(app.state.held, 0);
  }
  const app = fixture(); assert.equal((await app.scan({ revision: 2 })).outcome, 'stale'); assert.equal(app.state.ocrCalls, 0);
  const zeroRows = fixture({ zeroRows: true }); assert.equal((await zeroRows.scan()).outcome, 'stale'); assert.equal(zeroRows.state.audits.length, 0);
});

test('patient DOB is read only from the target account and existing clinic verification is preserved', async () => {
  const app = fixture({ role: 'patient', kind: 'patient_id', credentialStatus: 'verified', credential: { document_type: 'national_id', expires_at: null, license_number: null },
    ocr: () => ({ status: 'processed', confidence: 90, pagesScanned: 1, text: 'PHILIPPINE IDENTIFICATION SYSTEM\nSYNTHETIC CLINICIAN\nDate of Birth: 1990-02-14' }) });
  await app.scan();
  assert.equal(app.state.credential.status, 'verified');
  assert.equal(app.state.credential.scan_result.checks.find((item) => item.code === 'date_of_birth').result, 'pass');
  const dob = app.state.queries.find((entry) => entry.sql.startsWith('SELECT date_of_birth'));
  assert.deepEqual(JSON.parse(JSON.stringify(dob.params)), [userId]);
  const entered = deferred(), worker = deferred();
  const changed = fixture({ role: 'patient', kind: 'patient_id', credential: { document_type: 'national_id', expires_at: null, license_number: null }, ocr: () => { entered.resolve(); return worker.promise; } });
  const running = changed.scan(); await entered.promise; changed.state.birthDate = '1990-02-15'; worker.resolve(perfect());
  assert.equal((await running).outcome, 'stale'); assert.equal(changed.state.credential.scan_result, null);
});
