import React, { useEffect, useRef, useState } from 'react'
import api from '../../utils/api'
import { createEmbeddedCall } from '../../utils/embeddedCall'

const statuses = {
  idle: 'Ready for your private video consultation',
  requesting: 'Preparing your secure call…',
  prejoin: 'Check your devices, then join inside the call below.',
  connecting: 'Connecting to the consultation…',
  joined: 'In call',
  left: 'You have left the video call.',
  error: 'Unable to join the video call',
}

export default function EmbeddedCall({ sessionId, enabled = true, onBeforeJoin, onLeave, onActiveChange }) {
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
  const callbacks = useRef({ onBeforeJoin, onLeave, onActiveChange })
  callbacks.current = { onBeforeJoin, onLeave, onActiveChange }
  const [state, setState] = useState({ status: 'idle', warning: '' })
  const busy = ['requesting', 'prejoin', 'connecting', 'joined'].includes(state.status)
  const showFrame = ['prejoin', 'connecting', 'joined'].includes(state.status)

  useEffect(() => {
    setState({ status: 'idle', warning: '' })
    if (!enabled || !sessionId) return
    const controller = createEmbeddedCall({
      container: containerRef.current,
      requestAccess: async ({ signal }) => {
        const response = await api.post(`/interactions/teleconsults/${encodeURIComponent(sessionId)}/video/join`, {}, { signal })
        return response.data.data
      },
      loadDaily: () => import('@daily-co/daily-js'),
      onState: setState,
      onBeforeJoin: () => callbacks.current.onBeforeJoin?.(),
      onLeave: () => callbacks.current.onLeave?.(),
      onActiveChange: (active) => callbacks.current.onActiveChange?.(active),
    })
    controllerRef.current = controller
    return () => {
      controllerRef.current = null
      void controller.destroy()
    }
  }, [sessionId, enabled])

  const join = () => {
    if (!enabled || busy) return
    void controllerRef.current?.join()
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-rose-100 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label="Private video consultation">
      <div className="flex flex-col items-stretch gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-semibold text-slate-900 dark:text-white">Video consultation</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
            {!enabled ? 'Video is available once the clinic schedules this consultation.' : statuses[state.status]}
          </p>
        </div>
        {busy ? (
          <button type="button" className="btn-secondary w-full shrink-0 sm:w-auto" onClick={() => { void controllerRef.current?.leave() }}>
            {state.status === 'joined' ? 'Leave call' : 'Cancel joining'}
          </button>
        ) : (
          <button type="button" className="btn-primary w-full shrink-0 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50" disabled={!enabled || !sessionId} onClick={join}>
            {state.status === 'error' ? 'Try joining again' : state.status === 'left' ? 'Rejoin video consultation' : 'Join video consultation'}
          </button>
        )}
      </div>
      {state.status === 'error' && (
        <p role="alert" className="mx-5 mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">{state.message}</p>
      )}
      {state.warning && (
        <p role="alert" className="mx-5 mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{state.warning}</p>
      )}
      <div
        ref={containerRef}
        className={`w-full min-w-0 overflow-hidden bg-slate-950 ${showFrame ? '' : 'hidden'}`}
        style={{ height: 'min(72vh, 760px)', minHeight: 420 }}
      />
      {!busy && (
        <p className="border-t border-rose-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Stay here in MWOS for your call. You control when to enable your camera and microphone in the call. Leaving the call does not complete the consultation.
        </p>
      )}
    </section>
  )
}
