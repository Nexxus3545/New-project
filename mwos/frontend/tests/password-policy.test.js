import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { passwordPolicyChecks, passwordMeetsPolicy, passwordPolicyError } from '../src/utils/passwordPolicy.js'

const require = createRequire(import.meta.url)
const backend = require('../../backend/src/utils/passwordPolicy.js')

test('password review rejects missing categories and accepts letters without requiring both cases', () => {
  for (const value of ['', 'lettersOnly', 'letters123', 'letters!!', '12345678!', 'letters1 ', 'a1!', undefined, {}, 123456789]) assert.equal(passwordMeetsPolicy(value), false)
  for (const value of ['abcdef1!', 'ABCDEF1!', 'Ábcdef1!', 'abc 123!', 'abc12345🔐']) assert.equal(passwordMeetsPolicy(value), true)
  assert.equal(passwordPolicyChecks('letters1 ').symbol, false)
  assert.equal(passwordPolicyChecks('letters1_').symbol, true)
});

test('client and server review the same Unicode, byte limits, whitespace and invalid values', () => {
  for (const value of [null, undefined, false, {}, 123456789, 'abcdef1!', 'ábcdef1!', 'abc12345🔐', 'a1!' + 'x'.repeat(69), 'a1!' + 'x'.repeat(70), 'a1!' + 'é'.repeat(35), 'Abcdef1!\n']) {
    assert.deepEqual(passwordPolicyChecks(value), backend.passwordPolicyChecks(value))
    assert.equal(passwordPolicyError(value), backend.passwordPolicyError(value))
  }
  assert.equal(passwordMeetsPolicy('a1!' + 'x'.repeat(69)), true)
  assert.equal(passwordMeetsPolicy('a1!' + 'x'.repeat(70)), false)
});

let server, PasswordRequirements
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } })
  ;({ default: PasswordRequirements } = await server.ssrLoadModule('/src/components/common/PasswordRequirements.jsx'))
})
after(async () => { await server?.close() })

test('live checklist explains missing requirements and only reports a passing password after every check', () => {
  const weak = renderToStaticMarkup(React.createElement(PasswordRequirements, { password: 'letters123' }))
  assert.match(weak, /Your new password needs/)
  assert.match(weak, /A symbol, such as/)
  assert.doesNotMatch(weak, /Password meets the requirements/)
  const valid = renderToStaticMarkup(React.createElement(PasswordRequirements, { password: 'Letters123!' }))
  assert.match(valid, /Password meets the requirements/)
  assert.match(valid, /Spaces do not count as symbols/)
  assert.doesNotMatch(valid, /Letters123!/)
})
