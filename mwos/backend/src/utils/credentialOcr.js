const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const OCR_LIMITS = Object.freeze({ maxBytes: 2 * 1024 * 1024, maxPixels: 16_000_000, maxOutputSide: 2600, maxPages: 2, maxText: 16_000, defaultTimeoutMs: 25_000, maxTimeoutMs: 30_000 });
const result = (status, reason, extra = {}) => ({ status, text: '', confidence: null, pagesScanned: 0, ...(reason ? { reason } : {}), ...extra });
const cleanText = (value) => String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').trim();
const inputMimeMatches = (bytes, mimeType) => mimeType === 'image/jpeg'
  ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  : mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === 'application/pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-';

// These explicit local dependency paths are also useful for deployment tracing.
// No image, PDF, extracted text or model request is sent to a remote service.
function credentialOcrAssetPaths() {
  const languageRoot = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
  const langPath = ['4.0.0_fast', '4.0.0', '4.0.0_best_int'].map((folder) => path.join(languageRoot, folder))
    .find((folder) => fs.existsSync(path.join(folder, 'eng.traineddata.gz')));
  if (!langPath) throw new Error('Bundled OCR language unavailable');
  const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return {
    workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
    corePath: path.dirname(require.resolve('tesseract.js-core/package.json')),
    langPath,
    pdfModulePath: require.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
    pdfWorkerPath: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').split(path.sep).join('/') + '/',
    cMapUrl: path.join(pdfRoot, 'cmaps').split(path.sep).join('/') + '/',
    wasmUrl: path.join(pdfRoot, 'wasm').split(path.sep).join('/') + '/',
  };
}

async function runOcrJob(bytes, mimeType, maxPages) {
  let recognizer, loadingTask, document;
  try {
    const sharp = require('sharp');
    const { createWorker } = require('tesseract.js');
    const assets = credentialOcrAssetPaths();
    const recognize = async (image) => {
      if (!recognizer) {
        recognizer = await createWorker('eng', 1, {
          workerPath: assets.workerPath, corePath: assets.corePath, langPath: assets.langPath,
          cacheMethod: 'none', gzip: true, logger: () => {}, errorHandler: () => {},
        });
        await recognizer.setParameters({ user_defined_dpi: '180', preserve_interword_spaces: '1' });
      }
      const { data } = await recognizer.recognize(image);
      return { text: cleanText(data?.text), confidence: Number.isFinite(data?.confidence) ? Math.max(0, Math.min(100, data.confidence)) : null };
    };
    if (mimeType !== 'application/pdf') {
      let normalized;
      try {
        const image = sharp(bytes, { failOn: 'warning', limitInputPixels: OCR_LIMITS.maxPixels, limitInputChannels: 4, sequentialRead: true });
        const metadata = await image.metadata();
        if (!['jpeg', 'png'].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) return result('unreadable', 'INVALID_IMAGE');
        if (metadata.width * metadata.height > OCR_LIMITS.maxPixels || metadata.width > 10_000 || metadata.height > 10_000) return result('unreadable', 'PIXEL_LIMIT');
        if (metadata.width < 160 || metadata.height < 100) return result('unreadable', 'IMAGE_TOO_SMALL');
        normalized = await image.rotate().resize({ width: OCR_LIMITS.maxOutputSide, height: OCR_LIMITS.maxOutputSide, fit: 'inside' }).flatten({ background: '#ffffff' }).greyscale().normalize().png().toBuffer();
      } catch { return result('unreadable', 'INVALID_IMAGE'); }
      const recognized = await recognize(normalized);
      if (recognized.text.replace(/\s/g, '').length < 8) return result('unreadable', 'NO_READABLE_TEXT', { pagesScanned: 1 });
      return result('processed', recognized.text.length > OCR_LIMITS.maxText ? 'TEXT_LIMIT_REACHED' : undefined,
        { text: recognized.text.slice(0, OCR_LIMITS.maxText), confidence: recognized.confidence, pagesScanned: 1 });
    }

    let pdfjs;
    try { pdfjs = await import(pathToFileURL(assets.pdfModulePath).href); }
    catch { return result('unavailable', 'ENGINE_UNAVAILABLE'); }
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(assets.pdfWorkerPath).href;
    try {
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false,
        useSystemFonts: false, disableFontFace: true, maxImageSize: OCR_LIMITS.maxPixels,
        cMapUrl: assets.cMapUrl, cMapPacked: true, standardFontDataUrl: assets.standardFontDataUrl,
        wasmUrl: assets.wasmUrl, useWasm: false, isImageDecoderSupported: false,
      });
      document = await loadingTask.promise;
    } catch (error) { return result('unreadable', error?.name === 'PasswordException' ? 'ENCRYPTED_PDF' : 'INVALID_PDF'); }
    const pages = Math.min(maxPages, document.numPages);
    const texts = [], confidences = [];
    let usedRaster = false;
    for (let index = 1; index <= pages; index++) {
      const page = await document.getPage(index);
      try {
        const content = await page.getTextContent();
        const embedded = cleanText(content.items.map((item) => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
        if (embedded.replace(/\s/g, '').length >= 8) { texts.push(embedded); continue; }
        const natural = page.getViewport({ scale: 1 });
        if (![natural.width, natural.height].every((value) => Number.isFinite(value) && value > 0 && value <= 14_400)) return result('unreadable', 'PDF_PAGE_LIMIT', { pagesScanned: index - 1 });
        const scale = Math.min(2, OCR_LIMITS.maxOutputSide / Math.max(natural.width, natural.height));
        const viewport = page.getViewport({ scale });
        if (viewport.width * viewport.height > OCR_LIMITS.maxPixels) return result('unreadable', 'PIXEL_LIMIT', { pagesScanned: index - 1 });
        const surface = document.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await page.render({ canvasContext: surface.context, viewport, background: '#ffffff' }).promise;
          const recognized = await recognize(surface.canvas.toBuffer('image/png'));
          texts.push(recognized.text); if (recognized.confidence !== null) confidences.push(recognized.confidence);
          usedRaster = true;
        } finally { document.canvasFactory.destroy(surface); }
      } finally { page.cleanup(); }
    }
    const text = texts.join('\n\n').trim();
    if (text.replace(/\s/g, '').length < 8) return result('unreadable', 'NO_READABLE_TEXT', { pagesScanned: pages });
    return result('processed', document.numPages > pages ? 'PAGE_LIMIT_REACHED' : text.length > OCR_LIMITS.maxText ? 'TEXT_LIMIT_REACHED' : usedRaster ? 'PDF_RASTER_OCR' : 'PDF_TEXT_LAYER', {
      text: text.slice(0, OCR_LIMITS.maxText), confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null, pagesScanned: pages,
    });
  } catch { return result('unavailable', 'ENGINE_UNAVAILABLE'); }
  finally {
    try { await recognizer?.terminate(); } catch { /* Worker cleanup stays private. */ }
    try { if (document) await document.destroy(); else await loadingTask?.destroy(); } catch { /* PDF cleanup can be synchronous or asynchronous. */ }
  }
}

let activeJobs = 0;
async function extractCredentialText(buffer, mimeType, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mimeType)) return result('unsupported', 'UNSUPPORTED_TYPE');
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > OCR_LIMITS.maxBytes || !inputMimeMatches(buffer, mimeType)) return result('unreadable', 'INVALID_DOCUMENT');
  if (activeJobs >= 1) return result('unavailable', 'BUSY');
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.min(OCR_LIMITS.maxTimeoutMs, Math.max(50, options.timeoutMs)) : OCR_LIMITS.defaultTimeoutMs;
  const maxPages = Number.isInteger(options.maxPages) ? Math.min(OCR_LIMITS.maxPages, Math.max(1, options.maxPages)) : OCR_LIMITS.maxPages;
  activeJobs++;
  let worker, timer;
  try {
    worker = new Worker(__filename, { workerData: { mwosCredentialOcr: true, bytes: buffer, mimeType, maxPages }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    return await new Promise((resolve) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      timer = setTimeout(() => settle(result('unavailable', 'TIMEOUT')), timeoutMs);
      worker.once('message', (value) => settle(value));
      worker.once('error', () => settle(result('unavailable', 'ENGINE_UNAVAILABLE')));
      worker.once('exit', () => settle(result('unavailable', 'ENGINE_UNAVAILABLE')));
    });
  } catch { return result('unavailable', 'ENGINE_UNAVAILABLE'); }
  finally { clearTimeout(timer); await worker?.terminate().catch(() => {}); activeJobs--; }
}

if (!isMainThread && workerData?.mwosCredentialOcr === true) {
  // Keep the scan worker offline even if a dependency attempts a remote asset
  // fallback. Local language files and PDF assets are required for this path.
  const denyNetwork = () => { throw new Error('Offline OCR only'); };
  globalThis.fetch = async () => denyNetwork();
  for (const protocol of ['node:http', 'node:https']) {
    const transport = require(protocol);
    transport.request = denyNetwork; transport.get = denyNetwork;
  }
  runOcrJob(Buffer.from(workerData.bytes), workerData.mimeType, workerData.maxPages)
    .then((value) => parentPort.postMessage(value)).catch(() => parentPort.postMessage(result('unavailable', 'ENGINE_UNAVAILABLE')));
}

module.exports = { extractCredentialText, credentialOcrAssetPaths, OCR_LIMITS };
