import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import AppIcon from '../common/AppIcon'
import { createDevicePreview, idleDeviceState } from '../../utils/devicePreview'

const DeviceCheck = forwardRef(function DeviceCheck({ sessionKey, stopSignal = 0 }, ref) {
  const videoRef = useRef(null)
  const controllerRef = useRef(null)
  const [state, setState] = useState(idleDeviceState)
  const [level, setLevel] = useState(0)
  useImperativeHandle(ref, () => ({ stop: () => controllerRef.current?.stop() }), [])

  useEffect(() => {
    setState({ ...idleDeviceState })
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const controller = createDevicePreview({
      mediaDevices: navigator.mediaDevices,
      secureContext: window.isSecureContext,
      createAudioContext: AudioContextClass ? () => new AudioContextClass() : null,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      onState: setState,
      onLevel: setLevel,
      onStream: (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream
      },
    })
    controllerRef.current = controller
    const stopOnHide = () => controller.stop()
    window.addEventListener('pagehide', stopOnHide)
    return () => {
      window.removeEventListener('pagehide', stopOnHide)
      controller.destroy()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [sessionKey, stopSignal])

  const ready = state.status === 'ready'
  const pending = state.status === 'pending'
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="telehealth-device-title">
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-rose-700 dark:text-rose-300">Before your call</p><h2 id="telehealth-device-title" className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Camera & microphone check</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Local preview only</span></div>
    <div className="relative flex aspect-video min-h-48 max-h-96 w-full items-center justify-center overflow-hidden bg-slate-950 text-white">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Your local camera preview" className={`absolute inset-0 h-full w-full object-contain ${ready && state.cameraOn ? '' : 'invisible'}`} style={{ transform: 'scaleX(-1)' }} />
      {(!ready || !state.cameraOn) ? <div className="relative px-5 py-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10"><AppIcon name="video" className="h-7 w-7" /></div><p className="mt-3 text-sm font-semibold">{pending ? 'Waiting for your permission' : ready ? state.cameraAvailable ? 'Camera is off' : 'Microphone-only check' : 'Your preview will appear here'}</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-300">{pending ? 'Respond to the camera and microphone prompt in your browser.' : ready ? 'Use the controls below to manage your preview.' : 'Devices stay off until you choose to check them.'}</p></div> : null}
      {ready ? <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-xs">You · Preview</span> : null}
    </div>
    <div className="space-y-4 p-5">
      {state.message ? <p role={state.status === 'error' ? 'alert' : 'status'} className={`text-sm leading-6 ${state.status === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>{state.message}</p> : null}
      {ready && state.microphoneAvailable ? <div><div className="mb-2 flex justify-between gap-3 text-xs text-slate-500"><span>Microphone input</span><span>{!state.microphoneOn ? 'Muted' : state.meterAvailable ? 'Speak to check the level' : 'Input meter unavailable'}</span></div><div role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${level}%` }} /></div></div> : null}
      <div className="flex flex-wrap gap-2">
        {!ready ? <><button type="button" className="btn-primary" disabled={pending} onClick={() => controllerRef.current?.start('both')}>Check camera & microphone</button><button type="button" className="btn-secondary" disabled={pending} onClick={() => controllerRef.current?.start('audio')}>Check microphone only</button></> : <>
          {state.cameraAvailable ? <button type="button" className="btn-secondary" aria-pressed={state.cameraOn} onClick={() => controllerRef.current?.toggle('video')}>{state.cameraOn ? 'Turn camera off' : 'Turn camera on'}</button> : null}
          {state.microphoneAvailable ? <button type="button" className="btn-secondary" aria-pressed={state.microphoneOn} onClick={() => controllerRef.current?.toggle('audio')}>{state.microphoneOn ? 'Mute microphone' : 'Unmute microphone'}</button> : null}
        </>}
        {ready || pending ? <button type="button" className="btn-secondary" onClick={() => controllerRef.current?.stop()}>{pending ? 'Cancel device check' : 'Stop devices'}</button> : null}
      </div>
      <p className="text-xs leading-5 text-slate-500">This check stays on your device. MWOS does not record or upload this preview. Joining Google Meet opens the actual call separately.</p>
    </div>
  </section>
})

export default DeviceCheck
