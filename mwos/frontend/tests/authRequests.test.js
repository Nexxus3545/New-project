import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAuthRecoveryAction, isPublicAuthRequest } from '../src/utils/authRequests.js'

test('invalid credential requests keep their error on the form instead of logging out', () => {
  for (const path of ['/auth/login', '/api/auth/register', '/api/v1/auth/sms-login/verify', '/auth/oauth/exchange']) {
    assert.equal(getAuthRecoveryAction({ config: { url: path }, response: { status: 401 } }), 'none')
  }
})

test('protected requests still refresh expired access tokens and reject invalid sessions', () => {
  const config = { url: '/auth/me' }
  assert.equal(getAuthRecoveryAction({ config, response: { status: 401, data: { code: 'TOKEN_EXPIRED' } } }), 'refresh')
  assert.equal(getAuthRecoveryAction({ config, response: { status: 401 } }), 'logout')
  assert.equal(getAuthRecoveryAction({ config: { ...config, _retry: true }, response: { status: 401 } }), 'none')
})

test('public auth path matching supports API prefixes without exposing protected auth actions', () => {
  assert.equal(isPublicAuthRequest('https://clinic.example/api/v1/auth/login/?source=portal'), true)
  assert.equal(isPublicAuthRequest('auth/providers'), true)
  for (const path of ['/auth/me', '/auth/change-password', '/auth/oauth/complete-profile', '/auth/webauthn/register/start', '/auth/login/extra']) {
    assert.equal(isPublicAuthRequest(path), false)
  }
})

test('network failures and incomplete errors do not trigger session redirects', () => {
  assert.equal(getAuthRecoveryAction({}), 'none')
  assert.equal(getAuthRecoveryAction({ response: { status: 401 } }), 'none')
  assert.equal(getAuthRecoveryAction({ config: { url: '/patients' }, response: { status: 503 } }), 'none')
})
