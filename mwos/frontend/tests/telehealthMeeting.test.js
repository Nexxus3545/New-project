import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canJoinTelehealth } from '../src/utils/telehealthMeeting.js'

test('a scheduled consultation can request a managed room without a pasted link', () => {
  for (const status of ['scheduled', 'active']) assert.equal(canJoinTelehealth({ id: 'session', status, meeting_url: '' }), true)
  assert.equal(canJoinTelehealth({ status: 'scheduled' }), false)
})
test('a legacy room link cannot enable an unconfirmed or closed consultation', () => {
  for (const status of ['requested', 'completed', 'cancelled', 'unknown']) assert.equal(canJoinTelehealth({ id: 'session', status, meeting_url: 'https://meet.google.com/abc-defg-hij' }), false)
  assert.equal(canJoinTelehealth(null), false)
})
