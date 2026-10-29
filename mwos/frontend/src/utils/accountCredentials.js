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

const SCAN_STATUSES = ['not_scanned', 'processing', 'completed', 'unreadable', 'unavailable', 'failed']
const SCAN_OUTCOMES = ['ready_for_review', 'needs_attention', 'manual_review']
const SCAN_CHECK_LABELS = {
  ocr_readability: 'Document text readability', account_role: 'Document requirement and account role',
  submitted_expiry: 'Submitted expiry date', document_type: 'Selected document type',
  account_name: 'Account name comparison', printed_expiry: 'Printed expiry comparison',
  date_of_birth: 'Account birth date comparison', license_number: 'Professional license number comparison',
  professional_role: 'Professional role comparison', duplicate_document: 'Identical file check',
  issuer_authentication: 'Authentication by issuing authority',
}
const SCAN_SUMMARIES = {
  ready_for_review: 'Readable details are consistent with the submitted account. Clinic or issuer confirmation is still required.',
  needs_attention: 'One or more checks need attention. Compare the original document and confirm its details before deciding.',
  manual_review: 'Automatic scanning did not establish enough readable details. A clinic review is required.',
}
const emptyScan = () => ({ status: 'not_scanned', revision: null, scannedAt: null, analysis: null })

export function readCredentialScan(value, revision) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !SCAN_STATUSES.includes(value.status)) return emptyScan()
  if (value.status === 'not_scanned') return emptyScan()
  if (!Number.isSafeInteger(value.revision) || value.revision !== revision) return emptyScan()
  const scannedAt = typeof value.scannedAt === 'string' && Number.isFinite(Date.parse(value.scannedAt)) ? value.scannedAt : null
  const source = value.analysis
  let analysis = null
  if (source && source.version === 1 && source.authenticity === 'not_verified' && source.source === 'local_ocr' && SCAN_OUTCOMES.includes(source.outcome) && Array.isArray(source.checks)) {
    analysis = {
      version: 1, outcome: source.outcome, authenticity: 'not_verified', source: 'local_ocr',
      confidence: typeof source.confidence === 'number' && Number.isFinite(source.confidence) && source.confidence >= 0 && source.confidence <= 100 ? source.confidence : null,
      pagesScanned: Number.isSafeInteger(source.pagesScanned) && source.pagesScanned >= 0 && source.pagesScanned <= 10 ? source.pagesScanned : 0,
      checks: source.checks.slice(0, 20).filter((check) => check && Object.hasOwn(SCAN_CHECK_LABELS, check.code) && ['pass', 'flag', 'unknown'].includes(check.result)).map((check) => ({ code: check.code, result: check.result, label: SCAN_CHECK_LABELS[check.code] })),
      summary: SCAN_SUMMARIES[source.outcome],
    }
    if (analysis.checks.some((check) => check.result === 'flag')) analysis.outcome = 'needs_attention'
    else if (analysis.outcome === 'ready_for_review' && (!analysis.checks.some((check) => check.code === 'ocr_readability' && check.result === 'pass') || analysis.confidence === null)) analysis.outcome = 'manual_review'
    analysis.summary = SCAN_SUMMARIES[analysis.outcome]
  }
  if (value.status === 'completed' && !analysis) return emptyScan()
  return { status: value.status, revision, scannedAt, analysis }
}

export const CREDENTIAL_SCAN_REVIEW_MAX_AGE_MS = 30 * 60 * 1000
export const hasCurrentCredentialScan = (credential, now = new Date()) => {
  const scannedAt = Date.parse(credential?.scan?.scannedAt)
  return Boolean(credential?.scan && credential.scan.revision === credential.revision && ['completed', 'unreadable', 'unavailable', 'failed'].includes(credential.scan.status) && (credential.scan.status !== 'completed' || credential.scan.analysis)
    && Number.isFinite(scannedAt) && now.getTime() - scannedAt <= CREDENTIAL_SCAN_REVIEW_MAX_AGE_MS && scannedAt <= now.getTime() + 60_000)
}
export const credentialScanNeedsAttention = (credential, now = new Date()) => !hasCurrentCredentialScan(credential, now) || credential.scan.status !== 'completed' || credential.scan.analysis?.outcome !== 'ready_for_review' || credential.scan.analysis?.checks?.some((check) => check.result === 'flag')

export function buildCredentialReview({ credential, decision, reviewNotes, verificationMethod, officialCheckConfirmed, acknowledgeScanFlags }, now = new Date()) {
  if (!credential || credential.status !== 'pending' || !Number.isSafeInteger(credential.revision) || !['verified', 'rejected'].includes(decision)) throw new Error('Refresh the current pending submission before reviewing it.')
  const notes = typeof reviewNotes === 'string' ? reviewNotes.trim() : ''
  if (!notes || notes.length > 1500) throw new Error('Add a short review note before deciding.')
  const payload = { status: decision, revision: credential.revision, reviewNotes: notes }
  if (decision === 'rejected') return payload
  if (!hasCurrentCredentialScan(credential, now)) throw new Error('Run a current automated check for this submission before verifying it.')
  if (credential.kind === 'professional_license' && (!validDate(credential.expiresAt) || credential.expiresAt <= clinicDate(now))) throw new Error('The professional license needs a future expiry date before verification.')
  if (!['issuer_check', 'in_person_original'].includes(verificationMethod) || officialCheckConfirmed !== true) throw new Error('Record how you checked the ID and confirm that the check is complete.')
  if (credentialScanNeedsAttention(credential, now) && acknowledgeScanFlags !== true) throw new Error('Review and acknowledge the scan concerns before verifying this credential.')
  return { ...payload, verificationMethod, officialCheckConfirmed: true, ...(credentialScanNeedsAttention(credential, now) ? { acknowledgeScanFlags: true } : {}) }
}

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
    scan: readCredentialScan(value.scan, value.revision),
  } }
}
