import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { createServer } from 'vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let server
let getSignInProviderNote
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

before(async () => {
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  })
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, hmr: false },
  })
  ;({ getSignInProviderNote } = await server.ssrLoadModule('/src/hooks/useSignInProviders.js'))
})

after(async () => {
  await server?.close()
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
  else delete globalThis.localStorage
})

test('login and registration render Google but do not offer Facebook', async () => {
  for (const [file, path] of [['LoginPage', '/login'], ['RegisterPage', '/register']]) {
    const { default: Page } = await server.ssrLoadModule(`/src/pages/${file}.jsx`)
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: path }, React.createElement(Page)))
    assert.match(html, /Continue with Google/)
    assert.doesNotMatch(html, /Facebook/i)
    assert.match(html, file === 'LoginPage' ? /Sign in securely/ : /Create your account/)
    assert.doesNotMatch(html, /Continue with SMS|Sign in with SMS/)
  }
})

test('provider notices describe only Google in loading, unavailable, and available states', () => {
  assert.match(getSignInProviderNote(null, false), /Checking/)
  assert.match(getSignInProviderNote({ google: false }, true), /couldn't check Google/)
  assert.match(getSignInProviderNote({ google: false, facebook: true }, false), /unavailable right now/)
  assert.match(getSignInProviderNote({ google: true }, false), /patient accounts/)
  for (const providers of [null, { google: false }, { google: true }]) {
    for (const checkFailed of [true, false]) {
      assert.doesNotMatch(getSignInProviderNote(providers, checkFailed), /Facebook|being set up/i)
    }
  }
})

test('contact screen never claims an unverified phone is ready for recovery', async () => {
  const { default: Card } = await server.ssrLoadModule('/src/components/common/ContactNumberCard.jsx')
  const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(Card)))
  assert.match(html, /Saving it does not verify ownership/)
  assert.match(html, /SMS verification and SMS recovery are not connected yet/)
  assert.doesNotMatch(html, /Send verification code/)
})

test('video player has real playback controls and loads external embeds only after consent', async () => {
  const { default: Player } = await server.ssrLoadModule('/src/components/patient/ClinicMediaPlayer.jsx')
  const direct = renderToStaticMarkup(React.createElement(Player, { src: 'https://cdn.example/video.mp4' }))
  assert.match(direct, /<video/)
  assert.match(direct, /controls/)
  assert.match(direct, /preload="none"/)
  const external = renderToStaticMarkup(React.createElement(Player, { src: 'https://www.facebook.com/clinic/videos/123456789/' }))
  assert.match(external, /Load Facebook video/)
  assert.doesNotMatch(external, /<iframe/)
})

const renderAccount = async (section, role = 'patient') => {
  const { useAuthStore } = await server.ssrLoadModule('/src/store/authStore.js')
  const user = { id: 'test-user', role, firstName: 'Test', lastName: 'Patient', email: 'patient@example.invalid' }
  useAuthStore.setState({ user })
  const { default: Page } = await server.ssrLoadModule('/src/pages/AccountCenterPage.jsx')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['auth-me'], user)
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: section === 'settings' ? '/my/settings' : '/my/profile' },
    React.createElement(QueryClientProvider, { client }, React.createElement(Page, { section }))))
}

test('patient profile contains care details without settings or password controls', async () => {
  const html = await renderAccount('profile')
  assert.match(html, /Your profile/)
  assert.match(html, /Personal, Biometrics &amp; Credentials/)
  assert.match(html, /Secure Document Uploads/)
  assert.doesNotMatch(html, /Theme mode|Current password|Save login email|contact-recovery-phone/)
  assert.match(html, /href="\/my\/settings"/)
})

test('patient settings contains sign-in, recovery, appearance, and security but no care form', async () => {
  const html = await renderAccount('settings')
  assert.match(html, /Sign-in email/)
  assert.match(html, /Theme mode/)
  assert.match(html, /Current password/)
  assert.match(html, /contact-recovery-phone/)
  assert.doesNotMatch(html, /Date of birth|Secure Document Uploads|Save patient record|Send OTP/)
})

test('staff step-up security appears only in Settings', async () => {
  assert.doesNotMatch(await renderAccount('profile', 'admin'), /Step-up access|Send OTP/)
  assert.match(await renderAccount('settings', 'admin'), /Step-up access/)
})

test('transport receipt provides a saved reference without claiming dispatch', async () => {
  const { default: Receipt } = await server.ssrLoadModule('/src/components/patient/TransportRequestReceipt.jsx')
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(Receipt, {
    request: { id: 'test-reference', status: 'open', created_at: '2026-10-22T10:00:00Z' }, onNewRequest: () => {},
  })))
  assert.match(html, /Your transport request was sent/)
  assert.match(html, /test-reference/)
  assert.match(html, /not an ambulance dispatch/)
  assert.match(html, /href="\/my\/messages"/)
  assert.match(html, /role="status"/)
  assert.doesNotMatch(html, />Send urgent transport request</)
})
