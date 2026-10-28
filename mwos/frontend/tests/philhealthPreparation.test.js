import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectMember, inspectPreparation, philhealthSources, preparationPackages } from '../src/utils/philhealthPreparation.js'

test('PIN checks normalize accepted spacing and hyphens without implying eligibility', () => {
  for (const pin of ['123456789012', '12-345678901-2', ' 12 345678901 2 ']) {
    assert.deepEqual(inspectMember({ philhealth_id: pin, philhealth_type: 'Member' }), {
      pinPresent: true, pinFormatValid: true, membershipTypePresent: true,
    })
  }
  for (const pin of ['12345678901', '1234567890123', 'abc123456789012', '12/345678901/2']) {
    assert.equal(inspectMember({ philhealth_id: pin }).pinFormatValid, false)
  }
  assert.deepEqual(inspectMember(null), { pinPresent: false, pinFormatValid: false, membershipTypePresent: false })
  assert.deepEqual(inspectMember({ philhealth_id: ' ', philhealth_type: ' ' }), { pinPresent: false, pinFormatValid: false, membershipTypePresent: false })
  const result = inspectPreparation({ philhealth_id: '123456789012' }, [], 'delivery')
  assert.deepEqual(Object.keys(result.member), ['pinPresent', 'pinFormatValid', 'membershipTypePresent'])
  assert.match(result.warning, /do not confirm membership, eligibility/)
  assert.equal('eligible' in result, false)
  assert.equal('ready' in result, false)
})

test('each care package finds only its explicitly classified records and never CF3', () => {
  const documents = [
    { id: 'antenatal', document_type: ' Antenatal   Care Record ' },
    { id: 'postpartum', document_type: 'PPCR' },
    { id: 'delivery', document_type: 'Claim Form 4' },
    { id: 'legacy', document_type: 'CF3' },
    { id: 'legacy-long', document_type: 'Claim Form 3' },
  ]
  for (const [packageKey, id] of [['antenatal', 'antenatal'], ['postpartum', 'postpartum'], ['delivery', 'delivery']]) {
    const result = inspectPreparation({}, documents, packageKey)
    assert.deepEqual(result.recordDocuments.map((document) => document.id), [id])
    assert.equal(result.documentsCount, 5)
  }
})

test('rejected documents remain counted but do not satisfy document-presence checks', () => {
  const documents = [
    { id: 'rejected-record', document_type: 'CF4', verification_status: ' Rejected ', status: 'verified' },
    { id: 'rejected-id', document_type: 'PhilHealth ID', verification_status: 'rejected' },
    { id: 'pending-record', document_type: 'cf 4', verification_status: 'pending_review' },
    { id: 'pending-id', document_type: 'philhealth id', verification_status: 'pending_review' },
  ]
  const result = inspectPreparation({}, documents, 'delivery')
  assert.equal(result.documentsCount, 4)
  assert.deepEqual(result.recordDocuments, [documents[2]])
  assert.deepEqual(result.idDocuments, [documents[3]])
  assert.equal(result.recordDocuments[0].verification_status, 'pending_review')
  assert.equal('verified' in result, false)
  assert.equal('approved' in result, false)
})

test('generic document status is a fallback only when verification_status is absent', () => {
  const documents = [
    { id: 'fallback-rejected', document_type: 'CF4', status: 'rejected' },
    { id: 'fallback-pending', document_type: 'CF4', status: 'pending_review' },
    { id: 'actual-pending', document_type: 'CF4', verification_status: 'pending_review', status: 'rejected' },
  ]
  const result = inspectPreparation({}, documents, 'delivery')
  assert.equal(result.documentsCount, 3)
  assert.deepEqual(result.recordDocuments, [documents[1], documents[2]])
})

test('arbitrary titles, filenames and PDF labels never establish CF4 or electronic SOA readiness', () => {
  const documents = [
    { document_type: 'CF4 report' },
    { document_type: 'CF4.pdf' },
    { document_type: 'Other', title: 'CF4', file_name: 'CF4.pdf' },
    { document_type: 'eSOA', file_name: 'approved-electronic-soa.pdf', status: 'verified' },
  ]
  const result = inspectPreparation({}, documents, 'delivery')
  assert.deepEqual(result.recordDocuments, [])
  assert.deepEqual(result.idDocuments, [])
  assert.match(result.warning, /do not establish electronic SOA compliance/)
  assert.deepEqual(Object.keys(result), ['member', 'documentsCount', 'recordDocuments', 'idDocuments', 'warning'])
})

test('unsupported packages and malformed inputs produce no inferred matching record', () => {
  assert.deepEqual(inspectPreparation({}, null, 'antenatal').recordDocuments, [])
  assert.deepEqual(inspectPreparation({}, [{ document_type: 'CF4' }], '__proto__').recordDocuments, [])
  assert.deepEqual(inspectPreparation({}, [{ document_type: 'ANCR' }], 'unknown').recordDocuments, [])
  assert.deepEqual(Object.keys(preparationPackages), ['antenatal', 'postpartum', 'delivery'])
  assert.equal(philhealthSources.length, 4)
  for (const source of philhealthSources) assert.equal(new URL(source.href).hostname, 'www.philhealth.gov.ph')
})
