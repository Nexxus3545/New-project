import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateAccountProfile } from '../src/utils/accountProfile.js'

test('a profile edit preserves current sign-in and contact settings', async () => {
  const current = { firstName: 'Test', lastName: 'Patient', email: 'current@example.invalid', phone: '09171234567', avatarUrl: 'https://example.invalid/avatar.png' }
  let saved
  const api = {
    get: async (url) => { assert.equal(url, '/auth/me'); return { data: { data: current } } },
    patch: async (url, payload) => { assert.equal(url, '/auth/profile'); saved = payload; return { data: { data: payload } } },
  }
  await updateAccountProfile(api, { firstName: 'Updated', lastName: 'Name' })
  assert.deepEqual(saved, { ...current, firstName: 'Updated', lastName: 'Name' })
  await updateAccountProfile(api, { email: 'new@example.invalid' })
  assert.deepEqual(saved, { ...current, email: 'new@example.invalid' })
  await updateAccountProfile(api, { phone: '09179876543' })
  assert.deepEqual(saved, { ...current, phone: '09179876543' })
})

test('an unavailable current profile prevents a destructive partial save', async () => {
  let writes = 0
  await assert.rejects(updateAccountProfile({
    get: async () => { throw new Error('Offline') },
    patch: async () => { writes += 1 },
  }, { phone: '09171234567' }), /Offline/)
  assert.equal(writes, 0)
})
