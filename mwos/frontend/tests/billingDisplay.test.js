import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBillAmount, formatBillDate, philHealthStatusLabel } from '../src/utils/billingDisplay.js'

test('PhilHealth payment badges are explicit and do not infer a payment from unknown values', () => {
  assert.equal(philHealthStatusLabel('processing'), 'In process')
  assert.equal(philHealthStatusLabel('paid'), 'Paid to clinic')
  for (const value of [undefined, null, 'approved', '__proto__']) {
    assert.equal(philHealthStatusLabel(value), 'Not recorded')
  }
})

test('money and update dates use local billing formats and handle missing values', () => {
  assert.equal(formatBillAmount('1400.5'), '₱1,400.50')
  assert.equal(formatBillAmount(0), '₱0.00')
  assert.equal(formatBillAmount(null), '—')
  assert.equal(formatBillDate('2026-11-28T17:00:00Z'), 'Nov 29, 2026')
  assert.equal(formatBillDate('not-a-date'), '—')
})
