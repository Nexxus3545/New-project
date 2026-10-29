const assert = require('node:assert/strict');
const { test } = require('node:test');
const { analyzeCredential } = require('../src/utils/credentialAnalysis');

const now = new Date('2030-01-01T00:00:00Z');
const account = { role: 'nurse', first_name: 'Synthetic', last_name: 'Clinician', date_of_birth: '1990-02-14' };
const credential = { kind: 'professional_license', document_type: 'professional_license', license_number: '7654321', expires_at: '2031-12-31' };
const text = 'PROFESSIONAL REGULATION COMMISSION\nPROFESSIONAL IDENTIFICATION CARD\nSYNTHETIC CLINICIAN\nREGISTERED NURSE\nRegistration No: 765-4321\nValid Until: 31 December 2031\nDate of Birth: 1990-02-14';
const scan = (changes = {}) => analyzeCredential({ credential, account, ocr: { status: 'processed', confidence: 91, pagesScanned: 1, text }, duplicateDetected: false, now, ...changes });
const check = (result, code) => result.checks.find((item) => item.code === code);

test('even fabricated-looking perfect text can only be ready for human review, never authentic or auto-approved', () => {
  const result = scan();
  assert.equal(result.outcome, 'ready_for_review');
  assert.equal(result.authenticity, 'not_verified');
  assert.equal(result.source, 'local_ocr');
  for (const code of ['document_type', 'account_name', 'license_number', 'professional_role', 'submitted_expiry', 'printed_expiry', 'date_of_birth']) assert.equal(check(result, code).result, 'pass', code);
  assert.equal(check(result, 'issuer_authentication').result, 'unknown');
  assert.equal(Object.hasOwn(result, 'approved'), false);
  assert.match(result.summary, /issuing-authority review/);
});

test('result JSON contains only fixed findings and never copies raw names, ID numbers, dates or diagnostics', () => {
  const result = scan({ ocr: { status: 'processed', confidence: 91, pagesScanned: 1, text, reason: 'PRIVATE-DIAGNOSTIC-C:\\identity-file.png', extracted: { id: 'PRIVATE-NUMBER' } } });
  const encoded = JSON.stringify(result);
  for (const privateValue of [text, 'SYNTHETIC CLINICIAN', '7654321', '765-4321', '2031-12-31', '1990-02-14', 'PRIVATE-DIAGNOSTIC', 'PRIVATE-NUMBER']) assert.equal(encoded.includes(privateValue), false);
  assert.deepEqual(Object.keys(result).sort(), ['authenticity', 'checks', 'confidence', 'outcome', 'pagesScanned', 'source', 'summary', 'version'].sort());
  assert.ok(result.checks.every((item) => Object.keys(item).sort().join(',') === 'code,label,result'));
});

test('high-confidence mismatches need attention, while unreadable or low-confidence text remains unknown', () => {
  const wrongText = 'PASSPORT\nOTHER PERSON\nRegistration No: 1111111\nValid Until: 31 December 2031\nPROFESSIONAL TEACHER';
  const result = scan({ ocr: { status: 'processed', confidence: 95, pagesScanned: 1, text: wrongText } });
  assert.equal(result.outcome, 'needs_attention');
  for (const code of ['document_type', 'account_name', 'license_number', 'professional_role']) assert.equal(check(result, code).result, 'flag', code);
  for (const ocr of [
    { status: 'processed', confidence: 59.999, text: wrongText },
    { status: 'processed', confidence: null, text },
    { status: 'processed', confidence: 99, text: '' },
    { status: 'unreadable', confidence: 99, text: wrongText },
    { status: 'unsupported', confidence: 99, text: wrongText },
    { status: 'unavailable', text: wrongText, reason: 'Private runtime diagnostic' },
  ]) {
    const result = scan({ ocr });
    assert.equal(result.outcome, 'manual_review');
    for (const code of ['ocr_readability', 'document_type', 'account_name', 'license_number', 'professional_role']) assert.equal(check(result, code).result, 'unknown');
    assert.equal(result.authenticity, 'not_verified');
  }
  assert.equal(check(scan({ ocr: { status: 'processed', confidence: 60, text } }), 'ocr_readability').result, 'pass');
});

test('name comparison tolerates accents, case, whitespace and punctuation without partial-name matching', () => {
  const patient = { role: 'patient', first_name: 'Ána-Marie', last_name: "De-la Crúz" };
  const patientId = { kind: 'patient_id', document_type: 'philhealth_id' };
  const result = scan({ account: patient, credential: patientId, ocr: { status: 'processed', confidence: 80, text: 'PhilHealth\nAna Marie DE-LA CRUZ\nSYNTHETIC ID ONLY' } });
  assert.equal(result.outcome, 'ready_for_review'); assert.equal(check(result, 'account_name').result, 'pass');
  const partial = scan({ account: { role: 'patient', first_name: 'Ana', last_name: 'Cruz' }, credential: patientId, ocr: { status: 'processed', confidence: 80, text: 'PhilHealth\nANABEL CRUZ\nSYNTHETIC ID ONLY' } });
  assert.equal(check(partial, 'account_name').result, 'flag');
  const initial = scan({ account: { role: 'patient', first_name: 'A', last_name: 'Cruz' }, credential: patientId, ocr: { status: 'processed', confidence: 80, text: 'PhilHealth\nA CRUZ\nSYNTHETIC ID ONLY' } });
  assert.equal(check(initial, 'account_name').result, 'unknown'); assert.equal(initial.outcome, 'manual_review');
});

test('supported government ID text markers are compared independently from professional qualification', () => {
  const examples = {
    philhealth_id: 'PHILIPPINE HEALTH INSURANCE CORPORATION', national_id: 'PAMBANSANG PAGKAKAKILANLAN',
    passport: 'PASAPORTE', drivers_license: 'DRIVER LICENSE', umid: 'UNIFIED MULTI-PURPOSE ID',
    sss_id: 'SOCIAL SECURITY SYSTEM', gsis_id: 'GOVERNMENT SERVICE INSURANCE SYSTEM',
    postal_id: 'POSTAL ID', voters_id: "VOTER'S ID",
  };
  for (const [type, marker] of Object.entries(examples)) {
    const result = scan({ credential: { kind: 'patient_id', document_type: type }, account: { role: 'patient', first_name: 'Synthetic', last_name: 'Patient' }, ocr: { status: 'processed', confidence: 90, text: marker + '\nSYNTHETIC PATIENT' } });
    assert.equal(check(result, 'document_type').result, 'pass', type);
    assert.equal(result.outcome, 'ready_for_review');
    assert.equal(result.authenticity, 'not_verified');
  }
  const other = scan({ credential: { kind: 'patient_id', document_type: 'other_government_id', document_label: 'Private custom label' }, account: { role: 'patient', first_name: 'Synthetic', last_name: 'Patient' }, ocr: { status: 'processed', confidence: 99, text: 'GOVERNMENT DOCUMENT\nSYNTHETIC PATIENT' } });
  assert.equal(other.outcome, 'manual_review'); assert.equal(check(other, 'document_type').result, 'unknown');
});

test('professional role and number mismatches cannot be hidden by matching names or another profession', () => {
  for (const [role, profession] of [['doctor', 'PHYSICIAN'], ['nurse', 'NURSE'], ['midwife', 'MIDWIFE']]) {
    const result = scan({ account: { ...account, role }, ocr: { status: 'processed', confidence: 90, text: text.replace('REGISTERED NURSE', profession) } });
    assert.equal(check(result, 'professional_role').result, 'pass');
  }
  const wrong = scan({ account: { ...account, role: 'doctor' } });
  assert.equal(wrong.outcome, 'needs_attention'); assert.equal(check(wrong, 'professional_role').result, 'flag');
  const dual = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('REGISTERED NURSE', 'REGISTERED NURSE AND MIDWIFE') } });
  assert.equal(check(dual, 'professional_role').result, 'unknown'); assert.equal(dual.outcome, 'manual_review');
  const missing = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('REGISTERED NURSE', 'CARD HOLDER') } });
  assert.equal(check(missing, 'professional_role').result, 'unknown');
  const notSubstring = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('765-4321', '176543210') } });
  assert.equal(check(notSubstring, 'license_number').result, 'flag');
});

test('expiry checks use Manila midnight and compare only unambiguous labelled dates', () => {
  const expiry = { ...credential, expires_at: '2030-01-02' };
  const datedText = text.replace('31 December 2031', 'January 2, 2030');
  const before = scan({ credential: expiry, now: new Date('2030-01-02T15:59:59Z'), ocr: { status: 'processed', confidence: 90, text: datedText } });
  assert.equal(check(before, 'submitted_expiry').result, 'pass'); assert.equal(check(before, 'printed_expiry').result, 'pass');
  const after = scan({ credential: expiry, now: new Date('2030-01-02T16:00:00Z'), ocr: { status: 'processed', confidence: 90, text: datedText } });
  assert.equal(check(after, 'submitted_expiry').result, 'flag'); assert.equal(check(after, 'printed_expiry').result, 'flag'); assert.equal(after.outcome, 'needs_attention');
  for (const date of ['03/04/2031', '31/02/2031', 'DATE UNREADABLE', '2031-02-30']) {
    const result = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('31 December 2031', date) } });
    assert.equal(check(result, 'printed_expiry').result, 'unknown', date); assert.equal(result.outcome, 'manual_review');
  }
  for (const date of ['2031-12-31', '31/12/2031', '12/31/2031', 'December 31 2031']) assert.equal(check(scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('31 December 2031', date) } }), 'printed_expiry').result, 'pass');
  const conflicting = scan({ ocr: { status: 'processed', confidence: 90, text: text + '\nExpiry date: 2032-01-31' } });
  assert.equal(check(conflicting, 'printed_expiry').result, 'unknown');
  const missingLabel = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('Valid Until:', 'Unlabelled date:') } });
  assert.equal(check(missingLabel, 'printed_expiry').result, 'unknown');
  const passport = scan({ credential: { kind: 'patient_id', document_type: 'passport' }, account: { role: 'patient', first_name: 'Synthetic', last_name: 'Patient' }, ocr: { status: 'processed', confidence: 90, text: 'PASSPORT\nSYNTHETIC PATIENT\nExpiry date: 2031-12-31' } });
  assert.equal(check(passport, 'printed_expiry').result, 'pass'); assert.equal(passport.outcome, 'ready_for_review');
});

test('a clearly labelled DOB mismatch is a flag, while ambiguous or absent optional DOB remains unknown', () => {
  const mismatch = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('1990-02-14', '1990-02-15') } });
  assert.equal(check(mismatch, 'date_of_birth').result, 'flag'); assert.equal(mismatch.outcome, 'needs_attention');
  const ambiguous = scan({ ocr: { status: 'processed', confidence: 90, text: text.replace('1990-02-14', '03/04/1990') } });
  assert.equal(check(ambiguous, 'date_of_birth').result, 'unknown'); assert.equal(ambiguous.outcome, 'ready_for_review');
  assert.equal(check(scan({ account: { ...account, date_of_birth: undefined } }), 'date_of_birth'), undefined);
});

test('an exact duplicate only flags extra review and never identifies another account', () => {
  const result = scan({ duplicateDetected: true });
  assert.equal(result.outcome, 'needs_attention'); assert.equal(check(result, 'duplicate_document').result, 'flag');
  assert.equal(result.authenticity, 'not_verified');
  assert.equal(JSON.stringify(result).includes('other_user'), false);
  const unreadableDuplicate = scan({ duplicateDetected: true, ocr: { status: 'unavailable' } });
  assert.equal(unreadableDuplicate.outcome, 'needs_attention');
  assert.equal(check(unreadableDuplicate, 'account_name').result, 'unknown');
});

test('malformed and oversized OCR metadata stays bounded and cannot claim authentication', () => {
  const result = scan({ ocr: { status: 'processed', confidence: 101, pagesScanned: 999, text } });
  assert.equal(result.confidence, null); assert.equal(result.pagesScanned, 10); assert.equal(result.outcome, 'manual_review');
  assert.equal(scan({ ocr: { status: 'processed', confidence: NaN, pagesScanned: -1, text } }).pagesScanned, 0);
  assert.equal(analyzeCredential({ credential: null, account: null, ocr: null, now }).authenticity, 'not_verified');
  const huge = scan({ ocr: { status: 'processed', confidence: 100, pagesScanned: 1, text: 'X'.repeat(24000) + '\n' + text } });
  assert.equal(huge.outcome, 'needs_attention');
  assert.equal(check(huge, 'account_name').result, 'flag', 'Text beyond the analysis bound must not become matching evidence');
});
