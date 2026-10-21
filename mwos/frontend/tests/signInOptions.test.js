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
