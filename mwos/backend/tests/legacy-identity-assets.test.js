const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { documentAssetPath, createLegacyIdentityAssetGuard } = require('../src/middleware/legacyIdentityAssets');

test('legacy document path decoding rejects traversal and normalizes static filesystem aliases', () => {
  for (const raw of ['/documents/../id.pdf', '/documents/%2e%2e/id.pdf', '/documents%5cid.pdf', '/documents/%00id.pdf', '/documents/%2569d.pdf', '/documents//id.pdf', '/documents/%ZZ', '/documents./id.pdf', '/documents%20/id.pdf', '/documents/id.pdf.', '/documents/id.pdf%20', '/documents/id.pdf:$DATA', '/documents/ID~1.PDF']) {
    assert.equal(documentAssetPath(raw).invalid, true, raw);
  }
  for (const raw of ['/documents/id.pdf', '/DOCUMENTS/ID.PDF', '/%64ocuments/%69d.pdf']) assert.equal(documentAssetPath(raw).documentPath, '/uploads/documents/id.pdf');
  assert.equal(documentAssetPath('/medicine-images/photo.jpg').documentPath, null);
});

test('anonymous static downloads never serve legacy identity files while medical files remain available', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mwos-identity-assets-'));
  const documentDir = path.join(temporary, 'documents');
  fs.mkdirSync(documentDir);
  fs.writeFileSync(path.join(documentDir, 'id.pdf'), 'SYNTHETIC-ID-EVIDENCE');
  fs.writeFileSync(path.join(documentDir, 'lab.pdf'), 'SYNTHETIC-LAB-REPORT');
  let failQuery = false;
  const requests = [];
  const guard = createLegacyIdentityAssetGuard(async (sql, params) => {
    requests.push({ sql, params });
    if (failQuery) throw Error('Synthetic database failure');
    return { rows: [{ document_type: params[0].endsWith('/id.pdf') ? 'National ID' : 'Lab Result' }] };
  });
  const app = express();
  app.use('/uploads', guard, express.static(temporary));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (requestPath) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: requestPath }, (response) => {
      let body = ''; response.on('data', (part) => { body += part; });
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
    }).on('error', reject);
  });
  try {
    for (const alias of ['/uploads/documents/id.pdf', '/uploads/DOCUMENTS/ID.PDF', '/uploads/%64ocuments/%69d.pdf']) {
      const result = await get(alias); assert.equal(result.status, 404); assert.equal(result.body.includes('SYNTHETIC-ID'), false); assert.equal(result.headers['cache-control'], 'no-store');
    }
    const medical = await get('/uploads/documents/lab.pdf');
    assert.equal(medical.status, 200); assert.equal(medical.body, 'SYNTHETIC-LAB-REPORT');
    assert.ok(requests.every((request) => request.params.length === 1 && request.sql.includes('UNION ALL')));
    failQuery = true;
    const unavailable = await get('/uploads/documents/lab.pdf');
    assert.equal(unavailable.status, 503); assert.equal(unavailable.body.includes('SYNTHETIC-LAB'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.unlinkSync(path.join(documentDir, 'id.pdf')); fs.unlinkSync(path.join(documentDir, 'lab.pdf'));
    fs.rmdirSync(documentDir); fs.rmdirSync(temporary);
  }
});
