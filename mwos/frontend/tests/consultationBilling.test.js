import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  awaitingConsultationPayment, consultationBillingLink, consultationHasFutureSlot, getConsultationBillId,
} from '../src/utils/consultationBilling.js'
import { getPortalDestinationFromSearch } from '../src/utils/portalNavigation.js'

const id = 'bbbd0be6-440d-4bf3-a80b-b0bf655e3389'
const billQuery = `?consultationBill=${id}`

test('billing links preserve only the appointment ID across role-aware sign-in', () => {
  assert.equal(consultationBillingLink(id), `/portal${billQuery}`)
  assert.equal(getPortalDestinationFromSearch(null, billQuery), `/login${billQuery}`)
  assert.equal(getPortalDestinationFromSearch({ role: 'patient' }, billQuery), `/my/scheduling${billQuery}`)
  assert.equal(getPortalDestinationFromSearch({ role: 'doctor' }, billQuery), `/scheduling${billQuery}`)
  assert.equal(getPortalDestinationFromSearch({ role: 'admin' }, billQuery), `/scheduling${billQuery}`)
  assert.equal(getPortalDestinationFromSearch({ role: 'nurse' }, billQuery), '/dashboard')
  assert.equal(getPortalDestinationFromSearch({ role: 'patient' }, `${billQuery}&returnTo=//external.test`), `/my/scheduling${billQuery}`)
  assert.equal(getConsultationBillId('?consultationBill=//external.test'), null)
  assert.equal(consultationBillingLink('../dashboard'), null)
})

test('the QR list only includes online consultations with a bill awaiting payment or review', () => {
  const request = { id, consultation_mode: 'online', billing_id: 'bill', status: 'awaiting_payment' }
  assert.equal(awaitingConsultationPayment(request), true)
  assert.equal(awaitingConsultationPayment({ ...request, status: 'payment_review' }), true)
  assert.equal(awaitingConsultationPayment({ ...request, status: 'confirmed' }), false)
  assert.equal(awaitingConsultationPayment({ ...request, consultation_mode: 'in_person' }), false)
  assert.equal(awaitingConsultationPayment({ ...request, billing_id: null }), false)
})

test('elapsed consultation times are evaluated in Philippine time', () => {
  const request = { scheduled_date: '2030-06-11T00:00:00.000Z', scheduled_time: '15:00:00' }
  assert.equal(consultationHasFutureSlot(request, Date.parse('2030-06-11T06:59:59Z')), true)
  assert.equal(consultationHasFutureSlot(request, Date.parse('2030-06-11T07:00:00Z')), false)
  assert.equal(consultationHasFutureSlot({ ...request, scheduled_time: '15:98' }, 0), false)
})
