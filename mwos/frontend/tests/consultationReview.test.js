import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createConsultationReview, formatReviewTime, makeReviewSelection, REVIEW_CHECK_FRESH_MS } from '../src/utils/consultationReview.js'

const selection = (hour = '02', id = 'request-a') => ({ sessionId: id, startAt: `2026-11-01T${hour}:00:00.000Z`, durationMinutes: 30 })
const response = (snapshot, available = true) => ({ available, startAt: snapshot.startAt, durationMinutes: snapshot.durationMinutes, conflicts: [] })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { resolve, reject, promise } }
function fixture(overrides = {}) {
  const states = [], accepted = [], checks = [], accepts = [], timers = new Map()
  let time = 1_000, timerId = 0
  const controller = createConsultationReview({
    checkAvailability: async (snapshot, options) => { checks.push({ snapshot, options }); return response(snapshot) },
    acceptConsultation: async (snapshot) => { accepts.push(snapshot); return { id: snapshot.sessionId, status: 'scheduled', start_at: snapshot.startAt, duration_minutes: snapshot.durationMinutes } },
    onState: (state) => states.push(state), onAccepted: (saved) => accepted.push(saved), now: () => time,
    schedule: (callback) => { const id = ++timerId; timers.set(id, callback); return id }, cancel: (id) => timers.delete(id),
    ...overrides,
  })
  return { controller, states, accepted, checks, accepts, timers, advance: (elapsed) => { time += elapsed } }
}

test('Manila display is explicit and invalid input cannot become a confirmed selection', () => {
  assert.ok(formatReviewTime('2026-11-01T02:00:00.000Z').includes('10:00'))
  assert.equal(makeReviewSelection('id', '', 30), null)
  assert.equal(makeReviewSelection('id', 'invalid', 30), null)
  assert.equal(makeReviewSelection('id', '2026-11-01T10:00', 25), null)
})

test('acceptance requires a fresh successful availability result for the exact selection', async () => {
  const f = fixture()
  f.controller.select(selection())
  assert.equal(await f.controller.accept(), false)
  await f.controller.check()
  assert.equal(f.states.at(-1).status, 'available')
  f.controller.select(selection('03'))
  assert.equal(await f.controller.accept(), false)
  await f.controller.check()
  assert.equal(await f.controller.accept(), true)
  assert.deepEqual(f.accepts, [selection('03')])
  assert.equal(f.accepted.length, 1)
  assert.equal(await f.controller.accept(), false, 'A consumed result cannot approve twice')
  f.controller.destroy()
})

test('changing the proposed time aborts a pending check and ignores its late available response', async () => {
  const pending = deferred()
  let signal
  const f = fixture({ checkAvailability: (_snapshot, options) => { signal = options.signal; return pending.promise } })
  f.controller.select(selection())
  const checking = f.controller.check()
  f.controller.select(selection('03'))
  assert.equal(signal.aborted, true)
  pending.resolve(response(selection()))
  await checking
  assert.equal(f.states.at(-1).status, 'idle')
  assert.equal(await f.controller.accept(), false)
  assert.equal(f.accepts.length, 0)
  f.controller.destroy()
})

test('expiry timer and the independent accept-time deadline prevent stale approval', async () => {
  const f = fixture()
  f.controller.select(selection())
  await f.controller.check()
  f.advance(REVIEW_CHECK_FRESH_MS)
  assert.equal(await f.controller.accept(), false)
  assert.equal(f.states.at(-1).status, 'stale')
  await f.controller.check()
  const expire = [...f.timers.values()].at(-1)
  expire()
  assert.equal(f.states.at(-1).status, 'stale')
  assert.equal(await f.controller.accept(), false)
  assert.equal(f.accepts.length, 0)
  f.controller.destroy()
})

test('server conflict revokes a prior successful check and demands another availability check', async () => {
  const f = fixture({ acceptConsultation: async () => { throw { response: { status: 409, data: { message: 'other patient private name' } } } } })
  f.controller.select(selection())
  await f.controller.check()
  assert.equal(await f.controller.accept(), false)
  assert.equal(f.states.at(-1).statusCode, 409)
  assert.ok(!f.states.at(-1).message.includes('private name'))
  assert.equal(await f.controller.accept(), false)
  assert.equal(f.accepted.length, 0)
  f.controller.destroy()
})

test('busy windows strip unrelated data and cannot enable acceptance', async () => {
  const f = fixture({ checkAvailability: async (snapshot) => ({ ...response(snapshot, false), conflicts: [{ kind: 'appointment', startAt: snapshot.startAt, endAt: '2026-11-01T02:30:00.000Z', patient_name: 'Other private patient' }] }) })
  f.controller.select(selection())
  await f.controller.check()
  assert.equal(f.states.at(-1).status, 'busy')
  assert.ok(!JSON.stringify(f.states).includes('Other private patient'))
  assert.equal(await f.controller.accept(), false)
  f.controller.destroy()
})

test('malformed or mismatched successful responses never announce confirmed acceptance', async () => {
  const valid = { id: 'request-a', status: 'scheduled', start_at: selection().startAt, duration_minutes: 30 }
  for (const saved of [null, {}, { ...valid, id: 'another-request' }, { ...valid, status: 'requested' }, { ...valid, start_at: selection('04').startAt }, { ...valid, duration_minutes: 60 }]) {
    const f = fixture({ acceptConsultation: async () => saved })
    f.controller.select(selection())
    await f.controller.check()
    assert.equal(await f.controller.accept(), false)
    assert.equal(f.states.at(-1).status, 'error')
    assert.equal(f.accepted.length, 0)
    f.controller.destroy()
  }
  const inconsistent = fixture({ checkAvailability: async (snapshot) => ({ ...response(snapshot), conflicts: [{ kind: 'consultation', startAt: snapshot.startAt, endAt: snapshot.startAt }] }) })
  inconsistent.controller.select(selection())
  await inconsistent.controller.check()
  assert.equal(inconsistent.states.at(-1).status, 'error')
  assert.equal(await inconsistent.controller.accept(), false)
  inconsistent.controller.destroy()
})

test('mismatched responses fail closed, verification errors are actionable, and unmount ignores late checks', async () => {
  const mismatch = fixture({ checkAvailability: async () => response(selection('04')) })
  mismatch.controller.select(selection())
  await mismatch.controller.check()
  assert.equal(mismatch.states.at(-1).status, 'error')
  assert.equal(await mismatch.controller.accept(), false)
  mismatch.controller.destroy()
  const verification = fixture({ checkAvailability: async () => { throw { response: { status: 403 } } } })
  verification.controller.select(selection())
  await verification.controller.check()
  assert.equal(verification.states.at(-1).statusCode, 403)
  assert.ok(verification.states.at(-1).message.includes('Account settings'))
  verification.controller.destroy()
  const pending = deferred(), unmounted = fixture({ checkAvailability: () => pending.promise })
  unmounted.controller.select(selection())
  const checking = unmounted.controller.check()
  unmounted.controller.destroy()
  const stateCount = unmounted.states.length
  pending.resolve(response(selection()))
  await checking
  assert.equal(unmounted.states.length, stateCount)
})
