import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTransportSubmission } from '../src/utils/transportRequests.js'

const id = '12345678-1234-4234-8234-123456789abc'
const nextId = '12345678-1234-4234-8234-123456789abd'
const memoryStorage = () => {
  const values = new Map()
  return { values, getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}
const result = (reference = id) => ({ data: { data: { id: reference, status: 'open' } } })

test('double clicks and repeated Send actions create only one submission', async () => {
  let calls = 0
  let finish
  const sender = createTransportSubmission({
    userId: 'test-user', storage: memoryStorage(), createId: () => id,
    post: async () => { calls += 1; await new Promise((resolve) => { finish = resolve }); return result() },
  })
  const first = sender.submit({ initialMessage: 'Test request' })
  const second = sender.submit({ initialMessage: 'Test request' })
  await Promise.resolve()
  assert.equal(calls, 1)
  finish()
  assert.deepEqual(await first, await second)
  await sender.submit({ initialMessage: 'Test request' })
  assert.equal(calls, 1)
})

test('a lost response retries with the same reference and restores it after reload', async () => {
  const storage = memoryStorage()
  const references = []
  const messages = []
  const post = async (url, payload) => {
    assert.equal(url, '/interactions/threads')
    references.push(payload.clientRequestId)
    messages.push(payload.initialMessage)
    if (references.length === 1) throw new Error('Response lost')
    return result()
  }
  const sender = createTransportSubmission({ userId: 'test-user', storage, createId: () => id, post })
  await assert.rejects(sender.submit({ initialMessage: 'Private symptoms', pickupLocation: 'Private pickup' }), /Response lost/)
  const restored = createTransportSubmission({ userId: 'test-user', storage, createId: () => nextId, post })
  assert.equal(restored.getRequestId(), id)
  await restored.submit({ initialMessage: 'Private symptoms' })
  assert.deepEqual(references, [id, id])
  assert.deepEqual(messages, ['Private symptoms', 'Private symptoms'])
  assert.deepEqual([...storage.values.values()], [id], 'Only an opaque reference may be persisted')
})

test('in-page retries preserve the original details even if live location has changed', async () => {
  const messages = []
  const sender = createTransportSubmission({
    userId: 'test-user', storage: memoryStorage(), createId: () => id,
    post: async (url, payload) => {
      messages.push(payload.initialMessage)
      if (messages.length === 1) throw new Error('Timeout')
      return result()
    },
  })
  await assert.rejects(sender.submit({ initialMessage: 'Original GPS' }), /Timeout/)
  assert.equal(sender.hasSubmitted(), true)
  await sender.submit({ initialMessage: 'Changed GPS' })
  assert.deepEqual(messages, ['Original GPS', 'Original GPS'])
})

test('request references are scoped by account and new requests need an explicit reset', async () => {
  const storage = memoryStorage()
  let selectedId = id
  const sender = createTransportSubmission({
    userId: 'first-user', storage, createId: () => selectedId,
    post: async (url, payload) => result(payload.clientRequestId),
  })
  await sender.submit({})
  const other = createTransportSubmission({ userId: 'second-user', storage, createId: () => nextId, post: async () => result(nextId) })
  assert.equal(other.getRequestId(), null)
  assert.equal(sender.reset(), true)
  selectedId = nextId
  await sender.submit({})
  assert.equal(sender.getRequestId(), nextId)
})

test('unconfirmed responses never produce a success receipt', async () => {
  const sender = createTransportSubmission({ userId: 'test-user', storage: memoryStorage(), createId: () => id, post: async () => result(nextId) })
  await assert.rejects(sender.submit({}), /could not confirm/)
})

test('blocked session storage does not prevent a safe in-page retry', async () => {
  const storage = { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Blocked') }, removeItem: () => { throw new Error('Blocked') } }
  let calls = 0
  const sender = createTransportSubmission({ userId: 'test-user', storage, createId: () => id, post: async () => { calls += 1; return result() } })
  await sender.submit({})
  await sender.submit({})
  assert.equal(calls, 1)
  assert.equal(sender.reset(), true)
})
