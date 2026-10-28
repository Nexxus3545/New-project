import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDevicePreview } from '../src/utils/devicePreview.js'

class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.enabled = true; this.readyState = 'live'; this.stops = 0 }
  stop() { this.stops += 1; this.readyState = 'ended' }
}
const makeStream = (kinds = ['video', 'audio']) => {
  const tracks = kinds.map((kind) => new Track(kind))
  return { getTracks: () => tracks, getVideoTracks: () => tracks.filter((track) => track.kind === 'video'), getAudioTracks: () => tracks.filter((track) => track.kind === 'audio') }
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture(overrides = {}) {
  const states = [], streams = [], levels = [], requests = [], cancelled = []
  const frames = new Map()
  const stream = makeStream()
  const controller = createDevicePreview({
    mediaDevices: { getUserMedia: async (constraints) => { requests.push(constraints); return stream } },
    secureContext: true,
    createAudioContext: null,
    requestFrame: (callback) => { const id = frames.size + 1; frames.set(id, callback); return id },
    cancelFrame: (id) => cancelled.push(id),
    onState: (state) => states.push(state), onStream: (value) => streams.push(value), onLevel: (value) => levels.push(value),
    ...overrides,
  })
  return { controller, states, streams, levels, requests, stream, frames, cancelled }
}

test('the preview does not request devices before an explicit start and stop releases all tracks', async () => {
  const f = fixture()
  assert.equal(f.requests.length, 0)
  await f.controller.start()
  assert.equal(f.requests.length, 1)
  assert.equal(f.states.at(-1).cameraOn, true)
  assert.equal(f.states.at(-1).microphoneOn, true)
  assert.equal(f.streams.at(-1), f.stream)
  f.controller.toggle('video')
  f.controller.toggle('audio')
  assert.equal(f.stream.getVideoTracks()[0].enabled, false)
  assert.equal(f.stream.getAudioTracks()[0].enabled, false)
  f.controller.stop()
  assert.ok(f.stream.getTracks().every((track) => track.stops === 1))
  assert.equal(f.streams.at(-1), null)
  assert.equal(f.states.at(-1).status, 'idle')
})

test('cancelling a pending permission request immediately releases its eventual stream', async () => {
  const pending = deferred(), stream = makeStream()
  const f = fixture({ mediaDevices: { getUserMedia: () => pending.promise } })
  const start = f.controller.start()
  assert.equal(f.states.at(-1).status, 'pending')
  f.controller.stop()
  pending.resolve(stream)
  await start
  assert.ok(stream.getTracks().every((track) => track.stops === 1))
  assert.equal(f.states.at(-1).status, 'idle')
  assert.ok(!f.streams.includes(stream))
})

test('destroying the preview invalidates late grants and later errors without publishing state', async () => {
  const pending = deferred(), stream = makeStream()
  const f = fixture({ mediaDevices: { getUserMedia: () => pending.promise } })
  const start = f.controller.start()
  f.controller.destroy()
  const count = f.states.length
  pending.resolve(stream)
  await start
  assert.equal(f.states.length, count)
  assert.ok(stream.getTracks().every((track) => track.stops === 1))
  const second = deferred(), g = fixture({ mediaDevices: { getUserMedia: () => second.promise } })
  const next = g.controller.start()
  g.controller.destroy()
  second.reject(Object.assign(new Error(), { name: 'NotAllowedError' }))
  await next
  assert.equal(g.states.at(-1).status, 'pending')
})

test('an old permission response cannot replace a newer active preview', async () => {
  const first = deferred(), second = deferred(), oldStream = makeStream(), newStream = makeStream()
  let requests = 0
  const f = fixture({ mediaDevices: { getUserMedia: () => (++requests === 1 ? first.promise : second.promise) } })
  const a = f.controller.start(), b = f.controller.start()
  second.resolve(newStream); await b
  first.resolve(oldStream); await a
  assert.equal(f.streams.at(-1), newStream)
  assert.ok(oldStream.getTracks().every((track) => track.stops === 1))
  assert.ok(newStream.getTracks().every((track) => track.stops === 0))
  f.controller.destroy()
})

test('audio-only checks never request video and disconnected devices release the preview', async () => {
  const stream = makeStream(['audio']), constraints = []
  const f = fixture({ mediaDevices: { getUserMedia: async (input) => { constraints.push(input); return stream } } })
  await f.controller.start('audio')
  assert.equal(constraints[0].video, false)
  assert.equal(f.states.at(-1).cameraAvailable, false)
  stream.getAudioTracks()[0].dispatchEvent(new Event('ended'))
  assert.equal(f.states.at(-1).status, 'idle')
  assert.match(f.states.at(-1).message, /disconnected/)
  assert.equal(stream.getAudioTracks()[0].stops, 1)
})

test('input meter uses actual analyser samples and cleanup closes the context and cancels animation', async () => {
  let closed = 0, connectedToDestination = false
  const f = fixture({ createAudioContext: () => ({
    destination: {},
    createMediaStreamSource: () => ({ connect: (target) => { connectedToDestination = !target.getByteTimeDomainData } }),
    createAnalyser: () => ({ fftSize: 256, getByteTimeDomainData: (samples) => samples.fill(160) }),
    resume: async () => {}, close: async () => { closed += 1 },
  }) })
  await f.controller.start()
  assert.equal(f.states.at(-1).meterAvailable, true)
  f.frames.get(1)(0)
  assert.ok(f.levels.at(-1) > 0)
  assert.equal(connectedToDestination, false)
  f.controller.stop()
  assert.equal(closed, 1)
  assert.ok(f.cancelled.length)
  assert.equal(f.levels.at(-1), 0)
})

test('denied, unavailable, unsupported and insecure access give useful errors without false success', async () => {
  for (const [name, message] of [['NotAllowedError', /blocked/], ['NotFoundError', /could not be found/], ['NotReadableError', /could not start/]]) {
    const f = fixture({ mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error(), { name }) } } })
    await f.controller.start()
    assert.equal(f.states.at(-1).status, 'error')
    assert.match(f.states.at(-1).message, message)
  }
  const insecure = fixture({ secureContext: false })
  await insecure.controller.start()
  assert.match(insecure.states.at(-1).message, /HTTPS/)
  assert.equal(insecure.requests.length, 0)
  const unsupported = fixture({ mediaDevices: null })
  await unsupported.controller.start()
  assert.match(unsupported.states.at(-1).message, /cannot access/)
})
