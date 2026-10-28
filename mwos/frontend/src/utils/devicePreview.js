export const idleDeviceState = {
  status: 'idle', cameraAvailable: false, microphoneAvailable: false,
  cameraOn: false, microphoneOn: false, meterAvailable: false, message: '',
}

export const deviceErrorMessage = (error) => {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) return 'Camera or microphone access was blocked. Allow access in your browser settings, then try again.'
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(error?.name)) return 'A camera or microphone could not be found. Connect your device, or try the microphone-only check.'
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error?.name)) return 'Your device could not start. Close other apps using the camera or microphone, then try again.'
  return 'The device check could not start. Check your browser and device settings, then try again.'
}

// Keeps every acquired track local and releases late permission responses after a stop/unmount.
export function createDevicePreview({ mediaDevices, secureContext, createAudioContext, requestFrame, cancelFrame, onState, onStream, onLevel }) {
  let generation = 0, destroyed = false, stream = null, audioContext = null, frame = null
  let state = { ...idleDeviceState }
  let endedListeners = []
  const publish = (next) => { state = { ...state, ...next }; if (!destroyed) onState(state) }
  const release = () => {
    if (frame !== null) cancelFrame(frame)
    frame = null
    endedListeners.forEach(([track, listener]) => track.removeEventListener('ended', listener))
    endedListeners = []
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (audioContext) { try { Promise.resolve(audioContext.close()).catch(() => {}) } catch {} }
    audioContext = null
    onStream(null)
    onLevel(0)
  }
  const stop = (message = '') => {
    generation += 1
    release()
    publish({ ...idleDeviceState, message })
  }
  const startMeter = (currentStream, requestGeneration) => {
    if (!createAudioContext || !currentStream.getAudioTracks().length) return false
    try {
      audioContext = createAudioContext()
      const source = audioContext.createMediaStreamSource(currentStream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      // No connection to destination: this measures input without playing microphone audio.
      Promise.resolve(audioContext.resume()).catch(() => {})
      const samples = new Uint8Array(analyser.fftSize)
      let lastUpdate = -Infinity
      const measure = (timestamp) => {
        if (destroyed || generation !== requestGeneration || !stream) return
        if (timestamp - lastUpdate >= 100) {
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) sum += ((sample - 128) / 128) ** 2
          onLevel(state.microphoneOn ? Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 220)) : 0)
          lastUpdate = timestamp
        }
        frame = requestFrame(measure)
      }
      frame = requestFrame(measure)
      return true
    } catch {
      if (audioContext) { try { Promise.resolve(audioContext.close()).catch(() => {}) } catch {} }
      audioContext = null
      return false
    }
  }
  const start = async (mode = 'both') => {
    if (destroyed) return
    stop()
    if (!secureContext) { publish({ status: 'error', message: 'Device access needs HTTPS. Open the secure MWOS website to check your camera and microphone.' }); return }
    if (typeof mediaDevices?.getUserMedia !== 'function') { publish({ status: 'error', message: 'This browser cannot access camera and microphone devices. Try a current browser or open MWOS outside an embedded browser.' }); return }
    const requestGeneration = generation
    publish({ status: 'pending', message: 'Waiting for browser permission. Choose Allow to test your devices.' })
    try {
      const acquired = await mediaDevices.getUserMedia({ video: mode === 'audio' ? false : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      if (destroyed || generation !== requestGeneration) { acquired.getTracks().forEach((track) => track.stop()); return }
      stream = acquired
      for (const track of stream.getTracks()) {
        const listener = () => stop('A device disconnected or permission ended. Run the check again when ready.')
        track.addEventListener('ended', listener)
        endedListeners.push([track, listener])
      }
      const cameraAvailable = stream.getVideoTracks().some((track) => track.readyState !== 'ended')
      const microphoneAvailable = stream.getAudioTracks().some((track) => track.readyState !== 'ended')
      publish({ status: 'ready', cameraAvailable, microphoneAvailable, cameraOn: cameraAvailable, microphoneOn: microphoneAvailable, message: 'Local device preview is on. You have not joined a call.' })
      onStream(stream)
      publish({ meterAvailable: startMeter(stream, requestGeneration) })
    } catch (error) {
      if (destroyed || generation !== requestGeneration) return
      release()
      publish({ ...idleDeviceState, status: 'error', message: deviceErrorMessage(error) })
    }
  }
  const toggle = (kind) => {
    if (!stream || state.status !== 'ready') return
    const tracks = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks()
    if (!tracks.length) return
    const nextEnabled = !tracks.some((track) => track.enabled)
    tracks.forEach((track) => { track.enabled = nextEnabled })
    publish(kind === 'video' ? { cameraOn: nextEnabled } : { microphoneOn: nextEnabled })
    if (kind === 'audio' && !nextEnabled) onLevel(0)
  }
  return { start, stop, toggle, destroy() { if (destroyed) return; generation += 1; release(); destroyed = true } }
}
