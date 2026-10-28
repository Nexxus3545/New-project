import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCredentialSubmission, CREDENTIAL_MAX_BYTES, clinicDate, credentialRequirement, effectiveCredentialStatus, readCredentialFile, readCredentialResponse, userMatchesCredentialGroup, validateCredentialSubmission } from '../src/utils/accountCredentials.js'

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
