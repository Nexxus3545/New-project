import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCredentialReview, buildCredentialSubmission, CREDENTIAL_MAX_BYTES, clinicDate, credentialRequirement, credentialScanNeedsAttention, effectiveCredentialStatus, hasCurrentCredentialScan, readCredentialFile, readCredentialResponse, readCredentialScan, userMatchesCredentialGroup, validateCredentialSubmission } from '../src/utils/accountCredentials.js'

const now = new Date('2030-06-14T20:00:00Z')
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const file = { name: 'private-id.png', type: 'image/png', size: pngBytes.length, arrayBuffer: async () => pngBytes.buffer }
const patient = { documentType: 'national_id', idLast4: '1234', consent: true }
const professional = { documentType: 'professional_license', licenseNumber: 'PRC-1234567', expiresAt: '2031-06-14', consent: true }
test('patients and clinical roles have separate requirements; admins are not treated as licensed clinicians', () => {
  assert.equal(credentialRequirement('patient'), 'patient_id')
  for (const role of ['doctor', 'nurse', 'midwife']) assert.equal(credentialRequirement(role), 'professional_license')
  assert.equal(credentialRequirement('admin'), 'none')
  const users = ['admin', 'patient', 'doctor', 'midwife', 'nurse'].map((role) => ({ role }))
  assert.deepEqual(users.filter((user) => userMatchesCredentialGroup(user, 'patients')).map((user) => user.role), ['patient'])
  assert.deepEqual(users.filter((user) => userMatchesCredentialGroup(user, 'clinical')).map((user) => user.role), ['doctor', 'midwife', 'nurse'])
  assert.deepEqual(users.filter((user) => userMatchesCredentialGroup(user, 'administrators')).map((user) => user.role), ['admin'])
})
test('patient submission uses one government ID and cannot forward a full ID number, staff license, or extra document', async () => {
  const payload = await buildCredentialSubmission('patient', { ...patient, validIdNumber: 'FULL-PRIVATE-NUMBER', licenseNumber: 'STAFF-LICENSE', extraFiles: ['not-sent'] }, file, now)
  assert.deepEqual(Object.keys(payload).sort(), ['consent', 'documentType', 'file', 'idLast4'])
  assert.equal(payload.idLast4, '1234')
  assert.equal(payload.file.dataBase64, Buffer.from(pngBytes).toString('base64'))
  assert.throws(() => validateCredentialSubmission('patient', { ...patient, documentType: 'professional_license' }, file, now))
  assert.throws(() => validateCredentialSubmission('patient', { ...patient, idLast4: 'FULL-NUMBER' }, file, now))
  assert.throws(() => validateCredentialSubmission('patient', { ...patient, consent: false }, file, now))
  assert.throws(() => validateCredentialSubmission('patient', { ...patient, documentType: 'other_government_id' }, file, now))
  assert.equal(validateCredentialSubmission('patient', { ...patient, documentType: 'other_government_id', documentLabel: 'Government-issued card' }, file, now), 'patient_id')
})
test('clinical submissions require a professional number and future expiry in Manila time', async () => {
  assert.equal(clinicDate(now), '2030-06-15')
  const payload = await buildCredentialSubmission('nurse', { ...professional, idLast4: '1234', documentLabel: 'ignored' }, file, now)
  assert.equal(payload.licenseNumber, professional.licenseNumber)
  assert.equal(payload.expiresAt, professional.expiresAt)
  assert.equal('idLast4' in payload, false)
  for (const patch of [{ licenseNumber: '' }, { expiresAt: '2030-06-15' }, { expiresAt: '2030-06-14' }, { expiresAt: '2031-02-30' }, { documentType: 'philhealth_id' }]) assert.throws(() => validateCredentialSubmission('doctor', { ...professional, ...patch }, file, now))
  assert.throws(() => validateCredentialSubmission('admin', professional, file, now))
  assert.equal(effectiveCredentialStatus({ kind: 'professional_license', status: 'verified', expiresAt: '2030-06-14' }, now), 'expired')
  assert.equal(effectiveCredentialStatus({ kind: 'professional_license', status: 'verified', expiresAt: '2030-06-15' }, now), 'verified')
})
test('file validation refuses mismatched MIME, oversized and unsupported files before upload', async () => {
  await assert.rejects(readCredentialFile({ ...file, type: 'application/pdf' }))
  await assert.rejects(readCredentialFile({ ...file, type: 'image/svg+xml' }))
  await assert.rejects(readCredentialFile({ ...file, size: CREDENTIAL_MAX_BYTES + 1 }))
  await assert.rejects(readCredentialFile({ ...file, size: 0 }))
  await assert.rejects(readCredentialFile({ ...file, size: file.size + 1 }))
})
const receipt = { requirement: 'patient_id', credential: { userId: 'patient-user', kind: 'patient_id', status: 'pending', revision: 2, hasDocument: true, documentType: 'national_id', idLast4: '1234', fileName: 'private.png', mimeType: 'image/png', document_bytes: 'NEVER DISPLAY', dataBase64: 'NEVER CACHE', licenseNumber: 'UNRELATED' } }
test('receipt validation rejects cross-account or malformed success and strips private arbitrary response fields', () => {
  const clean = readCredentialResponse(receipt, { userId: 'patient-user', role: 'patient' })
  assert.equal(JSON.stringify(clean).includes('NEVER'), false)
  assert.equal(clean.credential.licenseNumber, null)
  assert.equal(clean.credential.idLast4, '1234')
  for (const changed of [{ userId: 'someone-else' }, { status: 'approved' }, { revision: 0 }, { kind: 'professional_license' }, { hasDocument: 'yes' }]) assert.throws(() => readCredentialResponse({ ...receipt, credential: { ...receipt.credential, ...changed } }, { userId: 'patient-user', role: 'patient' }))
  assert.throws(() => readCredentialResponse({ ...receipt, requirement: 'professional_license' }, { userId: 'patient-user', role: 'patient' }))
  assert.deepEqual(readCredentialResponse({ requirement: 'patient_id', credential: null }, { userId: 'patient-user', role: 'patient' }), { requirement: 'patient_id', credential: null })
})

const readyScan = (changes = {}) => ({ status: 'completed', revision: 2, scannedAt: '2030-06-14T19:55:00Z', analysis: {
  version: 1, authenticity: 'not_verified', source: 'local_ocr', outcome: 'ready_for_review', confidence: 92,
  pagesScanned: 1, checks: [{ code: 'account_name', result: 'pass', label: 'UNTRUSTED PRIVATE OCR TEXT' }, { code: 'ocr_readability', result: 'pass', label: 'UNTRUSTED CONFIDENCE' }, { code: 'issuer_authentication', result: 'unknown', label: 'UNTRUSTED DOCUMENT NUMBER' }], summary: 'UNTRUSTED PRIVATE SUMMARY', text: 'UNTRUSTED FULL DOCUMENT',
}, ...changes })
const reviewedCredential = (scan = readyScan()) => readCredentialResponse({ ...receipt, credential: { ...receipt.credential, scan } }, { userId: 'patient-user', role: 'patient' }).credential

test('scan results are bound to the current revision and cannot expose raw OCR or claim issuer authenticity', () => {
  const current = reviewedCredential()
  assert.equal(hasCurrentCredentialScan(current, now), true)
  assert.equal(credentialScanNeedsAttention(current, now), false)
  assert.equal(current.scan.analysis.confidence, 92)
  assert.equal(current.scan.analysis.authenticity, 'not_verified')
  assert.equal(current.scan.analysis.checks[0].label, 'Account name comparison')
  assert.equal(JSON.stringify(current.scan).includes('UNTRUSTED'), false)
  assert.equal(reviewedCredential(readyScan({ revision: 1 })).scan.status, 'not_scanned')
  assert.equal(reviewedCredential(readyScan({ status: 'approved' })).scan.status, 'not_scanned')
  assert.equal(reviewedCredential(readyScan({ analysis: { ...readyScan().analysis, authenticity: 'genuine' } })).scan.status, 'not_scanned')
  const clean = readCredentialScan(readyScan({ analysis: { ...readyScan().analysis, confidence: 500, pagesScanned: 1000, checks: [{ code: 'raw_ocr_text', result: 'flag', label: 'UNTRUSTED' }] } }), 2)
  assert.equal(clean.analysis.confidence, null)
  assert.equal(clean.analysis.pagesScanned, 0)
  assert.deepEqual(clean.analysis.checks, [])
  assert.equal(clean.analysis.outcome, 'manual_review', 'Malformed readability cannot appear consistent')
})

test('approval requires a finished current scan, explicit issuer/original check and concern acknowledgement', () => {
  const credential = reviewedCredential()
  const options = { credential, decision: 'verified', reviewNotes: 'Compared the original with the account holder.', verificationMethod: 'in_person_original', officialCheckConfirmed: true }
  assert.deepEqual(buildCredentialReview(options, now), { status: 'verified', revision: 2, reviewNotes: options.reviewNotes, verificationMethod: 'in_person_original', officialCheckConfirmed: true })
  for (const patch of [
    { credential: reviewedCredential(null) }, { credential: reviewedCredential(readyScan({ status: 'processing' })) },
    { credential: reviewedCredential(readyScan({ revision: 1 })) }, { verificationMethod: 'automatic_ocr' },
    { officialCheckConfirmed: false }, { officialCheckConfirmed: 'yes' }, { reviewNotes: '  ' },
    { credential: reviewedCredential(readyScan({ scannedAt: '2030-06-14T19:00:00Z' })) },
    { credential: reviewedCredential(readyScan({ scannedAt: null })) },
  ]) assert.throws(() => buildCredentialReview({ ...options, ...patch }, now))
  for (const status of ['unreadable', 'unavailable', 'failed']) {
    const failed = reviewedCredential(readyScan({ status, analysis: null }))
    assert.equal(hasCurrentCredentialScan(failed, now), true)
    assert.equal(credentialScanNeedsAttention(failed, now), true)
    assert.throws(() => buildCredentialReview({ ...options, credential: failed }, now))
    assert.equal(buildCredentialReview({ ...options, credential: failed, acknowledgeScanFlags: true }, now).acknowledgeScanFlags, true)
  }
  const flags = reviewedCredential(readyScan({ analysis: { ...readyScan().analysis, outcome: 'needs_attention', checks: [{ code: 'account_name', result: 'flag', label: 'unused' }] } }))
  assert.throws(() => buildCredentialReview({ ...options, credential: flags }, now))
  assert.equal(buildCredentialReview({ ...options, credential: flags, acknowledgeScanFlags: true }, now).revision, 2)
  assert.deepEqual(buildCredentialReview({ credential: reviewedCredential(null), decision: 'rejected', reviewNotes: 'Please submit a clearer copy.' }, now), { status: 'rejected', revision: 2, reviewNotes: 'Please submit a clearer copy.' })
})
