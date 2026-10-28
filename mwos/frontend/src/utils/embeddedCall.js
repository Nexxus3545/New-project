// Daily allows one call instance by default. A new screen must wait until a
// departing screen has released its iframe, microphone, and camera resources.
let frameDisposal = Promise.resolve()
let activeOwner = null

const quietly = (callback) => {
  try { callback?.() } catch { /* Consumer callbacks must not prevent cleanup. */ }
}

export function validateEmbeddedAccess(access, now = Date.now()) {
  if (access?.provider !== 'daily' || typeof access.roomUrl !== 'string') throw new Error('Invalid video access')
  const room = new URL(access.roomUrl)
  if (room.protocol !== 'https:' || room.username || room.password || room.port || room.search || room.hash
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.daily\.co$/.test(room.hostname)
      || !/^\/[A-Za-z0-9_-]{8,128}$/.test(room.pathname)
      || room.href !== access.roomUrl) throw new Error('Invalid video access')
  if (typeof access.token !== 'string' || !access.token || access.token.length > 8192 || /\s/.test(access.token)) throw new Error('Invalid video access')
  if (typeof access.expiresAt !== 'string' || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= now) throw new Error('Expired video access')
  return { roomUrl: room.href, token: access.token }
}

function accessError(error) {
  const status = error?.response?.status
  if (status === 401) return 'Please sign in again before joining the consultation.'
  if (status === 403) return 'Your account cannot join this consultation. Contact the clinic care team.'
  if (status === 404 || status === 409 || status === 410) return 'This video consultation is not available to join. Refresh the consultation or contact the clinic.'
  if (status === 503) return 'Video consultations are temporarily unavailable. Please try again shortly.'
  return 'The video call could not connect. Check your connection and try again.'
}

/** Owns one local call. Credentials remain in the join closure, never UI state. */
export function createEmbeddedCall({ container, requestAccess, loadDaily, onState, onBeforeJoin, onLeave, onActiveChange }) {
  let current = null
  let generation = 0
  let destroyed = false
  let localDisposal = Promise.resolve()
  const owner = Symbol('embedded-call')
  const isCurrent = (attempt) => !destroyed && current === attempt && generation === attempt.id
  const publish = (state) => { if (!destroyed) quietly(() => onState?.(state)) }
  const activate = () => { activeOwner = owner; quietly(() => onActiveChange?.(true)) }
  const deactivate = () => {
    if (activeOwner !== owner) return
    activeOwner = null
    quietly(() => onActiveChange?.(false))
  }

  function dispose(attempt) {
    attempt?.abort.abort()
    const frame = attempt?.frame
    if (!frame) return localDisposal
    attempt.frame = null
    for (const [event, handler] of attempt.handlers) {
      try { frame.off(event, handler) } catch { /* It may already be destroyed. */ }
    }
    let iframe
    try { iframe = frame.iframe?.() } catch { /* No iframe was created. */ }
    // destroy() automatically leaves an active meeting and releases its tracks.
    // Always invoke it, even when join failed or the SDK emitted left-meeting.
    let disposal
    try { disposal = Promise.resolve(frame.destroy()) } catch { disposal = Promise.resolve() }
    disposal = disposal.catch(() => {}).finally(() => { try { iframe?.remove() } catch { /* Detached already. */ } })
    localDisposal = Promise.all([localDisposal, disposal]).then(() => {})
    frameDisposal = Promise.all([frameDisposal, localDisposal]).then(() => {})
    return localDisposal
  }

  function finish(attempt, state, notifyLeave = false) {
    if (!isCurrent(attempt)) return Promise.resolve()
    current = null
    const endedGeneration = ++generation
    const disposal = dispose(attempt)
    publish(state)
    if (notifyLeave) quietly(onLeave)
    return disposal.then(() => { if (generation === endedGeneration) deactivate() })
  }

  async function join() {
    if (destroyed || current) return false
    const attempt = { id: ++generation, abort: new AbortController(), frame: null, handlers: [] }
    current = attempt
    try {
      // This runs before any asynchronous operation or provider device access.
      onBeforeJoin?.()
      activate()
      publish({ status: 'requesting', warning: '' })
      const response = await requestAccess({ signal: attempt.abort.signal })
      if (!isCurrent(attempt)) return false
      const access = validateEmbeddedAccess(response)
      const sdk = await loadDaily()
      if (!isCurrent(attempt)) return false
      await frameDisposal
      if (!isCurrent(attempt)) return false
      const daily = sdk.default || sdk
      const frame = daily.createFrame(container, {
        iframeStyle: { width: '100%', height: '100%', border: '0' },
        showLeaveButton: true,
        showFullscreenButton: true,
      })
      attempt.frame = frame
      const listen = (event, handler) => {
        const guarded = (data) => { if (isCurrent(attempt)) handler(data) }
        attempt.handlers.push([event, guarded])
        frame.on(event, guarded)
      }
      listen('loaded', () => publish({ status: 'prejoin', warning: '' }))
      listen('joining-meeting', () => publish({ status: 'connecting', warning: '' }))
      listen('joined-meeting', () => {
        attempt.joined = true
        publish({ status: 'joined', warning: '' })
      })
      listen('left-meeting', () => { void finish(attempt, { status: 'left', warning: '' }, true) })
      listen('error', () => { void finish(attempt, { status: 'error', message: accessError(), warning: '' }) })
      listen('camera-error', () => publish({
        status: attempt.joined ? 'joined' : 'prejoin',
        warning: 'Camera or microphone access needs attention. Check your browser permissions and device settings inside the call.',
      }))
      // Track only the local joined event, never infer attendance from a
      // consultation's administrative status or from join() resolving.
      try { frame.iframe()?.setAttribute('title', 'MWOS private video consultation') } catch { /* The SDK may attach it later. */ }
      publish({ status: 'prejoin', warning: '' })
      await frame.join({ url: access.roomUrl, token: access.token })
      return isCurrent(attempt)
    } catch (error) {
      if (isCurrent(attempt)) await finish(attempt, { status: 'error', message: accessError(error), warning: '' })
      return false
    }
  }

  function leave() {
    if (!current) return Promise.resolve()
    return finish(current, { status: 'left', warning: '' }, true)
  }

  function destroy() {
    if (destroyed) return Promise.resolve()
    destroyed = true
    generation += 1
    const attempt = current
    current = null
    return dispose(attempt).then(deactivate)
  }

  return { join, leave, destroy }
}
