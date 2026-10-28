export const REVIEW_CHECK_FRESH_MS = 60_000
export const REVIEW_DURATIONS = [15, 30, 45, 60]

export const reviewSelectionKey = (selection) => selection ? `${selection.sessionId}|${selection.startAt}|${selection.durationMinutes}` : ''
export function makeReviewSelection(sessionId, localStart, durationMinutes) {
  const parsed = new Date(localStart)
  const duration = Number(durationMinutes)
  if (!sessionId || !localStart || !Number.isFinite(parsed.getTime()) || !REVIEW_DURATIONS.includes(duration)) return null
  return { sessionId, startAt: parsed.toISOString(), durationMinutes: duration }
}
export function reviewLocalDateTime(value) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
export function formatReviewTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'No preferred time provided'
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const safeError = (error, accepting) => {
  const statusCode = error?.response?.status
  if (statusCode === 403) return { statusCode, message: 'Additional account verification is required. Open Account settings, then check availability again.' }
  if (statusCode === 409) return { statusCode, message: 'This request or time slot is no longer available. Refresh the requests and check another time.' }
  return { statusCode, message: accepting ? 'The consultation could not be accepted. Check availability again before retrying.' : 'Availability could not be checked. Please try again.' }
}

// An availability result belongs to one exact selection for at most one minute.
// Acceptance is still verified atomically by the server.
export function createConsultationReview({ checkAvailability, acceptConsultation, onState, onAccepted, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let selection = null, generation = 0, abort = null, timer = null, destroyed = false
  let state = { status: 'idle', selectionKey: '', available: false, conflicts: [] }
  const publish = (next) => { state = next; if (!destroyed) onState?.(state) }
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null }
  const select = (next) => {
    if (destroyed || state.status === 'accepting') return false
    generation++
    abort?.abort(); abort = null
    clearTimer()
    selection = next ? { ...next } : null
    publish({ status: 'idle', selectionKey: reviewSelectionKey(selection), available: false, conflicts: [] })
    return true
  }
  async function check() {
    if (destroyed || !selection || ['checking', 'accepting'].includes(state.status)) return
    const snapshot = { ...selection }, key = reviewSelectionKey(snapshot), requestGeneration = ++generation
    abort?.abort(); abort = new AbortController()
    clearTimer()
    publish({ status: 'checking', selectionKey: key, available: false, conflicts: [] })
    try {
      const result = await checkAvailability(snapshot, { signal: abort.signal })
      if (destroyed || requestGeneration !== generation || key !== reviewSelectionKey(selection)) return
      if (typeof result?.available !== 'boolean' || result.startAt !== snapshot.startAt || Number(result.durationMinutes) !== snapshot.durationMinutes || !Array.isArray(result.conflicts) || (result.available && result.conflicts.length)) throw new Error('Invalid availability response')
      const checkedAt = now()
      publish({ status: result.available ? 'available' : 'busy', selectionKey: key, available: result.available, checkedAt, conflicts: result.conflicts.map(({ kind, startAt, endAt }) => ({ kind, startAt, endAt })) })
      if (result.available) timer = schedule(() => {
        timer = null
        if (!destroyed && requestGeneration === generation && state.status === 'available') publish({ status: 'stale', selectionKey: key, available: false, conflicts: [] })
      }, REVIEW_CHECK_FRESH_MS)
    } catch (error) {
      if (!destroyed && requestGeneration === generation) publish({ status: 'error', selectionKey: key, available: false, conflicts: [], ...safeError(error, false) })
    }
  }
  async function accept() {
    const key = reviewSelectionKey(selection)
    if (destroyed || !selection || state.status !== 'available' || !state.available || state.selectionKey !== key || now() - state.checkedAt >= REVIEW_CHECK_FRESH_MS) {
      if (!destroyed && state.status === 'available') publish({ status: 'stale', selectionKey: key, available: false, conflicts: [] })
      return false
    }
    const snapshot = { ...selection }, requestGeneration = ++generation
    clearTimer()
    abort = new AbortController()
    publish({ status: 'accepting', selectionKey: key, available: false, conflicts: [] })
    try {
      const saved = await acceptConsultation(snapshot, { signal: abort.signal })
      if (destroyed || requestGeneration !== generation) return false
      if (!saved || typeof saved !== 'object' || saved.id !== snapshot.sessionId || saved.status !== 'scheduled'
          || Date.parse(saved.start_at) !== Date.parse(snapshot.startAt) || Number(saved.duration_minutes) !== snapshot.durationMinutes) throw new Error('Invalid acceptance response')
      publish({ status: 'accepted', selectionKey: key, available: false, conflicts: [] })
      try { onAccepted?.(saved) } catch { /* Consumer callbacks cannot turn confirmed acceptance into a reported API failure. */ }
      return true
    } catch (error) {
      if (!destroyed && requestGeneration === generation) publish({ status: 'error', selectionKey: key, available: false, conflicts: [], ...safeError(error, true) })
      return false
    }
  }
  const destroy = () => { destroyed = true; generation++; abort?.abort(); clearTimer() }
  return { select, check, accept, destroy }
}
