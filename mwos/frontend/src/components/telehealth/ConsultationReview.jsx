import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { createConsultationReview, formatReviewTime, makeReviewSelection, REVIEW_DURATIONS, reviewLocalDateTime, reviewSelectionKey } from '../../utils/consultationReview'

export default function ConsultationReview({ onAccepted }) {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin')
  const queryClient = useQueryClient()
  const acceptedRef = useRef(onAccepted)
  acceptedRef.current = onAccepted
  const controllerRef = useRef(null)
  const [selectedId, setSelectedId] = useState('')
  const [start, setStart] = useState('')
  const [duration, setDuration] = useState(30)
  const [review, setReview] = useState({ status: 'idle', available: false, conflicts: [] })
  const [notice, setNotice] = useState('')
  const requestQuery = useQuery({
    queryKey: ['telehealth-review'], enabled: isAdmin, refetchInterval: 15000,
    queryFn: () => api.get('/interactions/teleconsults/review').then((response) => response.data.data),
  })
  const requests = requestQuery.data || []
  const selected = requests.find((request) => request.id === selectedId)
  const pending = requests.filter((request) => request.status === 'requested')
  const editable = selected?.status === 'requested'
  const accepting = review.status === 'accepting'
  const selection = useMemo(() => editable ? makeReviewSelection(selectedId, start, duration) : null, [editable, selectedId, start, duration])
  const selectionKey = reviewSelectionKey(selection)
  const canAccept = editable && review.status === 'available' && review.available && review.selectionKey === selectionKey
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone'

  useEffect(() => {
    if (!isAdmin) return
    const controller = createConsultationReview({
      checkAvailability: ({ sessionId, startAt, durationMinutes }, config) => api.get(`/interactions/teleconsults/${encodeURIComponent(sessionId)}/availability`, { ...config, params: { startAt, durationMinutes } }).then((response) => response.data.data),
      acceptConsultation: ({ sessionId, startAt, durationMinutes }, config) => api.post(`/interactions/teleconsults/${encodeURIComponent(sessionId)}/accept`, { startAt, durationMinutes }, config).then((response) => response.data.data),
      onState: setReview,
      onAccepted: (saved) => {
        setNotice('Consultation accepted. The patient and care team can use the confirmed schedule in MWOS.')
        queryClient.setQueryData(['telehealth-review'], (current) => (current || []).map((request) => request.id === saved.id ? { ...request, ...saved } : request))
        for (const queryKey of [['telehealth-review'], ['telehealth-threads'], ['telehealth-thread'], ['notifications']]) queryClient.invalidateQueries({ queryKey })
        acceptedRef.current?.(saved)
      },
    })
    controllerRef.current = controller
    return () => { controllerRef.current = null; controller.destroy() }
  }, [isAdmin, queryClient])

  useEffect(() => {
    if (accepting) return
    if (requests.length && !requests.some((request) => request.id === selectedId)) setSelectedId((pending[0] || requests[0]).id)
    if (!requests.length) setSelectedId('')
  }, [requests, selectedId, accepting])
  useEffect(() => {
    setStart(reviewLocalDateTime(selected?.preferred_start_at || selected?.start_at))
    setDuration(REVIEW_DURATIONS.includes(Number(selected?.duration_minutes)) ? Number(selected.duration_minutes) : 30)
    setNotice('')
  }, [selectedId])
  useEffect(() => { controllerRef.current?.select(selection) }, [selectionKey, isAdmin])
  if (!isAdmin) return null

  const check = () => { controllerRef.current?.select(selection); void controllerRef.current?.check() }
  const refresh = () => { setNotice(''); void requestQuery.refetch() }
  const errorSettings = review.statusCode === 403 || requestQuery.error?.response?.status === 403

  return <section className="card min-w-0" aria-labelledby="consultation-review-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="section-kicker">Admin approval</p><h2 id="consultation-review-title" className="mt-1 text-xl font-semibold">Review consultation requests</h2><p className="mt-2 text-sm text-slate-500">Check the care team's calendar before confirming a patient's preferred schedule.</p></div>
      <button type="button" className="btn-secondary" disabled={requestQuery.isFetching || accepting} onClick={refresh}>Refresh requests</button>
    </div>
    {notice ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p> : null}
    {requestQuery.isLoading ? <p role="status" className="py-6 text-sm text-slate-500">Loading consultation requests…</p> : null}
    {requestQuery.isError ? <div role="alert" className="alert-warning mt-4">Consultation requests could not refresh. Please try again.</div> : null}
    {!requestQuery.isLoading && !requestQuery.isError && !requests.length ? <p className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No consultation requests to review.</p> : null}
    {requests.length ? <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(13rem,0.8fr),minmax(0,1.5fr)]">
      <div className="min-w-0 space-y-2" aria-label="Consultation review queue">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{pending.length} awaiting review · {requests.length - pending.length} confirmed</p>
        {requests.map((request) => <button type="button" key={request.id} disabled={accepting} onClick={() => setSelectedId(request.id)} aria-pressed={selectedId === request.id} className={`w-full min-w-0 rounded-xl border p-3 text-left ${selectedId === request.id ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <span className="block break-words font-semibold">{request.patient_name || 'Patient consultation'}</span>
          <span className="mt-1 block text-xs capitalize text-slate-500">{request.status === 'requested' ? 'Awaiting review' : request.status === 'active' ? 'In progress' : 'Confirmed'}</span>
          <span className="mt-1 block text-xs text-slate-500">{formatReviewTime(request.status === 'requested' ? request.preferred_start_at : request.start_at)} · Manila time</span>
        </button>)}
      </div>
      {selected ? <div className="min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-slate-700">
        <h3 className="break-words font-semibold">{selected.patient_name || 'Patient consultation'}</h3>
        <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Care provider</dt><dd className="mt-1 break-words">{selected.clinician_name || 'Assigned care team'}</dd></div>
          <div><dt className="text-slate-500">Requested duration</dt><dd className="mt-1">{Number(selected.duration_minutes) || 30} minutes</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Patient preferred schedule</dt><dd className="mt-1">{formatReviewTime(selected.preferred_start_at)}{selected.preferred_start_at ? ' · Asia/Manila' : ''}</dd></div>
          {selected.start_at ? <div className="sm:col-span-2"><dt className="text-slate-500">Confirmed schedule</dt><dd className="mt-1">{formatReviewTime(selected.start_at)} · Asia/Manila</dd></div> : null}
          <div className="sm:col-span-2"><dt className="text-slate-500">Concern</dt><dd className="mt-1 whitespace-pre-wrap break-words">{selected.reason || 'No concern provided.'}</dd></div>
        </dl>
        {editable ? <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
          <label htmlFor="review-confirmed-time" className="label">Choose confirmed date and time</label>
          <input id="review-confirmed-time" type="datetime-local" className="input min-w-0" value={start} disabled={accepting} onChange={(event) => { setStart(event.target.value); setNotice('') }} />
          <p className="mt-1 text-xs text-slate-500">Enter time in your device's time zone: {deviceZone}. Schedule summaries use Asia/Manila.</p>
          <label htmlFor="review-duration" className="label mt-4">Confirmed duration</label>
          <select id="review-duration" className="input" value={duration} disabled={accepting} onChange={(event) => { setDuration(Number(event.target.value)); setNotice('') }}>{REVIEW_DURATIONS.map((value) => <option value={value} key={value}>{value} minutes</option>)}</select>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" className="btn-secondary" disabled={!selection || accepting || review.status === 'checking'} onClick={check}>{review.status === 'checking' ? 'Checking availability…' : 'Check availability'}</button>
            <button type="button" className="btn-primary" disabled={!canAccept || accepting} onClick={() => { void controllerRef.current?.accept() }}>{accepting ? 'Accepting consultation…' : 'Accept consultation'}</button>
          </div>
          {review.status === 'available' && review.selectionKey === selectionKey ? <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">This time is available. Availability will be checked again when you accept.</p> : null}
          {review.status === 'stale' ? <p role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-200">Availability has expired. Check availability again before accepting.</p> : null}
          {review.status === 'busy' && review.selectionKey === selectionKey ? <div role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">This time overlaps an existing booking. Choose another time.</p><ul className="mt-2 space-y-2">{review.conflicts.map((conflict, index) => <li key={index}>{conflict.kind === 'appointment' ? 'Appointment' : 'Consultation'}: {formatReviewTime(conflict.startAt)} – {formatReviewTime(conflict.endAt)} · Manila time</li>)}</ul></div> : null}
          {review.status === 'error' ? <p role="alert" className="alert-warning mt-4">{review.message}</p> : null}
        </div> : <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">This consultation is confirmed. The patient and assigned care team can access it in Telehealth.</p>}
      </div> : null}
    </div> : null}
    {errorSettings ? <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-rose-700 underline dark:text-rose-300">Open Account settings</Link> : null}
  </section>
}
