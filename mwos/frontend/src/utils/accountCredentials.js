export const CREDENTIAL_MAX_BYTES = 2 * 1024 * 1024
export const CLINICAL_ROLES = ['doctor', 'midwife', 'nurse']
export const PATIENT_ID_TYPES = [
  ['philhealth_id', 'PhilHealth ID'], ['national_id', 'National ID / PhilSys'],
  ['passport', 'Passport'], ['drivers_license', "Driver's license"], ['umid', 'UMID'],
  ['sss_id', 'SSS ID'], ['gsis_id', 'GSIS ID'], ['postal_id', 'Postal ID'],
  ['voters_id', "Voter's ID"], ['other_government_id', 'Other government-issued ID'],
]
export const credentialRequirement = (role) => role === 'patient' ? 'patient_id' : CLINICAL_ROLES.includes(role) ? 'professional_license' : 'none'
export const userMatchesCredentialGroup = (user, group) => group === 'patients' ? user.role === 'patient' : group === 'clinical' ? CLINICAL_ROLES.includes(user.role) : group === 'administrators' ? user.role === 'admin' : true
export const credentialLabel = (type, label) => type === 'professional_license' ? 'PRC / professional ID' : PATIENT_ID_TYPES.find(([key]) => key === type)?.[1] === 'Other government-issued ID' ? label || 'Other government-issued ID' : PATIENT_ID_TYPES.find(([key]) => key === type)?.[1] || 'Identity document'

export function clinicDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (key) => parts.find((part) => part.type === key)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
export function effectiveCredentialStatus(credential, now = new Date()) {
  if (!credential) return 'missing'
  return credential.status === 'verified' && credential.kind === 'professional_license' && (!validDate(credential.expiresAt) || credential.expiresAt < clinicDate(now)) ? 'expired' : credential.status
}

export function validateCredentialSubmission(role, form, file, now = new Date()) {
  const requirement = credentialRequirement(role)
  if (requirement === 'none') throw new Error('This account does not require a patient ID or professional license.')
  if (!form?.consent) throw new Error('Confirm that the clinic may review this document for account verification.')
  if (!file || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || !Number.isInteger(file.size) || file.size < 1 || file.size > CREDENTIAL_MAX_BYTES) throw new Error('Choose one JPEG, PNG, or PDF file up to 2 MB.')
  if (requirement === 'patient_id') {
    if (!PATIENT_ID_TYPES.some(([key]) => key === form.documentType)) throw new Error('Choose a government-issued ID type.')
    if (form.documentType === 'other_government_id' && (!form.documentLabel?.trim() || form.documentLabel.trim().length > 100)) throw new Error('Enter the name of the government-issued ID (up to 100 characters).')
    if (form.idLast4 && !/^[A-Za-z0-9]{4}$/.test(form.idLast4.trim())) throw new Error('Enter only the last four letters or digits, or leave this field blank.')
  } else {
    if (form.documentType !== 'professional_license') throw new Error('A PRC or professional ID is required for clinical staff.')
    if (!/^[A-Za-z0-9][A-Za-z0-9 ./-]{2,119}$/.test(form.licenseNumber?.trim() || '')) throw new Error('Enter the professional license number shown on the ID.')
    if (!validDate(form.expiresAt) || form.expiresAt <= clinicDate(now)) throw new Error('Choose a professional license expiry date after today in Manila time.')
  }
  return requirement
}

export async function readCredentialFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size < 1 || file.size > CREDENTIAL_MAX_BYTES) throw new Error('Choose one JPEG, PNG, or PDF file up to 2 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const has = (prefix) => prefix.every((value, index) => bytes[index] === value)
  const actual = has([0xff, 0xd8, 0xff]) ? 'image/jpeg' : has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'image/png' : has([0x25, 0x50, 0x44, 0x46, 0x2d]) ? 'application/pdf' : null
  if (bytes.length !== file.size || actual !== file.type) throw new Error('The file content does not match a supported ID image or PDF. Choose the original file again.')
  let binary = ''
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
  return { name: String(file.name || 'identity-document').replace(/[\\/\r\n]/g, '_').slice(0, 180), mimeType: file.type, dataBase64: btoa(binary) }
}

export async function buildCredentialSubmission(role, form, file, now = new Date()) {
  const requirement = validateCredentialSubmission(role, form, file, now)
  const fields = requirement === 'patient_id'
    ? { documentType: form.documentType, ...(form.documentType === 'other_government_id' ? { documentLabel: form.documentLabel.trim() } : {}), ...(form.idLast4?.trim() ? { idLast4: form.idLast4.trim() } : {}) }
    : { documentType: 'professional_license', licenseNumber: form.licenseNumber.trim(), expiresAt: form.expiresAt }
  return { ...fields, consent: true, file: await readCredentialFile(file) }
}

// Read only the documented metadata. Uploaded bytes and arbitrary response fields
// cannot become visible UI state or be cached in the account query.
export function readCredentialResponse(data, { userId, role }) {
  const requirement = credentialRequirement(role)
  if (!data || data.requirement !== requirement || (data.credential !== null && (typeof data.credential !== 'object' || Array.isArray(data.credential)))) throw new Error('Invalid credential response')
  const value = data.credential
  if (value === null) return { requirement, credential: null }
  if (requirement === 'none' || value.userId !== userId || value.kind !== requirement || !['pending', 'verified', 'rejected'].includes(value.status) || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.hasDocument !== 'boolean') throw new Error('Invalid credential response')
  return { requirement, credential: {
    userId: value.userId, kind: value.kind, status: value.status, revision: value.revision, hasDocument: value.hasDocument,
    documentType: String(value.documentType || '').slice(0, 100), documentLabel: String(value.documentLabel || '').slice(0, 100),
    licenseNumber: requirement === 'professional_license' ? String(value.licenseNumber || '').slice(0, 120) : null,
    idLast4: requirement === 'patient_id' && /^[A-Za-z0-9]{4}$/.test(value.idLast4 || '') ? value.idLast4 : null,
    expiresAt: validDate(value.expiresAt) ? value.expiresAt : null,
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : null,
    reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : null,
    reviewNotes: String(value.reviewNotes || '').slice(0, 1500),
    fileName: String(value.fileName || 'identity-document').replace(/[\\/\r\n]/g, '_').slice(0, 180),
    mimeType: ['image/jpeg', 'image/png', 'application/pdf'].includes(value.mimeType) ? value.mimeType : null,
  } }
}
