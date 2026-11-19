import React, { useEffect, useRef, useState } from 'react'

export default function PatientQrScanner({ onCode, disabled = false }) {
  const video = useRef(null), stream = useRef(null), timer = useRef(null), session = useRef(0)
  const [running, setRunning] = useState(false), [error, setError] = useState('')
  const stop = () => {
    session.current += 1
    clearTimeout(timer.current)
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setRunning(false)
  }
  useEffect(() => () => {
    session.current += 1
    clearTimeout(timer.current)
    stream.current?.getTracks().forEach(track => track.stop())
  }, [])
  const start = async () => {
    setError('')
    if (!globalThis.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera QR scanning is unavailable in this browser. Paste the patient’s manual check-in code below, or use a browser with QR scanning support.')
      return
    }
    const current = ++session.current
    setRunning(true)
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats()
      if (!formats.includes('qr_code')) throw new Error('This browser does not support QR decoding. Use the manual check-in code below.')
      const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] })
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (current !== session.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media
      video.current.srcObject = media
      await video.current.play()
      const scan = async () => {
        if (current !== session.current || !video.current) return
        try {
          if (video.current.readyState >= 2) {
            const codes = await detector.detect(video.current)
            if (current !== session.current) return
            const value = codes.find(code => /^urn:mwos:patient:[0-9a-f-]{36}$/i.test(code.rawValue))?.rawValue
            if (value) { stop(); onCode(value); return }
          }
          timer.current = setTimeout(scan, 300)
        } catch {
          stop(); setError('The camera could not read the code. Try again or paste the manual check-in code below.')
        }
      }
      scan()
    } catch (e) {
      if (current !== session.current) return
      stop()
      setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access or paste the manual code below.' : e.message || 'Unable to open the camera. Use manual entry below.')
    }
  }
  return <div className="space-y-3">
    <div className="flex gap-2">{running ? <button className="btn-secondary" type="button" onClick={stop}>Stop camera</button> : <button className="btn-secondary" type="button" disabled={disabled} onClick={start}>Scan patient QR with camera</button>}</div>
    <video ref={video} muted playsInline aria-label="Patient QR camera preview" className={running ? 'w-full max-w-md rounded-xl bg-slate-900' : 'hidden'} />
    {running && <p role="status" className="text-sm text-slate-500">Point the camera at the MWOS patient QR code. The camera stops after a successful scan.</p>}
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
  </div>
}
