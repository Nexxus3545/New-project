import api from './api'

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024
const MAX_RETRIES = 4
const RESUME_PREFIX = 'mwos-upload-session:'

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const waitForOnline = async () => {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return

  await new Promise((resolve) => {
    const resume = () => {
      window.removeEventListener('online', resume)
      resolve()
    }

    window.addEventListener('online', resume, { once: true })
  })
}

const buildResumeKey = ({ targetType, file }) => (
  `${RESUME_PREFIX}${targetType}:${file.name}:${file.size}:${file.lastModified}`
)

const saveSessionState = (resumeKey, session) => {
  localStorage.setItem(resumeKey, JSON.stringify({ sessionId: session.id }))
}

const loadSessionState = (resumeKey) => {
  try {
    return JSON.parse(localStorage.getItem(resumeKey) || 'null')
  } catch {
    return null
  }
}

const clearSessionState = (resumeKey) => {
  localStorage.removeItem(resumeKey)
}

const withRetryingChunk = async (sessionId, chunkIndex, chunkBlob, onStatus) => {
  let attempt = 0

  while (attempt < MAX_RETRIES) {
    try {
      await waitForOnline()
      onStatus?.(`Uploading chunk ${chunkIndex + 1}`)
      const response = await api.put(`/uploads/sessions/${sessionId}/chunks/${chunkIndex}`, chunkBlob, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      return response.data.data
    } catch (error) {
      attempt += 1
      const retryable = !error.response || error.code === 'ECONNABORTED'
      if (!retryable || attempt >= MAX_RETRIES) {
        throw error
      }
      onStatus?.(`Connection interrupted. Resuming chunk ${chunkIndex + 1}...`)
      await delay(700 * attempt)
    }
  }

  throw new Error('Chunk upload failed unexpectedly')
}

const createSession = async ({ targetType, file, chunkSize, fields }) => {
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const response = await api.post('/uploads/sessions', {
    targetType,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    totalSize: file.size,
    totalChunks,
    chunkSize,
    ...fields,
  })

  return response.data.data
}

const loadRemoteSession = async (sessionId) => {
  const response = await api.get(`/uploads/sessions/${sessionId}`)
  return response.data.data
}

export async function uploadResumableFile({
  targetType,
  file,
  fields = {},
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  onStatus,
}) {
  if (!file) throw new Error('A file is required for resumable upload')

  const resumeKey = buildResumeKey({ targetType, file })
  const saved = loadSessionState(resumeKey)
  let session

  if (saved?.sessionId) {
    try {
      session = await loadRemoteSession(saved.sessionId)
      onStatus?.('Recovered a saved upload session.')
    } catch {
      clearSessionState(resumeKey)
    }
  }

  if (!session) {
    session = await createSession({ targetType, file, chunkSize, fields })
    saveSessionState(resumeKey, session)
    onStatus?.('Upload session prepared.')
  }

  const effectiveChunkSize = session.chunk_size || chunkSize

  onProgress?.({
    progress: session.progress || 0,
    uploadedChunks: session.uploaded_chunks || 0,
    totalChunks: session.total_chunks,
  })

  const uploadedSet = new Set(session.received_chunks || [])

  for (let chunkIndex = 0; chunkIndex < session.total_chunks; chunkIndex += 1) {
    if (uploadedSet.has(chunkIndex)) continue

    const start = chunkIndex * effectiveChunkSize
    const end = Math.min(start + effectiveChunkSize, file.size)
    const chunkBlob = file.slice(start, end)
    session = await withRetryingChunk(session.id, chunkIndex, chunkBlob, onStatus)
    saveSessionState(resumeKey, session)

    onProgress?.({
      progress: session.progress,
      uploadedChunks: session.uploaded_chunks,
      totalChunks: session.total_chunks,
    })
  }

  onStatus?.('Finalizing upload...')
  const completion = await api.post(`/uploads/sessions/${session.id}/complete`)
  clearSessionState(resumeKey)
  onProgress?.({ progress: 100, uploadedChunks: session.total_chunks, totalChunks: session.total_chunks })
  onStatus?.('Upload completed.')

  return completion.data.data
}
