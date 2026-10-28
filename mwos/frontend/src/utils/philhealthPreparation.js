export const philhealthSources = [
  { label: 'eClaims 3.0 and electronic SOA requirements', href: 'https://www.philhealth.gov.ph/advisories/2025/PA2025-0076.pdf' },
  { label: '2026 maternity claims clarification', href: 'https://www.philhealth.gov.ph/advisories/2026/PA2026-0046.pdf' },
  { label: 'PhilHealth Cloud Storage application', href: 'https://www.philhealth.gov.ph/downloads/eclaims/PCSS_ApplicationForm.pdf' },
  { label: 'Official PhilHealth forms and downloads', href: 'https://www.philhealth.gov.ph/downloads/' },
]

export const preparationPackages = {
  antenatal: {
    label: 'Antenatal care',
    recordLabel: 'ANCR',
    recordHints: ['ANCR', 'Antenatal Care Record'],
  },
  postpartum: {
    label: 'Postpartum care',
    recordLabel: 'PPCR',
    recordHints: ['PPCR', 'Postpartum Care Record', 'Post Partum Care Record'],
  },
  delivery: {
    label: 'Delivery',
    recordLabel: 'CF4',
    recordHints: ['CF4', 'CF 4', 'Claim Form 4'],
  },
}

const valueText = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
const normalizeType = (value) => valueText(value).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, ' ')

// This checks only data entry. A well-formed PIN does not establish membership or eligibility.
export const inspectMember = (patient) => {
  const enteredPin = valueText(patient?.philhealth_id)
  const digits = enteredPin.replace(/\D/g, '')
  return {
    pinPresent: enteredPin.length > 0,
    pinFormatValid: /^[\d\s-]+$/.test(enteredPin) && digits.length === 12,
    membershipTypePresent: valueText(patient?.philhealth_type).length > 0,
  }
}

export const inspectPreparation = (patient, documents, packageKey) => {
  const storedDocuments = Array.isArray(documents) ? documents : []
  const selectedPackage = Object.hasOwn(preparationPackages, packageKey) ? preparationPackages[packageKey] : null
  const recordTypes = new Set((selectedPackage?.recordHints || []).map(normalizeType))
  const activeDocuments = storedDocuments.filter((document) => document && normalizeType(document.verification_status ?? document.status) !== 'rejected')
  return {
    member: inspectMember(patient),
    documentsCount: storedDocuments.length,
    // A document's saved type is a staff-entered classification, not confirmation of its contents.
    recordDocuments: activeDocuments.filter((document) => recordTypes.has(normalizeType(document.document_type))),
    idDocuments: activeDocuments.filter((document) => normalizeType(document.document_type) === 'philhealth id'),
    warning: selectedPackage
      ? 'PIN format and document presence are internal preparation checks only. They do not confirm membership, eligibility, document validity, or claim approval. Uploaded files do not establish electronic SOA compliance.'
      : 'Select a supported care package to review its records. No eligibility or claim approval has been checked.',
  }
}
