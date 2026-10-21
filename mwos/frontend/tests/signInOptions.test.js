import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { createServer } from 'vite'

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
    assert.match(html, /SMS/)
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
