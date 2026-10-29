const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { extractCredentialText, credentialOcrAssetPaths, OCR_LIMITS } = require('../src/utils/credentialOcr');

const imageFixture = async (format = 'png') => {
  const sharp = require('sharp');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="64" fill="black"><text x="70" y="130">SYNTHETIC TEST DOCUMENT</text><text x="70" y="270">NATIONAL IDENTIFICATION CARD</text><text x="70" y="410">NAME: MARIA SAMPLE</text><text x="70" y="550">DATE OF BIRTH: 01 JAN 1990</text><text x="70" y="690">NOT A REAL GOVERNMENT ID</text></g></svg>');
  return sharp(svg)[format]().toBuffer();
};

function pdfFixture({ image, text = 'SYNTHETIC TEST DOCUMENT - NAME MARIA SAMPLE', pages = 1 } = {}) {
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`,
  ];
  const resourceId = 3 + pages * 2;
  for (let page = 0; page < pages; page++) {
    const contentId = 4 + page * 2;
    const resources = image ? `/XObject << /Im1 ${resourceId} 0 R >>` : `/Font << /F1 ${resourceId} 0 R >>`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1500 900] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`);
    const content = image ? 'q 1500 0 0 900 0 0 cm /Im1 Do Q' : `BT /F1 48 Tf 50 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push(image ? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1500 /Height 900 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]) : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let index = 0; index < objects.length; index++) {
    offsets.push(chunks.reduce((total, chunk) => total + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(objects[index]) ? objects[index] : Buffer.from(objects[index]), Buffer.from('\nendobj\n'));
  }
  const xrefOffset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return Buffer.concat(chunks);
}

test('runtime refuses unsupported, mismatched and oversized files without opening OCR jobs', async () => {
  assert.equal((await extractCredentialText(Buffer.from('text'), 'text/plain')).reason, 'UNSUPPORTED_TYPE');
  assert.equal((await extractCredentialText(Buffer.from('html'), 'image/png')).reason, 'INVALID_DOCUMENT');
  assert.equal((await extractCredentialText(Buffer.alloc(OCR_LIMITS.maxBytes + 1), 'image/jpeg')).reason, 'INVALID_DOCUMENT');
  assert.equal((await extractCredentialText('not-a-buffer', 'application/pdf')).reason, 'INVALID_DOCUMENT');
});

test('all OCR language, worker and PDF assets resolve to local installed files', () => {
  const assets = credentialOcrAssetPaths();
  for (const [name, value] of Object.entries(assets)) {
    assert.equal(/^https?:/i.test(value), false, name);
    assert.equal(fs.existsSync(value), true, name);
  }
  assert.equal(fs.existsSync(require('node:path').join(assets.langPath, 'eng.traineddata.gz')), true);
});

test('actual offline image OCR reads a synthetic PNG and JPEG without inventing authenticity', async () => {
  for (const [format, mimeType] of [['png', 'image/png'], ['jpeg', 'image/jpeg']]) {
    const scan = await extractCredentialText(await imageFixture(format), mimeType);
    assert.equal(scan.status, 'processed');
    assert.match(scan.text, /MARIA\s+SAMPLE/i);
    assert.match(scan.text, /SYNTHETIC\s+TEST/i);
    assert.ok(scan.confidence >= 50 && scan.confidence <= 100);
    assert.equal(scan.pagesScanned, 1);
    assert.equal(Object.hasOwn(scan, 'authentic'), false);
    assert.equal(Object.hasOwn(scan, 'verified'), false);
  }
});

test('PDF extraction reads local text and raster-only pages with a two-page limit', async () => {
  const textScan = await extractCredentialText(pdfFixture({ pages: 3 }), 'application/pdf');
  assert.equal(textScan.status, 'processed'); assert.match(textScan.text, /MARIA SAMPLE/);
  assert.equal(textScan.pagesScanned, 2); assert.equal(textScan.reason, 'PAGE_LIMIT_REACHED');
  const imageScan = await extractCredentialText(pdfFixture({ image: await imageFixture('jpeg') }), 'application/pdf');
  assert.equal(imageScan.status, 'processed'); assert.match(imageScan.text, /MARIA\s+SAMPLE/i);
  assert.equal(imageScan.reason, 'PDF_RASTER_OCR'); assert.equal(imageScan.pagesScanned, 1);
});

test('blank, broken and excessive-dimension documents return safe fixed failure reasons', async () => {
  const sharp = require('sharp');
  const blank = await sharp({ create: { width: 700, height: 500, channels: 3, background: 'white' } }).png().toBuffer();
  assert.equal((await extractCredentialText(blank, 'image/png')).reason, 'NO_READABLE_TEXT');
  assert.equal((await extractCredentialText(Buffer.from('%PDF-1.4\nnot a valid pdf'), 'application/pdf')).reason, 'INVALID_PDF');
  const large = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: 'white' } }).png().toBuffer();
  const rejected = await extractCredentialText(large, 'image/png');
  assert.equal(rejected.status, 'unreadable'); assert.equal(rejected.text, '');
  assert.ok(['INVALID_IMAGE', 'PIXEL_LIMIT'].includes(rejected.reason));
});

test('timeout terminates scan work and busy scans cannot start a second memory-heavy job', async () => {
  const image = await imageFixture();
  const pending = extractCredentialText(image, 'image/png', { timeoutMs: 500 });
  assert.equal((await extractCredentialText(image, 'image/png')).reason, 'BUSY');
  const timedOut = await pending;
  assert.equal(timedOut.status, 'unavailable'); assert.equal(timedOut.reason, 'TIMEOUT');
  const next = await extractCredentialText(pdfFixture(), 'application/pdf');
  assert.equal(next.status, 'processed');
});
