import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStore } from 'zustand/vanilla'
import { QueryClient } from '@tanstack/react-query'
import { bindSessionCache } from '../src/utils/sessionCache.js'

test('changing account, role or logging out clears query and mutation caches synchronously', () => {
  const auth = createStore(() => ({ user: { id: 'a', role: 'patient' } }))
  const client = new QueryClient()
  const unsubscribe = bindSessionCache(auth, client)
  try {
    for (const user of [{ id: 'b', role: 'patient' }, { id: 'b', role: 'nurse' }, null]) {
      client.setQueryData(['patient-dashboard'], { private: 'previous patient' })
      client.getMutationCache().build(client, { mutationKey: ['private-result'] })
      auth.setState({ user })
      assert.equal(client.getQueryData(['patient-dashboard']), undefined)
      assert.equal(client.getMutationCache().getAll().length, 0)
    }
  } finally { unsubscribe(); client.clear() }
})
test('editing the same profile does not erase current queries', () => {
  const auth = createStore(() => ({ user: { id: 'a', role: 'patient', firstName: 'Old' } }))
  const client = new QueryClient()
  const unsubscribe = bindSessionCache(auth, client)
  client.setQueryData(['patient-dashboard'], { own: true })
  auth.setState({ user: { id: 'a', role: 'patient', firstName: 'New' } })
  assert.deepEqual(client.getQueryData(['patient-dashboard']), { own: true })
  unsubscribe(); client.clear()
})
test('an old in-flight response cannot repopulate an unscoped key after account change', async () => {
  const auth = createStore(() => ({ user: { id: 'a', role: 'patient' } }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const unsubscribe = bindSessionCache(auth, client)
  let finish
  const old = client.fetchQuery({ queryKey: ['patient-dashboard'], queryFn: () => new Promise((resolve) => { finish = resolve }) }).catch(() => {})
  auth.setState({ user: { id: 'b', role: 'patient' } })
  client.setQueryData(['patient-dashboard'], { own: 'b' })
  finish({ private: 'a' })
  await old
  assert.deepEqual(client.getQueryData(['patient-dashboard']), { own: 'b' })
  unsubscribe(); client.clear()
})
