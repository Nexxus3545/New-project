import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../../utils/api'
import { canJoinTelehealth } from '../../utils/telehealthMeeting'
import EmbeddedCall from './EmbeddedCall'

function localDateTime(value) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function ConsultationVideo({ session, user, onUpdated, onJoin, onActiveChange }) {
  const [startAt, setStartAt] = useState(localDateTime(session?.start_at))
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const status = session?.status || 'requested'
  const manageable = Boolean(session?.id) && (user?.role === 'admin' || (['doctor', 'midwife'].includes(user?.role) && session.clinician_id === user.id))
  const update = useMutation({
    mutationFn: (payload) => api.patch(`/interactions/teleconsults/${session.id}`, payload).then((response) => response.data.data),
    onSuccess: (saved) => { setNotice('Consultation details saved.'); onUpdated?.(saved) },
  })
  const changeStatus = (nextStatus) => {
    setFormError(''); setNotice(''); update.reset()
    const payload = { status: nextStatus }
    if (nextStatus === 'scheduled') {
      const date = new Date(startAt)
      if (!startAt || !Number.isFinite(date.getTime())) { setFormError('Choose the consultation date and time.'); return }
      payload.startAt = date.toISOString()
    }
    update.mutate(payload)
  }
  return <section className="rounded-2xl border border-rose-100 bg-rose-50/60 p-5 dark:border-rose-900/40 dark:bg-rose-950/20" aria-labelledby="video-consultation-title">
    <h3 id="video-consultation-title" className="font-semibold text-slate-900 dark:text-slate-100">Live video consultation</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Talk with your care team right here in MWOS. Your private video room is prepared when you join, with camera and microphone controls inside the call.</p>
    <div className="mt-4"><EmbeddedCall sessionId={session?.id} enabled={canJoinTelehealth(session)} onBeforeJoin={onJoin} onActiveChange={onActiveChange} /></div>
    {['completed', 'cancelled'].includes(status) ? <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">This consultation is closed.</p> : null}
    {manageable && !['completed', 'cancelled'].includes(status) ? <div className="mt-5 border-t border-rose-100 pt-5 dark:border-rose-900/40">
      <h4 className="text-sm font-semibold">Clinic meeting controls</h4>
      <p className="mt-2 text-xs leading-5 text-slate-500">Requires verified staff credentials and additional sign-in verification in Account settings. Only the assigned patient and care team can enter the private room.</p>
      {['requested', 'scheduled'].includes(status) ? <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); changeStatus('scheduled') }}>
        <div><label htmlFor="consultation-schedule" className="label">Confirmed date and time</label><input id="consultation-schedule" type="datetime-local" className="input" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /><p className="mt-1 text-xs text-slate-500">Shown in your device's local time.</p></div>
        <button type="submit" className="btn-primary" disabled={update.isPending}>{update.isPending ? 'Saving...' : status === 'scheduled' ? 'Save meeting details' : 'Confirm consultation'}</button>
      </form> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {status === 'scheduled' ? <button type="button" className="btn-secondary" disabled={update.isPending} onClick={() => changeStatus('active')}>Mark consultation in progress</button> : null}
        {status === 'active' ? <button type="button" className="btn-secondary" disabled={update.isPending} onClick={() => changeStatus('completed')}>Complete consultation</button> : <button type="button" className="btn-secondary" disabled={update.isPending} onClick={() => changeStatus('cancelled')}>Cancel consultation</button>}
      </div>
    </div> : null}
    {formError || update.isError ? <div role="alert" className="alert-critical mt-4"><span>{formError || update.error.response?.data?.message || 'The consultation could not be updated. Please try again.'}</span>{update.error?.response?.status === 403 ? <Link to={user?.role === 'patient' ? '/my/settings' : '/settings'} className="underline">Open Account settings</Link> : null}</div> : null}
    {notice ? <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">{notice}</p> : null}
  </section>
}
