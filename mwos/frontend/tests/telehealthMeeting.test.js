import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeGoogleMeetUrl, canJoinTelehealth } from '../src/utils/telehealthMeeting.js'

test('join targets accept only canonical Google Meet room links', () => {
  assert.equal(safeGoogleMeetUrl('https://meet.google.com/abc-defg-hij?authuser=0#detail'), 'https://meet.google.com/abc-defg-hij')
  for (const link of ['javascript:alert(1)', 'https://meet.google.com.evil.invalid/abc-defg-hij', 'https://meet.google.com@evil.invalid/abc-defg-hij', 'https://meet.google.com:444/abc-defg-hij', 'http://meet.google.com/abc-defg-hij', 'https://meet.jit.si/private-patient-room', 'https://meet.google.com/lookup/anything', 'https://meet.google.com/new']) assert.equal(safeGoogleMeetUrl(link), '')
})
test('a room link alone never turns an unconfirmed or closed request into a joinable call', () => {
  for (const status of ['requested', 'completed', 'cancelled', 'unknown']) assert.equal(canJoinTelehealth({ status, meeting_url: 'https://meet.google.com/abc-defg-hij' }), false)
  for (const status of ['scheduled', 'active']) {
    assert.equal(canJoinTelehealth({ status, meeting_url: 'https://meet.google.com/abc-defg-hij' }), true)
    assert.equal(canJoinTelehealth({ status, meeting_url: 'https://unsafe.invalid' }), false)
  }
})
