import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let server, settings, Panel
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const values = new Map()
let blocked = false
before(async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error('Storage blocked'); values.set(key, value) },
  } })
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } })
  settings = await server.ssrLoadModule('/src/store/settingsStore.js')
  Panel = (await server.ssrLoadModule('/src/components/common/SettingsPanel.jsx')).default
})
after(async () => {
  await server?.close()
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
  else delete globalThis.localStorage
})
test('browser settings sanitize values and persist only non-clinical display choices', () => {
  for (const input of [null, 'bad', 1, []]) assert.deepEqual(settings.normalizeSettings(input), { language: 'en', showClinicMedia: true, showTips: true })
  settings.useSettingsStore.getState().update({ language: 'fil', showTips: false, accessToken: 'never-store' })
  assert.deepEqual(JSON.parse(values.get('mwos-display-settings')), { language: 'fil', showClinicMedia: true, showTips: false })
  blocked = true
  assert.throws(() => settings.useSettingsStore.getState().update({ language: 'en' }), /Storage blocked/)
  assert.equal(settings.useSettingsStore.getState().preferences.language, 'fil')
  blocked = false
  settings.useSettingsStore.getState().update({ language: 'en', showTips: true })
})
const renderPanel = (section, data, error) => {
  const account = { id: 'own-user', role: 'patient', email: 'test@example.invalid', phone: '09171234567' }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  if (data) client.setQueryData(['own-account-activity', account.id], data)
  if (error) client.getQueryCache().build(client, { queryKey: ['own-account-activity', account.id] }).setState({ status: 'error', error })
  return renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(QueryClientProvider, { client }, React.createElement(Panel, { section, account }))))
}
test('activity states distinguish errors from empty history and render safe labels', () => {
  assert.match(renderPanel('activity'), /Loading activity/)
  assert.match(renderPanel('activity', []), /No recorded activity/)
  const failed = renderPanel('activity', null, new Error('Private backend details'))
  assert.match(failed, /Activity could not be loaded/)
  assert.doesNotMatch(failed, /No recorded activity|Private backend details/)
  const html = renderPanel('activity', [{ id: 'notice:1', action: 'GOOGLE_SIGN_IN', area: 'account', createdAt: '2026-10-24T00:00:00Z', new_values: { secret: 'not-for-ui' } }])
  assert.match(html, /Google sign-in/)
  assert.doesNotMatch(html, /not-for-ui/)
})
test('privacy checkup never labels a saved contact as verified and language scope is explicit', () => {
  assert.match(renderPanel('privacy-checkup'), /Saved; SMS ownership is not verified/)
  assert.match(renderPanel('language'), /Clinical records and other screens keep their original language/)
  assert.equal(settings.settingsSections.length, 7)
  assert.match(renderPanel('content'), /do not hide appointments, care records, safety alerts/)
})
