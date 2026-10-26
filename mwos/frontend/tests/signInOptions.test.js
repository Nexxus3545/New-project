import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
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
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
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

const renderAccount = async (section, role = 'patient', search = '') => {
  const { useAuthStore } = await server.ssrLoadModule('/src/store/authStore.js')
  const user = { id: 'test-user', role, firstName: 'Test', lastName: 'Patient', email: 'patient@example.invalid' }
  useAuthStore.setState({ user })
  const { default: Page } = await server.ssrLoadModule('/src/pages/AccountCenterPage.jsx')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['auth-me'], user)
  const location = section === 'settings'
    ? `${role === 'patient' ? '/my/settings' : '/settings'}${search}`
    : role === 'patient' ? '/my/profile' : '/account'
  return renderToStaticMarkup(React.createElement(StaticRouter, { location },
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

test('patient settings keeps account and security separate from appearance', async () => {
  const html = await renderAccount('settings')
  assert.match(html, /Sign-in email/)
  assert.match(html, /aria-label="Settings sections"/)
  assert.match(html, /href="\/my\/settings\?tab=appearance"/)
  assert.doesNotMatch(html, /Theme mode|Save appearance/)
  assert.match(html, /Current password/)
  assert.match(html, /contact-recovery-phone/)
  assert.doesNotMatch(html, /Date of birth|Secure Document Uploads|Save patient record|Send OTP/)
})

test('appearance has its own settings view for patients and staff without account controls', async () => {
  for (const role of ['patient', 'admin', 'nurse']) {
    const html = await renderAccount('settings', role, '?tab=appearance')
    assert.match(html, /<h1[^>]*>Settings<\/h1>/)
    assert.match(html, /aria-label="Appearance"/)
    assert.match(html, /aria-label="Theme mode"/)
    assert.match(html, /aria-label="Blush theme preview"/)
    assert.match(html, /aria-pressed="true"/)
    assert.match(html, /data-app-icon="appearance"/)
    assert.match(html, /Save appearance/)
    assert.doesNotMatch(html, /aria-label="(?:Accent palette|Density|Motion|Surface style)"|Restore TMC Copino defaults|>Graphite<|>Compact<|>Full motion</)
    assert.doesNotMatch(html, /Login email|Current password|contact-recovery-phone|Step-up access|Save patient record/)
    const navigation = html.match(/<nav aria-label="Settings sections"[\s\S]*?<\/nav>/)[0]
    const activeLink = navigation.match(/<a aria-current="page"[^>]*>/)[0]
    assert.ok(activeLink.includes(`href="${role === 'patient' ? '/my/settings' : '/settings'}?tab=appearance"`))
  }
})

test('unknown settings sections fall back to account and security', async () => {
  const html = await renderAccount('settings', 'patient', '?tab=unknown')
  assert.match(html, /Current password/)
  assert.doesNotMatch(html, /Theme mode|Save appearance/)
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

test('every patient, staff, and admin navigation module uses an icon without removing its label', async () => {
  const { useAuthStore } = await server.ssrLoadModule('/src/store/authStore.js')
  const { default: Layout } = await server.ssrLoadModule('/src/components/common/AppLayout.jsx')
  const snapshot = useAuthStore.getInitialState()
  const originalUser = snapshot.user
  // SSR needs each fixture's current role rather than Zustand's module-load snapshot.
  try {
    for (const [role, count] of [['patient', 11], ['nurse', 15], ['midwife', 15], ['doctor', 16], ['admin', 19]]) {
      snapshot.user = { id: 'test-user', role, firstName: 'Test', lastName: 'User', careType: 'maternal' }
      const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: role === 'patient' ? '/my/settings' : '/settings' },
        React.createElement(Layout, { patient: role === 'patient' })))
      const nav = html.match(/<nav aria-label="(?:Patient|Clinic) modules"[\s\S]*?<\/nav>/)[0]
      const links = [...nav.matchAll(/<a\s[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0])
      assert.equal(links.length, count)
      for (const link of links) {
        assert.equal((link.match(/<svg /g) || []).length, 1)
        assert.match(link, /aria-hidden="true"/)
        assert.match(link, /focusable="false"/)
        assert.match(link, /stroke="currentColor"/)
        assert.match(link, /<span>[^<]+<\/span>/)
        assert.doesNotMatch(link, />[A-Z]{2}<\//)
      }
      assert.match(nav, /aria-current="page"[^>]*>[\s\S]*?data-app-icon="settings"/)
      assert.match(html, /data-app-icon="menu"/)
      assert.match(html, /data-app-icon="signOut"/)
      if (role !== 'admin') assert.doesNotMatch(nav, /User Management|Staff Credentials|Compliance/)
      if (['admin', 'doctor'].includes(role)) assert.match(nav, /Billing &amp; Payments/)
      else assert.doesNotMatch(nav, /Billing &amp; Payments/)
    }
  } finally {
    snapshot.user = originalUser
  }
})

test('general-care navigation does not label a patient as pregnant', async () => {
  const { useAuthStore } = await server.ssrLoadModule('/src/store/authStore.js')
  const { default: Layout } = await server.ssrLoadModule('/src/components/common/AppLayout.jsx')
  const snapshot = useAuthStore.getInitialState()
  const originalUser = snapshot.user
  try {
    snapshot.user = { role: 'patient', patientGender: 'male', careType: 'general' }
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/my/dashboard' }, React.createElement(Layout, { patient: true })))
    assert.match(html, /Clinic Readings/)
    assert.doesNotMatch(html, /My Pregnancy|Baby \/ Newborn|Your pregnancy status/)
  } finally { snapshot.user = originalUser }
})

test('icons contain visible geometry and remain decorative at compact sizes', async () => {
  const { default: Icon } = await server.ssrLoadModule('/src/components/common/AppIcon.jsx')
  const names = ['dashboard', 'patients', 'calendar', 'prenatal', 'postnatal', 'baby', 'delivery', 'records', 'video',
    'messages', 'emergency', 'inventory', 'education', 'reports', 'settings', 'users', 'credentials', 'compliance',
    'notifications', 'health', 'profile', 'menu', 'signOut']
  const artwork = new Set()
  for (const name of names) {
    const html = renderToStaticMarkup(React.createElement(Icon, { name, className: 'h-4 w-4' }))
    assert.match(html, /viewBox="0 0 24 24"/)
    assert.match(html, /class="shrink-0 h-4 w-4"/)
    assert.doesNotMatch(html, /<text|<image|<title|http/)
    const geometry = html.match(/<svg[^>]*>([\s\S]+)<\/svg>/)[1]
    assert.match(geometry, /<(?:path|rect|circle)/)
    assert.equal(artwork.has(geometry), false, name + ' needs distinct artwork')
    artwork.add(geometry)
  }
})
