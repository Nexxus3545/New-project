import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmbeddedCall, validateEmbeddedAccess } from '../src/utils/embeddedCall.js'

const access = () => ({
  provider: 'daily',
  roomUrl: 'https://tmc-copino.daily.co/mwos-0123456789abcdef0123456789abcdef',
  token: 'opaque.private.token',
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve() }

class Frame {
  constructor({ join = async () => {}, destroy = async () => {} } = {}) {
    this.listeners = new Map()
    this.joinCalls = []
    this.destroys = 0
    this.removes = 0
    this.titles = []
    this.runJoin = join
    this.runDestroy = destroy
  }
  on(event, handler) { this.listeners.set(event, handler) }
  off(event, handler) { if (this.listeners.get(event) === handler) this.listeners.delete(event) }
  emit(event, payload) { this.listeners.get(event)?.(payload) }
  iframe() { return { setAttribute: (...args) => this.titles.push(args), remove: () => { this.removes += 1 } } }
  join(options) { this.joinCalls.push(options); return this.runJoin() }
  destroy() { this.destroys += 1; return this.runDestroy() }
}

function fixture(overrides = {}) {
  const states = [], active = [], order = [], requests = [], factories = []
  const frame = overrides.frame || new Frame()
  let leaves = 0
  const controller = createEmbeddedCall({
    container: { owner: 'test-container' },
    requestAccess: async ({ signal }) => { requests.push(signal); return access() },
    loadDaily: async () => ({ default: { createFrame: (container, options) => { factories.push({ container, options }); return frame } } }),
    onState: (state) => states.push(state),
    onBeforeJoin: () => order.push('stop-local-devices'),
    onActiveChange: (value) => { active.push(value); order.push(value ? 'active' : 'inactive') },
    onLeave: () => { leaves += 1 },
    ...overrides,
  })
  return { controller, frame, states, active, order, requests, factories, leaves: () => leaves }
}

test('access accepts only a canonical Daily HTTPS room and an unexpired private token', () => {
  assert.deepEqual(validateEmbeddedAccess(access()), { roomUrl: access().roomUrl, token: access().token })
  const badUrls = [
    'http://tmc-copino.daily.co/0123456789',
    'https://daily.co/0123456789',
    'https://tmc-copino.daily.co.evil.example/0123456789',
    'https://evil.example/0123456789',
    'https://user:password@tmc-copino.daily.co/0123456789',
    'https://tmc-copino.daily.co:443/0123456789',
    'https://tmc-copino.daily.co:444/0123456789',
    'https://TMC-COPINO.daily.co/0123456789',
    'https://tmc-copino.daily.co/0123456789?t=secret',
    'https://tmc-copino.daily.co/0123456789#secret',
    'https://tmc-copino.daily.co/nested/0123456789',
    'https://tmc-copino.daily.co/%300123456789',
    'https://tmc-copino.daily.co/0123456789/',
    'https://sub.tmc-copino.daily.co/0123456789',
    '//tmc-copino.daily.co/0123456789',
  ]
  for (const roomUrl of badUrls) assert.throws(() => validateEmbeddedAccess({ ...access(), roomUrl }), undefined, roomUrl)
  for (const changed of [{ provider: 'meet' }, { token: '' }, { token: 'a b' }, { token: null }, { expiresAt: 'invalid' }, { expiresAt: new Date(0).toISOString() }]) {
    assert.throws(() => validateEmbeddedAccess({ ...access(), ...changed }))
  }
})

test('only an explicit join requests access, stops the preview first, and actual joined-meeting enables In call', async () => {
  const f = fixture()
  assert.equal(f.requests.length, 0)
  assert.equal(f.factories.length, 0)
  const joining = f.controller.join()
  assert.deepEqual(f.order, ['stop-local-devices', 'active'])
  await joining
  assert.equal(f.factories.length, 1)
  assert.deepEqual(f.factories[0].options.iframeStyle, { width: '100%', height: '100%', border: '0' })
  assert.equal(f.factories[0].options.showLeaveButton, true)
  assert.deepEqual(f.frame.joinCalls[0], { url: access().roomUrl, token: access().token })
  assert.equal(f.states.at(-1).status, 'prejoin')
  assert.ok(!JSON.stringify(f.states).includes(access().token))
  f.frame.emit('joining-meeting')
  assert.equal(f.states.at(-1).status, 'connecting')
  f.frame.emit('joined-meeting')
  assert.equal(f.states.at(-1).status, 'joined')
  f.frame.emit('camera-error', { errorMsg: 'sensitive error containing token' })
  assert.equal(f.states.at(-1).status, 'joined')
  assert.ok(f.states.at(-1).warning.includes('permissions'))
  assert.ok(!JSON.stringify(f.states).includes('sensitive'))
  await f.controller.destroy()
})

test('duplicate join clicks cannot request extra tokens or frames', async () => {
  const pending = deferred()
  let requests = 0
  const f = fixture({ requestAccess: () => { requests += 1; return pending.promise } })
  const first = f.controller.join()
  assert.equal(await f.controller.join(), false)
  pending.resolve(access())
  await first
  assert.equal(requests, 1)
  assert.equal(f.factories.length, 1)
  await f.controller.destroy()
})

test('leaving destroys the iframe, removes listeners, and waits for device release before inactive', async () => {
  const disposed = deferred()
  const f = fixture({ frame: new Frame({ destroy: () => disposed.promise }) })
  await f.controller.join()
  f.frame.emit('joined-meeting')
  const leaving = f.controller.leave()
  assert.equal(f.frame.destroys, 1)
  assert.equal(f.frame.listeners.size, 0)
  assert.equal(f.leaves(), 1)
  assert.equal(f.states.at(-1).status, 'left')
  assert.deepEqual(f.active, [true])
  disposed.resolve()
  await leaving
  assert.deepEqual(f.active, [true, false])
  assert.equal(f.frame.removes, 1)
  await f.controller.destroy()
  assert.equal(f.frame.destroys, 1)
})

test('cancelled access is aborted and a late API response never loads the SDK or creates a frame', async () => {
  const pending = deferred()
  let signal, sdkLoads = 0
  const f = fixture({ requestAccess: (options) => { signal = options.signal; return pending.promise }, loadDaily: () => { sdkLoads += 1 } })
  const joining = f.controller.join()
  await f.controller.leave()
  assert.equal(signal.aborted, true)
  pending.resolve(access())
  assert.equal(await joining, false)
  assert.equal(sdkLoads, 0)
  assert.equal(f.states.at(-1).status, 'left')
  assert.deepEqual(f.active, [true, false])
  await f.controller.destroy()
})

test('unmount during an already pending leave still waits for the frame to release devices', async () => {
  const disposed = deferred()
  const f = fixture({ frame: new Frame({ destroy: () => disposed.promise }) })
  await f.controller.join()
  const leaving = f.controller.leave()
  const removing = f.controller.destroy()
  await flush()
  assert.deepEqual(f.active, [true])
  disposed.resolve()
  await Promise.all([leaving, removing])
  assert.deepEqual(f.active, [true, false])
  assert.equal(f.frame.destroys, 1)
})

test('unmount while the SDK is loading cannot open a late room or publish state', async () => {
  const loaded = deferred()
  let factories = 0
  const f = fixture({ loadDaily: () => loaded.promise })
  const joining = f.controller.join()
  await flush()
  await f.controller.destroy()
  const stateCount = f.states.length
  loaded.resolve({ createFrame: () => { factories += 1 } })
  assert.equal(await joining, false)
  assert.equal(factories, 0)
  assert.equal(f.states.length, stateCount)
  assert.deepEqual(f.active, [true, false])
  assert.equal(await f.controller.join(), false)
})

test('a previous iframe is destroyed before a replacement can be created, without clearing new active state', async () => {
  const disposed = deferred()
  const old = fixture({ frame: new Frame({ destroy: () => disposed.promise }) })
  await old.controller.join()
  const removing = old.controller.destroy()
  const replacement = fixture()
  const joining = replacement.controller.join()
  await flush()
  assert.equal(replacement.factories.length, 0)
  disposed.resolve()
  await removing
  await joining
  assert.equal(replacement.factories.length, 1)
  assert.deepEqual(replacement.active, [true])
  assert.deepEqual(old.active, [true])
  await replacement.controller.destroy()
  assert.deepEqual(replacement.active, [true, false])
})

test('late rejection from an old join cannot overwrite a rejoined call', async () => {
  const pendingJoin = deferred()
  const first = new Frame({ join: () => pendingJoin.promise })
  const second = new Frame()
  let created = 0
  const f = fixture({ loadDaily: async () => ({ createFrame: () => ++created === 1 ? first : second }) })
  const joining = f.controller.join()
  await flush()
  const staleJoined = first.listeners.get('joined-meeting')
  await f.controller.leave()
  await f.controller.join()
  second.emit('joined-meeting')
  pendingJoin.reject(new Error('token from old call'))
  await joining
  staleJoined()
  assert.equal(f.states.at(-1).status, 'joined')
  assert.equal(first.destroys, 1)
  assert.equal(second.destroys, 0)
  await f.controller.destroy()
  assert.equal(second.destroys, 1)
})

test('provider errors show a static safe message and still destroy the provider instance', async () => {
  const f = fixture()
  await f.controller.join()
  f.frame.emit('error', { errorMsg: `private details ${access().token}`, error: { url: access().roomUrl } })
  await flush()
  assert.equal(f.states.at(-1).status, 'error')
  assert.equal(f.frame.destroys, 1)
  assert.ok(!JSON.stringify(f.states).includes(access().token))
  assert.ok(!JSON.stringify(f.states).includes(access().roomUrl))
  assert.deepEqual(f.active, [true, false])
  await f.controller.destroy()
})

test('expired or untrusted server access fails closed without creating a provider instance', async () => {
  const f = fixture({ requestAccess: async () => ({ ...access(), roomUrl: 'https://attacker.example/patient-token' }) })
  assert.equal(await f.controller.join(), false)
  assert.equal(f.factories.length, 0)
  assert.equal(f.states.at(-1).status, 'error')
  assert.deepEqual(f.active, [true, false])
  await f.controller.destroy()
})

test('provider leave is local and does not perform an administrative completion request', async () => {
  const f = fixture()
  await f.controller.join()
  f.frame.emit('joined-meeting')
  f.frame.emit('left-meeting')
  await flush()
  assert.equal(f.requests.length, 1)
  assert.equal(f.leaves(), 1)
  assert.equal(f.frame.destroys, 1)
  assert.equal(f.states.at(-1).status, 'left')
  await f.controller.destroy()
})
