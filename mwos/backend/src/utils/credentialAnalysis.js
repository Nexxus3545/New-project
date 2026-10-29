const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'midwife']);
const MIN_CONFIDENCE = 60;
const MAX_TEXT_LENGTH = 24000;
const TYPE_MARKERS = {
  philhealth_id: /\bPHIL\s*HEALTH\b|\bPHILIPPINE HEALTH INSURANCE\b/,
  national_id: /\bPHILIPPINE IDENTIFICATION\b|\bPHILIPPINE ID SYSTEM\b|\bPHILSYS\b|\bPAMBANSANG PAGKAKAKILANLAN\b/,
  passport: /\bPASSPORT\b|\bPASAPORTE\b/,
  drivers_license: /\bDRIVER(?: S)? LICEN[CS]E\b|\bDRIVERS LICEN[CS]E\b|\bLAND TRANSPORTATION OFFICE\b|\bLTO\b/,
  umid: /\bUMID\b|\bUNIFIED MULTI PURPOSE\b|\bUNIFIED MULTIPURPOSE\b/,
  sss_id: /\bSSS\b|\bSOCIAL SECURITY SYSTEM\b/,
  gsis_id: /\bGSIS\b|\bGOVERNMENT SERVICE INSURANCE SYSTEM\b/,
  postal_id: /\bPOSTAL (?:ID|IDENTIFICATION|IDENTITY)\b|\bPHLPOST\b|\bPHILPOST\b|\bPHILIPPINE POSTAL\b/,
  voters_id: /\bVOTER(?: S)? (?:ID|IDENTIFICATION)\b|\bVOTERS (?:ID|IDENTIFICATION)\b|\bCOMELEC\b|\bCOMMISSION ON ELECTIONS\b/,
  professional_license: /\bPRC\b|\bPROFESSIONAL REGULATION COMMISSION\b|\bPROFESSIONAL IDENTIFICATION\b|\bCERTIFICATE OF REGISTRATION\b/,
};
const PROFESSION_MARKERS = {
  doctor: /\bPHYSICIAN\b|\bMEDICAL DOCTOR\b|\bDOCTOR OF MEDICINE\b/,
  nurse: /\bNURSE\b|\bNURSING\b/,
  midwife: /\bMIDWIFE\b|\bMIDWIFERY\b/,
};
const OTHER_PROFESSIONS = /\bDENTIST\b|\bDENTISTRY\b|\bTEACHER\b|\bENGINEER\b|\bPHARMACIST\b|\bPHARMACY\b|\bARCHITECT\b|\bACCOUNTANT\b|\bCRIMINOLOGIST\b|\bMEDICAL TECHNOLOGIST\b|\bPHYSICAL THERAPIST\b|\bOCCUPATIONAL THERAPIST\b|\bRADIOLOGIC TECHNOLOGIST\b/;
const MONTHS = { JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12 };

const plain = (value) => typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase() : '';
const normalized = (value) => plain(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const numberKey = (value) => plain(value).replace(/[^A-Z0-9]/g, '');

function calendarDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function storedDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return calendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? calendarDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

function manilaToday(value) {
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Only ISO, month-name, or mathematically unambiguous numeric dates are used.
// A label such as "expiry" alone does not resolve an ambiguous 03/04/2030.
function printedDate(value) {
  const text = plain(value).replace(/,/g, ' ');
  let match = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(text);
  if (match) return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^\s*(\d{1,2})[\s./-]*([A-Z]{3,9})[\s./-]*(\d{4})(?!\d)/.exec(text);
  if (match && MONTHS[match[2]]) return calendarDate(Number(match[3]), MONTHS[match[2]], Number(match[1]));
  match = /^\s*([A-Z]{3,9})[\s./-]*(\d{1,2})[\s./-]*(\d{4})(?!\d)/.exec(text);
  if (match && MONTHS[match[1]]) return calendarDate(Number(match[3]), MONTHS[match[1]], Number(match[2]));
  match = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/.exec(text);
  if (!match) return null;
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
  if (first === second) return calendarDate(year, first, second);
  if (first > 12 && second <= 12) return calendarDate(year, second, first);
  if (second > 12 && first <= 12) return calendarDate(year, first, second);
  return null;
}

function labelledDate(text, label) {
  const expression = new RegExp(`\\b(?:${label})\\b\\s*[:#.-]?\\s*`, 'g');
  const values = new Set();
  let match, found = false, ambiguous = false;
  while ((match = expression.exec(text))) {
    found = true;
    const value = printedDate(text.slice(expression.lastIndex, expression.lastIndex + 64).split(/[\r\n]/)[0]);
    if (value) values.add(value); else ambiguous = true;
  }
  return { found, date: !ambiguous && values.size === 1 ? [...values][0] : null };
}

function accountNameCheck(text, account) {
  const first = normalized(account.first_name), last = normalized(account.last_name);
  if (!first || !last || !/[\p{L}]{2}/u.test(first) || !/[\p{L}]{2}/u.test(last)) return 'unknown';
  const words = new Set(text.split(' '));
  return [...first.split(' '), ...last.split(' ')].every((word) => words.has(word)) ? 'pass' : 'flag';
}

function licenseNumberCheck(text, value) {
  const expected = numberKey(value);
  if (expected.length < 3 || expected.length > 120) return 'unknown';
  const pattern = expected.split('').join('[\\s.-]*');
  return new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(text) ? 'pass' : 'flag';
}

function analyzeCredential({ credential = {}, account = {}, ocr = {}, duplicateDetected, now = new Date() } = {}) {
  credential = credential && typeof credential === 'object' && !Array.isArray(credential) ? credential : {};
  account = account && typeof account === 'object' && !Array.isArray(account) ? account : {};
  ocr = ocr && typeof ocr === 'object' && !Array.isArray(ocr) ? ocr : {};
  const checks = [];
  const add = (code, result, label) => { checks.push({ code, result, label }); return result; };
  const confidence = typeof ocr.confidence === 'number' && Number.isFinite(ocr.confidence) && ocr.confidence >= 0 && ocr.confidence <= 100 ? ocr.confidence : null;
  const pagesScanned = Number.isInteger(ocr.pagesScanned) && ocr.pagesScanned >= 0 ? Math.min(ocr.pagesScanned, 10) : 0;
  const text = plain(typeof ocr.text === 'string' ? ocr.text.slice(0, MAX_TEXT_LENGTH) : '');
  const readable = ocr.status === 'processed' && text.trim().length >= 12 && confidence !== null && confidence >= MIN_CONFIDENCE;
  let requiresManual = !readable;
  const professional = credential.kind === 'professional_license';
  const today = manilaToday(now);
  add('ocr_readability', readable ? 'pass' : 'unknown', readable ? 'Readable text detected for automated comparison.' : 'Text could not be read with enough confidence for comparison.');
  if ((professional && !CLINICAL_ROLES.has(account.role)) || (!professional && (credential.kind !== 'patient_id' || account.role !== 'patient'))) {
    add('account_role', 'flag', 'The document requirement does not match this account role.');
  }

  const typedExpiry = storedDate(credential.expires_at);
  if (typedExpiry) add('submitted_expiry', typedExpiry < today ? 'flag' : 'pass', typedExpiry < today ? 'The submitted credential expiry has passed.' : 'The submitted expiry has not passed in Manila time.');
  else if (professional || credential.expires_at) { add('submitted_expiry', 'unknown', 'A valid submitted expiry date is needed for review.'); requiresManual = true; }

  if (readable) {
    const normalizedText = normalized(text);
    const type = professional ? 'professional_license' : credential.document_type;
    if (!TYPE_MARKERS[type]) {
      add('document_type', 'unknown', 'This government ID type requires manual identification.'); requiresManual = true;
    } else add('document_type', TYPE_MARKERS[type].test(normalizedText) ? 'pass' : 'flag', TYPE_MARKERS[type].test(normalizedText) ? 'Text associated with the selected document type was detected.' : 'Text associated with the selected document type was not detected.');
    const nameResult = accountNameCheck(normalizedText, account);
    add('account_name', nameResult, nameResult === 'pass' ? 'The account name was found in the readable document text.' : nameResult === 'flag' ? 'The account name was not fully found in the readable document text.' : 'The account name needs manual comparison.');
    if (nameResult === 'unknown') requiresManual = true;

    const expiry = labelledDate(text, 'VALID\\s+(?:UNTIL|THRU|THROUGH)|DATE\\s+OF\\s+EXPIRY|EXPIRY(?:\\s+DATE)?|EXPIRATION(?:\\s+DATE)?|EXPIRES|EXP(?:\\s+DATE)?');
    if (expiry.date) {
      const result = expiry.date < today || (typedExpiry && expiry.date !== typedExpiry) ? 'flag' : 'pass';
      add('printed_expiry', result, expiry.date < today ? 'A clearly labelled printed expiry has passed.' : typedExpiry && expiry.date !== typedExpiry ? 'The printed expiry does not match the submitted expiry.' : typedExpiry ? 'The clearly labelled printed expiry matches the submitted expiry.' : 'The clearly labelled printed expiry has not passed.');
    } else {
      add('printed_expiry', 'unknown', expiry.found ? 'The labelled expiry is unclear or ambiguous and needs manual review.' : 'No unambiguous labelled expiry was read.');
      if (professional || typedExpiry) requiresManual = true;
    }

    const birthDate = storedDate(account.date_of_birth);
    if (birthDate) {
      const printedBirth = labelledDate(text, 'DATE\\s+OF\\s+BIRTH|BIRTH\\s*DATE|DOB|PETSA\\s+NG\\s+KAPANGANAKAN');
      add('date_of_birth', printedBirth.date ? printedBirth.date === birthDate ? 'pass' : 'flag' : 'unknown', printedBirth.date ? printedBirth.date === birthDate ? 'The labelled birth date matches the account birth date.' : 'The labelled birth date does not match the account birth date.' : 'No unambiguous labelled birth date was read.');
    }
    if (professional) {
      const numberResult = licenseNumberCheck(text, credential.license_number);
      add('license_number', numberResult, numberResult === 'pass' ? 'The submitted professional license number was found in the text.' : numberResult === 'flag' ? 'The submitted professional license number was not found in the text.' : 'The professional license number needs manual comparison.');
      if (numberResult === 'unknown') requiresManual = true;
      const detected = Object.entries(PROFESSION_MARKERS).filter(([, pattern]) => pattern.test(normalizedText)).map(([role]) => role);
      const otherProfession = OTHER_PROFESSIONS.test(normalizedText);
      const roleResult = detected.includes(account.role) && detected.length === 1 && !otherProfession ? 'pass' : (detected.length || otherProfession) && !detected.includes(account.role) ? 'flag' : 'unknown';
      add('professional_role', roleResult, roleResult === 'pass' ? 'The account profession was found in the readable document text.' : roleResult === 'flag' ? 'The readable profession does not match the account role.' : 'The professional role needs manual comparison.');
      if (roleResult === 'unknown') requiresManual = true;
    }
  } else {
    add('document_type', 'unknown', 'The document type needs manual identification.');
    add('account_name', 'unknown', 'The account name needs manual comparison.');
    if (professional) {
      add('license_number', 'unknown', 'The professional license number needs manual comparison.');
      add('professional_role', 'unknown', 'The professional role needs manual comparison.');
      add('printed_expiry', 'unknown', 'The printed expiry needs manual comparison.');
    }
  }
  add('duplicate_document', duplicateDetected === true ? 'flag' : duplicateDetected === false ? 'pass' : 'unknown', duplicateDetected === true ? 'An identical file match needs additional review.' : duplicateDetected === false ? 'The exact-file comparison returned no duplicate match.' : 'The exact-file comparison was not available.');
  add('issuer_authentication', 'unknown', 'The document has not been authenticated by its issuing authority.');
  const outcome = checks.some((check) => check.result === 'flag') ? 'needs_attention' : requiresManual ? 'manual_review' : 'ready_for_review';
  const summary = outcome === 'ready_for_review' ? 'Automated text checks completed. Clinic and issuing-authority review are still required.'
    : outcome === 'needs_attention' ? 'Some checks need attention. Review the original document and confirm it with the issuing authority.'
      : 'Automated checks did not establish enough readable information. Manual review is required.';
  return { version: 1, outcome, authenticity: 'not_verified', source: 'local_ocr', confidence, pagesScanned, checks, summary };
}

module.exports = { analyzeCredential };
