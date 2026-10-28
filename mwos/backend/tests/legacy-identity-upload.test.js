const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const identity = require('../src/utils/identityDocumentTypes');

const userId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const staffId = '44444444-4444-4444-8444-444444444444';

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    module, exports: module.exports, Buffer, Date, Set, JSON, process, console, ...globals,
    require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error('Unexpected legacy upload dependency: ' + name); },
  });
  return module.exports;
}
function response() {
  const value = { status: 200, body: undefined };
  value.res = { status(code) { value.status=code;return value.res; }, json(body) { value.body=body;return value.res; } };
  return value;
}
async function cleanupFixture(dir) {
  const resolved = path.resolve(dir);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^mwos-legacy-identity-[A-Za-z0-9]+$/);
  await fs.promises.rm(resolved, { recursive: true, force: true });
}

test('identity document aliases are separated from clinical records and training evidence', () => {
  for (const value of ['Government ID', 'other_government_id', 'Government-issued valid ID', 'PhilHealth ID', 'philhealth_id', 'National ID', 'National Identification Card', 'ePhilID', 'PhilSys ID', 'Philippine Identification Card', 'Passport', "Driver's License", 'UMID', 'SSS ID', 'GSIS ID', 'Postal ID', "Voter's ID", 'Barangay ID', 'TIN ID', 'PRC ID', 'PRC License', 'Professional Identification Card', 'professional_license', 'Professional registration', 'PRC Certificate of Registration', 'Medical License', 'Nurse License', 'Midwife license', 'License']) assert.equal(identity.isIdentityDocumentType(value), true, value);
  for (const value of ['Birthing ID', 'Patient ID', 'Hospital ID', 'Ultrasound Result', 'Laboratory Result', 'Medical Certificate', 'Prenatal Record', 'BLS Certificate', 'Seminar Certificate', 'Training Certificate', 'PRC CPD Training Certificate']) assert.equal(identity.isIdentityDocumentType(value), false, value);
  assert.equal(identity.isIdentityDocumentType(['Ultrasound Result', 'Government ID']), true);
});

test('metadata-first and file-first multipart government IDs never reach OCR or public document records; clinical uploads still work', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mwos-legacy-identity-'));
  let server;
  try {
    const uploads = load('middleware/uploads.js', { fs, path, multer: require('multer'), '../utils/identityDocumentTypes': identity }, { process: { cwd: () => root } });
    const queries = []; let ocrCalls = 0;
    const query = async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id FROM patients')) return { rows: [{ id: patientId }] };
      if (sql.includes('INSERT INTO patient_documents')) return { rows: [{ id: sessionId, document_type: params[2], file_url: params[4] }] };
      if (sql.startsWith('SELECT id FROM staff_registry')) return { rows: [{ id: staffId }] };
      if (sql.includes('FROM staff_registry sr')) return { rows: [{ id: staffId, staff_name: 'Synthetic Nurse' }] };
      if (sql.includes('INSERT INTO staff_documents')) return { rows: [{ id: sessionId, staff_id: staffId, document_type: params[2], file_url: params[5] }] };
      throw Error('Unexpected legacy document query');
    };
    const documentCtrl = load('controllers/document.controller.js', {
      '../config/database': { query }, '../utils/ocr': { extractDocumentInsights: async () => { ocrCalls++; return { status: 'complete', text: null, extractedData: {} }; } },
      '../middleware/uploads': uploads, '../utils/identityDocumentTypes': identity,
    });
    const staffCtrl = load('controllers/staffDocument.controller.js', {
      '../config/database': { query }, '../middleware/uploads': uploads, '../utils/identityDocumentTypes': identity,
    });
    const app = require('express')();
    app.use((req, _res, next) => { req.user={ id: userId, role: req.path.startsWith('/staff') ? 'nurse' : 'patient' };next(); });
    app.post('/patient', uploads.uploadDocument.single('file'), documentCtrl.uploadMine);
    app.post('/staff', uploads.uploadDocument.single('file'), staffCtrl.uploadMine);
    app.post('/staff/:staffId', uploads.uploadDocument.single('file'), staffCtrl.uploadForStaff);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, code: error.code, message: error.message }));
    server = await new Promise((resolve) => { const listening=app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function upload(route, type, fileFirst) {
      const form = new FormData();
      if (!fileFirst) form.append('documentType', type);
      form.append('file', new Blob(['%PDF-1.7\nSynthetic document only.'], { type: 'application/pdf' }), 'synthetic-document.pdf');
      if (fileFirst) form.append('documentType', type);
      const result = await fetch(origin + route, { method: 'POST', body: form });
      return { status: result.status, body: await result.json() };
    }
    for (const [route, type, first] of [['/patient','Government ID',false], ['/patient','PhilHealth ID',true], ['/patient','national_id',true], ['/staff','Professional License',true], [`/staff/${staffId}`,'PRC ID',true]]) {
      const result = await upload(route, type, first);
      assert.equal(result.status, 400); assert.equal(result.body.code, identity.PRIVATE_CREDENTIAL_UPLOAD_CODE);
      assert.match(result.body.message, /private Account credentials/);
      assert.equal(queries.length, 0); assert.equal(ocrCalls, 0);
      const documentRoot = path.join(uploads.uploadsRoot, 'documents');
      assert.deepEqual(fs.existsSync(documentRoot) ? await fs.promises.readdir(documentRoot) : [], []);
    }
    for (const type of ['Ultrasound Result', 'Birthing ID']) {
      const result = await upload('/patient', type, false);
      assert.equal(result.status, 201); assert.equal(result.body.data.document_type, type);
    }
    assert.equal(ocrCalls, 2);
    assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO patient_documents')).length, 2);
    const clinical = await upload('/staff', 'BLS Certificate', true);
    assert.equal(clinical.status, 201); assert.equal(clinical.body.data.documentType, 'BLS Certificate');
    assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO staff_documents')).length, 1);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await cleanupFixture(root);
  }
});

test('file-first cleanup refuses paths outside the document root, traversal, sibling prefixes and linked external targets', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mwos-legacy-identity-'));
  try {
    const uploadsRoot = path.join(root, 'uploads'), documentRoot = path.join(uploadsRoot, 'documents');
    const outside = path.join(root, 'protected.txt'), sibling = path.join(uploadsRoot, 'documents-other', 'protected.txt');
    await fs.promises.mkdir(documentRoot, { recursive: true }); await fs.promises.mkdir(path.dirname(sibling), { recursive: true });
    await fs.promises.writeFile(outside, 'protected'); await fs.promises.writeFile(sibling, 'protected');
    const safeFile = path.join(documentRoot, 'rejected.pdf'); await fs.promises.writeFile(safeFile, 'synthetic ID');
    await identity.removeRejectedIdentityFile(safeFile, uploadsRoot); assert.equal(fs.existsSync(safeFile), false);
    for (const value of [outside, sibling, path.join(documentRoot, '..', 'documents-other', 'protected.txt'), documentRoot]) await identity.removeRejectedIdentityFile(value, uploadsRoot);
    assert.equal(await fs.promises.readFile(outside, 'utf8'), 'protected'); assert.equal(await fs.promises.readFile(sibling, 'utf8'), 'protected');
    const externalDir = path.join(root, 'external'), linked = path.join(documentRoot, 'linked');
    await fs.promises.mkdir(externalDir); await fs.promises.writeFile(path.join(externalDir, 'protected.txt'), 'protected');
    await fs.promises.symlink(externalDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await identity.removeRejectedIdentityFile(path.join(linked, 'protected.txt'), uploadsRoot);
    assert.equal(await fs.promises.readFile(path.join(externalDir, 'protected.txt'), 'utf8'), 'protected');
    let calls = 0;
    const ctrl = load('controllers/document.controller.js', { '../config/database': { query: async () => { calls++; throw Error('No query allowed'); } }, '../utils/ocr': { extractDocumentInsights: async () => { throw Error('No OCR allowed'); } }, '../middleware/uploads': { uploadsRoot }, '../utils/identityDocumentTypes': identity });
    const output = response(); let failure;
    await ctrl.uploadMine({ body: { documentType: 'Government ID' }, file: { path: outside }, user: { id: userId } }, output.res, (error) => { failure=error; });
    assert.equal(failure, undefined); assert.equal(output.status, 400); assert.equal(calls, 0); assert.equal(fs.existsSync(outside), true);
  } finally { await cleanupFixture(root); }
});

test('chunk session creation and every legacy identity session entry point reject before disk assembly, OCR or record mutation', async () => {
  const writes = [], queries = []; let ocrCalls = 0;
  const session = { id: sessionId, owner_user_id: userId, target_type: 'patient_document', original_name: 'synthetic-id.pdf', mime_type: 'application/pdf', metadata: { documentType: 'Government ID' }, status: 'pending', received_chunks: [0], total_chunks: 1, chunk_size: 1024, total_size: 32, temp_dir: 'C:/synthetic/not-a-real-directory' };
  const fakeFs = { promises: Object.fromEntries(['mkdir','writeFile','readFile','appendFile','rm'].map((action) => [action, async (...args) => { writes.push({ action, args }); return action === 'readFile' ? Buffer.from('synthetic') : undefined; }])) };
  const ctrl = load('controllers/upload.controller.js', {
    fs: fakeFs, path, crypto: require('node:crypto'), '../middleware/uploads': { uploadsRoot: 'C:/synthetic/not-a-real-root' }, '../utils/identityDocumentTypes': identity,
    '../utils/ocr': { extractDocumentInsights: async () => { ocrCalls++; throw Error('No identity OCR allowed'); } },
    '../config/database': { query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT * FROM upload_sessions')) return { rows: [{ ...session }] };
      if (sql.includes('INSERT INTO upload_sessions')) return { rows: [{ ...session, target_type: params[2], metadata: JSON.parse(params[8]), status: 'pending' }] };
      throw Error('No legacy identity mutation allowed');
    } },
  });
  const base = { user: { id: userId, role: 'patient' }, params: { id: sessionId, chunkIndex: '0' }, protocol: 'https', get: () => 'example.invalid' };
  const draft = { targetType: 'patient_document', documentType: 'PhilHealth ID', fileName: 'synthetic-id.pdf', mimeType: 'application/pdf', totalSize: 32, totalChunks: 1, chunkSize: 1024 };
  let out=response(), failure;
  await ctrl.createSession({ ...base, body: draft }, out.res, (error) => { failure=error; });
  assert.equal(failure, undefined); assert.equal(out.status, 400); assert.equal(out.body.code, identity.PRIVATE_CREDENTIAL_UPLOAD_CODE);
  assert.equal(writes.length, 0); assert.equal(queries.length, 0);
  for (const action of ['getSession','uploadChunk','completeSession']) {
    for (const status of ['pending','completed']) {
      session.status=status; session.finalized_asset_path='/uploads/documents/old-sensitive-identity.pdf';
      out=response(); failure=undefined;
      const before=queries.length;
      await ctrl[action]({ ...base, body: action==='uploadChunk' ? Buffer.from('synthetic-chunk') : {} }, out.res, (error) => { failure=error; });
      assert.equal(failure, undefined); assert.equal(out.status, 400); assert.equal(out.body.code, identity.PRIVATE_CREDENTIAL_UPLOAD_CODE);
      assert.equal(queries.length, before+1, 'Only the owned session lookup runs');
      assert.equal(JSON.stringify(out.body).includes('old-sensitive-identity'), false, 'Completed legacy sessions cannot return their public asset path');
    }
  }
  assert.equal(writes.length, 0); assert.equal(ocrCalls, 0);
  assert.equal(queries.some((entry) => /UPDATE|INSERT/.test(entry.sql)), false);
  out=response(); failure=undefined;
  await ctrl.createSession({ ...base, body: { ...draft, documentType: 'Laboratory Result' } }, out.res, (error) => { failure=error; });
  assert.equal(failure, undefined); assert.equal(out.status, 201);
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO upload_sessions')).length, 1);
  assert.equal(writes.length, 1); assert.equal(writes[0].action, 'mkdir');
});
