const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'midwife']);
const PATIENT_DOCUMENTS = Object.freeze({
  philhealth_id: 'PhilHealth ID', national_id: 'National ID', passport: 'Passport',
  drivers_license: "Driver's license", umid: 'UMID', sss_id: 'SSS ID', gsis_id: 'GSIS ID',
  postal_id: 'Postal ID', voters_id: "Voter's ID", other_government_id: 'Other government-issued ID',
});
const invalid = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
const requirementForRole = (role) => role === 'patient' ? 'patient_id' : CLINICAL_ROLES.has(role) ? 'professional_license' : 'none';

function dateOnly(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return value ? String(value).slice(0, 10) : null;
}
function manilaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function futureExpiry(value, required = false, now = new Date()) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('Enter a valid credential expiry date.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || value <= manilaToday(now)) throw invalid('The credential expiry date must be after today in Manila time.');
  return value;
}
function shortText(value, max, label, required = false) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw invalid(`Enter a valid ${label}.`);
  const text = (value || '').trim();
  if ((required && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw invalid(`Enter a valid ${label}${required ? ` (up to ${max} characters)` : ''}.`);
  return text || null;
}
function decodeDocument(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw invalid('Attach one clear JPEG, PNG, or PDF credential document.');
  const { dataBase64, mimeType } = file;
  const allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };
  if (!Object.hasOwn(allowed, mimeType)) throw invalid('Use a JPEG, PNG, or PDF document.');
  if (typeof dataBase64 !== 'string' || !dataBase64.length || dataBase64.length > 4 * Math.ceil(MAX_DOCUMENT_BYTES / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) throw invalid('The document is invalid or exceeds the 2 MB limit.');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || bytes.toString('base64') !== dataBase64) throw invalid('The document is invalid or exceeds the 2 MB limit.');
  const matches = mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (!matches) throw invalid('The document content does not match its file type.');
  const name = shortText(file.name, 200, 'document filename', true).split(/[\\/]/).at(-1).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100);
  return { bytes, mimeType, fileName: name || `credential${allowed[mimeType]}` };
}
function validateSubmission(role, body, now = new Date()) {
  const kind = requirementForRole(role);
  if (kind === 'none') throw invalid('This account does not require a patient ID or professional license.');
  if (!body || body.consent !== true) throw invalid('Confirm your consent to submit this document for clinic credential review.');
  const document = decodeDocument(body.file);
  if (kind === 'patient_id') {
    if (!Object.hasOwn(PATIENT_DOCUMENTS, body.documentType)) throw invalid('Select a government-issued patient ID.');
    if (body.licenseNumber) throw invalid('Patients submit a government ID, not a professional license.');
    const idLast4 = shortText(body.idLast4, 4, 'last four ID characters');
    if (idLast4 && !/^[a-zA-Z0-9]{4}$/.test(idLast4)) throw invalid('Enter only the last four letters or digits of the ID, or leave this blank.');
    return { ...document, kind, documentType: body.documentType,
      documentLabel: body.documentType === 'other_government_id' ? shortText(body.documentLabel, 100, 'government ID name', true) : PATIENT_DOCUMENTS[body.documentType],
      licenseNumber: null, idLast4, expiresAt: futureExpiry(body.expiresAt, false, now) };
  }
  if (body.documentType !== 'professional_license') throw invalid('Clinical staff must submit their PRC or professional license.');
  const licenseNumber = shortText(body.licenseNumber, 120, 'professional license number', true);
  return { ...document, kind, documentType: 'professional_license', documentLabel: 'PRC / professional license', licenseNumber, idLast4: null, expiresAt: futureExpiry(body.expiresAt, true, now) };
}
function credentialDto(row) {
  if (!row) return null;
  return {
    userId: row.user_id, kind: row.kind, documentType: row.document_type, documentLabel: row.document_label,
    licenseNumber: row.kind === 'professional_license' ? row.license_number : null,
    idLast4: row.kind === 'patient_id' ? row.id_last4 : null, expiresAt: dateOnly(row.expires_at),
    status: row.status, revision: Number(row.revision), submittedAt: row.submitted_at, reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes || null, hasDocument: Boolean(row.has_document), fileName: row.file_name, mimeType: row.mime_type,
  };
}

module.exports = { MAX_DOCUMENT_BYTES, CLINICAL_ROLES, PATIENT_DOCUMENTS, invalid, requirementForRole, dateOnly, manilaToday, futureExpiry, shortText, decodeDocument, validateSubmission, credentialDto };
