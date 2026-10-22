const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const sessionStorageIfAvailable = () => {
  try { return globalThis.sessionStorage } catch { return undefined }
}

export function createTransportSubmission({
  userId,
  post,
  storage = sessionStorageIfAvailable(),
  createId = () => globalThis.crypto.randomUUID(),
}) {
  const key = `mwos:transport-request:${userId}`
  let requestId = null
  try {
    const saved = storage?.getItem(key)
    if (uuidPattern.test(saved || '')) requestId = saved
  } catch {}
  let pending = null
  let receipt = null
  let originalPayload = null

  return {
    getRequestId: () => requestId,
    hasSubmitted: () => Boolean(originalPayload),
    submit(payload) {
      if (receipt) return Promise.resolve(receipt)
      if (pending) return pending
      requestId ||= createId()
      originalPayload ||= { ...payload }
      // Persist only the opaque reference, never symptoms, location, or contact details.
      try { storage?.setItem(key, requestId) } catch {}
      pending = Promise.resolve()
        .then(() => post('/interactions/threads', { ...originalPayload, clientRequestId: requestId }))
        .then((response) => {
          const result = response.data?.data
          if (!result?.id || result.id.toLowerCase() !== requestId.toLowerCase()) {
            throw new Error('We could not confirm the request reference. Check Messages before trying again.')
          }
          receipt = result
          return result
        })
        .finally(() => { pending = null })
      return pending
    },
    reset() {
      if (pending) return false
      receipt = null
      requestId = null
      originalPayload = null
      try { storage?.removeItem(key) } catch {}
      return true
    },
  }
}
