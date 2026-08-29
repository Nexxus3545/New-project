const fs = require('fs');

let pdfParse = null;
let Tesseract = null;

const loadPdfParser = () => {
  if (pdfParse) return pdfParse;
  try {
    // Optional dependency: keep uploads working even when OCR packages are not installed yet.
    pdfParse = require('pdf-parse');
    return pdfParse;
  } catch {
    return null;
  }
};

const loadTesseract = () => {
  if (Tesseract) return Tesseract;
  try {
    // Optional dependency: image OCR is enabled automatically when the package exists.
    Tesseract = require('tesseract.js');
    return Tesseract;
  } catch {
    return null;
  }
};

const compact = (value) => value?.replace(/\s+/g, ' ').trim() || '';

const extractByRegex = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return compact(match[1]);
    if (match?.[0]) return compact(match[0]);
  }
  return null;
};

const parseExtractedData = (text, documentType) => {
  const normalized = compact(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => compact(line))
    .filter(Boolean);

  return {
    documentType,
    philhealthId: extractByRegex(normalized, [
      /\b(\d{2}-\d{9}-\d)\b/,
      /\b(\d{12})\b/,
      /philhealth(?:\s*id|\s*no\.?|\s*number)?[:\s#-]*([A-Z0-9-]{8,})/i,
    ]),
    birthingId: extractByRegex(normalized, [
      /birthing(?:\s*id|\s*no\.?|\s*number)?[:\s#-]*([A-Z0-9-]{6,})/i,
      /\b(TMC-BIR-[A-Z0-9-]+)\b/i,
    ]),
    governmentIdNumber: extractByRegex(normalized, [
      /(?:id|identification)(?:\s*no\.?|\s*number)?[:\s#-]*([A-Z0-9-]{6,})/i,
      /\b([A-Z]\d{2}-\d{2}-\d{6,})\b/,
    ]),
    probableName: extractByRegex(normalized, [
      /name[:\s]+([A-Z][A-Z\s,'.-]{5,})/i,
    ]) || lines.find((line) => /^[A-Z][A-Z\s,'.-]{5,}$/.test(line)) || null,
    topLines: lines.slice(0, 6),
  };
};

const extractDocumentInsights = async (filePath, mimeType, documentType) => {
  try {
    let text = '';

    if (mimeType === 'application/pdf') {
      const parser = loadPdfParser();
      if (!parser) {
        return {
          status: 'skipped',
          text: '',
          extractedData: { documentType, warning: 'pdf-parse is not installed yet' },
        };
      }
      const fileBuffer = fs.readFileSync(filePath);
      const parsed = await parser(fileBuffer);
      text = parsed.text || '';
    } else if (mimeType?.startsWith('image/')) {
      const recognizer = loadTesseract();
      if (!recognizer) {
        return {
          status: 'skipped',
          text: '',
          extractedData: { documentType, warning: 'tesseract.js is not installed yet' },
        };
      }
      const result = await recognizer.recognize(filePath, 'eng');
      text = result?.data?.text || '';
    } else {
      return {
        status: 'failed',
        text: '',
        extractedData: { documentType, error: 'Unsupported file type for OCR' },
      };
    }

    const compacted = compact(text);
    return {
      status: compacted ? 'processed' : 'failed',
      text: compacted,
      extractedData: parseExtractedData(text, documentType),
    };
  } catch (error) {
    return {
      status: 'failed',
      text: '',
      extractedData: {
        documentType,
        error: error.message,
      },
    };
  }
};

module.exports = {
  extractDocumentInsights,
};
