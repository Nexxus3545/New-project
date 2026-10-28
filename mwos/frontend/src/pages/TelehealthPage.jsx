import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'
import DeviceCheck from '../components/telehealth/DeviceCheck'
import ConsultationVideo from '../components/telehealth/ConsultationVideo'

const SESSION_FILTERS = [
  ['all', 'All sessions'],
  ['requested', 'Requested'],
  ['scheduled', 'Scheduled'],
  ['active', 'In progress'],
  ['completed', 'Completed'],
]

const emptyRequest = { title: '', patientId: '', clinicianId: '', reason: '', startAt: '' }

const roleLabel = (value) => (value || 'care team').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const formatDateTime = (value) => value
  ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'To be confirmed by the clinic'
const statusClass = (value) => {
  if (value === 'completed') return 'badge-success'
  if (value === 'cancelled') return 'badge-danger'
  if (value === 'requested') return 'badge-warning'
  if (value === 'active') return 'badge-info'
  return 'badge-gray'
}
const staffName = (person) => `${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'Care team member'

function Modal({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Telehealth request</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Request a consultation</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function TelehealthPage() {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const queryClient = useQueryClient()
  const patientMode = user?.role === 'patient'
  const [selectedThreadId, setSelectedThreadId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showRequest, setShowRequest] = useState(false)
  const [requestForm, setRequestForm] = useState(emptyRequest)
  const [requestError, setRequestError] = useState('')
  const [deviceStopSignal, setDeviceStopSignal] = useState(0)
  const [videoActive, setVideoActive] = useState(false)
  const deviceRef = useRef(null)
  const stopPreview = () => { deviceRef.current?.stop(); setDeviceStopSignal((value) => value + 1) }

  const directoryQuery = useQuery({
    queryKey: ['telehealth-directory'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const threadsQuery = useQuery({
    queryKey: ['telehealth-threads'],
    refetchInterval: 15000,
    queryFn: () => api.get('/interactions/threads', { params: { threadType: 'tele_consult' } }).then((response) => response.data.data),
  })

  const allThreads = threadsQuery.data || []
  const threads = useMemo(() => allThreads.filter((thread) => {
    if (statusFilter === 'all') return true
    return thread.teleconsult_status === statusFilter || thread.status === statusFilter
  }), [allThreads, statusFilter])
  const directory = directoryQuery.data || { staff: [], patients: [] }
  const clinicians = (directory.staff || []).filter((person) => ['doctor', 'midwife'].includes(person.role))
  const selectedThread = allThreads.find((thread) => thread.id === selectedThreadId) || null

  const detailQuery = useQuery({
    queryKey: ['telehealth-thread', selectedThreadId],
    refetchInterval: 10000,
    queryFn: () => api.get(`/interactions/threads/${selectedThreadId}`).then((response) => response.data.data),
    enabled: Boolean(selectedThreadId),
  })

  useEffect(() => {
    const targetThreadId = location.state?.threadId
    if (targetThreadId && allThreads.some((thread) => thread.id === targetThreadId)) setSelectedThreadId(targetThreadId)
  }, [allThreads, location.state])

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null)
      return
    }
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(threads[0].id)
  }, [threads, selectedThreadId])

  useEffect(() => {
    if (!patientMode && ['doctor', 'midwife'].includes(user?.role) && user?.id) {
      setRequestForm((current) => current.clinicianId ? current : { ...current, clinicianId: user.id })
    }
  }, [patientMode, user?.id, user?.role])

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/interactions/teleconsults', payload).then((response) => response.data.data),
    onSuccess: (result) => {
      setShowRequest(false)
      setRequestError('')
      setRequestForm(emptyRequest)
      setSelectedThreadId(result.thread?.id || null)
      queryClient.invalidateQueries({ queryKey: ['telehealth-threads'] })
      queryClient.invalidateQueries({ queryKey: ['telehealth-thread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['patient-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => setRequestError(error.response?.data?.message || 'We could not submit this telehealth request. Please try again.'),
  })

  const openRequest = () => {
    setRequestError('')
    setShowRequest(true)
  }

  const submitRequest = (event) => {
    event.preventDefault()
    setRequestError('')
    if (!requestForm.clinicianId) {
      setRequestError('Please choose a doctor or midwife for this consultation.')
      return
    }
    if (!requestForm.reason.trim()) {
      setRequestError('Please describe the concern for the care team.')
      return
    }
    if (!patientMode && !requestForm.patientId) {
      setRequestError('Please choose the patient for this consultation.')
      return
    }

    if (!patientMode && requestForm.startAt && !Number.isFinite(new Date(requestForm.startAt).getTime())) {
      setRequestError('Choose a valid consultation date and time.'); return
    }
    createMutation.mutate({
      title: requestForm.title.trim() || undefined,
      clinicianId: requestForm.clinicianId,
      reason: requestForm.reason.trim(),
      initialMessage: requestForm.reason.trim(),
      triggerSource: 'manual',
      ...(patientMode ? {} : { patientId: requestForm.patientId }),
      ...(!patientMode && requestForm.startAt ? { startAt: new Date(requestForm.startAt).toISOString(), sessionStatus: 'scheduled' } : {}),
    })
  }

  const detail = detailQuery.data
  const session = detail?.teleconsult_session
  const activeStatus = session?.status || selectedThread?.teleconsult_status || 'requested'
  const clinician = clinicians.find((person) => person.id === session?.clinician_id)
  const patient = (directory.patients || []).find((person) => person.id === detail?.patient_id)
  const messagePath = patientMode ? '/my/messages' : '/messages'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="page-header mb-0">
        <div>
          <p className="section-kicker">Virtual consultation</p>
          <h1 className="page-title">Telehealth</h1>
          <p className="page-sub">Request, schedule, and follow up on secure consultations without mixing them into regular messages.</p>
        </div>
        <button type="button" onClick={openRequest} className="btn-primary">Request consultation</button>
      </div>

      <div className="alert-warning">
        <span>Telehealth is not an emergency service. For severe pain, bleeding, breathing difficulty, loss of consciousness, or another emergency, call emergency services or go to the nearest appropriate healthcare facility.</span>
      </div>

      {!videoActive ? <DeviceCheck ref={deviceRef} sessionKey={selectedThreadId || "no-consultation"} stopSignal={deviceStopSignal} /> : null}

      <div className="grid gap-5 lg:grid-cols-[18rem,minmax(0,1fr)]">
        <aside className="card h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title mb-1">Consultations</h2>
              <p className="text-sm text-slate-500">Your secure consultation history.</p>
            </div>
            <span className="badge badge-gray">{allThreads.length}</span>
          </div>

          <label htmlFor="telehealth-filter" className="label mt-4">Status</label>
          <select id="telehealth-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input">
            {SESSION_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {threadsQuery.isLoading ? <div className="flex justify-center py-8"><div className="loading-spinner h-7 w-7" /></div> : null}
            {!threadsQuery.isLoading && !threadsQuery.isError && !threads.length ? <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">No consultations match this filter.</p> : null}
            {threadsQuery.isError ? <p role="alert" className="text-sm text-rose-700">Consultations could not be loaded. <button type="button" onClick={() => threadsQuery.refetch()} className="underline">Try again</button></p> : null}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedThreadId(thread.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${thread.id === selectedThreadId ? 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20' : 'border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{thread.title}</p>
                  <span className={`badge ${statusClass(thread.teleconsult_status || 'requested')}`}>{roleLabel(thread.teleconsult_status || 'requested')}</span>
                </div>
                <p className="mt-2 truncate text-xs text-slate-500">{thread.patient_name || 'Telehealth consultation'}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{thread.latest_message || 'No consultation note yet.'}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="card min-h-[38rem]">
          {!selectedThreadId ? (
            <div className="flex min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 text-center dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No consultation selected</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Choose a consultation from the list, or send a new request to the clinic care team.</p>
              <button type="button" onClick={openRequest} className="btn-primary mt-5">Request consultation</button>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex min-h-[32rem] items-center justify-center"><div className="loading-spinner h-9 w-9" /></div>
          ) : detailQuery.isError && !detailQuery.data ? (
            <div className="alert-critical"><span>{detailQuery.error.response?.data?.message || 'We could not load this consultation.'}</span></div>
          ) : (
            <div className="space-y-6">
              {detailQuery.isError ? <p role="alert" className="alert-warning">Consultation updates could not refresh. Your video call can continue; try refreshing the updates when your connection is stable.</p> : null}
              <div className="border-b border-slate-100 pb-5 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="section-kicker">Consultation details</p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{detail.title}</h2>
                  </div>
                  <span className={`badge ${statusClass(activeStatus)}`}>{roleLabel(activeStatus)}</span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{session?.reason || detail.latest_message || 'The care team will add consultation details here.'}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Care provider</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{clinician ? staffName(clinician) : 'To be confirmed'}</p>
                  <p className="mt-1 text-sm text-slate-500">{clinician ? roleLabel(clinician.role) : 'The clinic will assign a provider.'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Schedule</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{formatDateTime(session?.start_at)}</p>
                  <p className="mt-1 text-sm text-slate-500">Private video consultation inside MWOS.</p>
                </div>
                {!patientMode ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Patient</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{detail.patient_name || (patient ? `${patient.first_name} ${patient.last_name}` : 'Patient record')}</p>
                    <p className="mt-1 text-sm text-slate-500">Consultation record remains connected to the patient profile.</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Video room</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">MWOS video room</p>
                  <p className="mt-1 text-sm text-slate-500">A private room is prepared when you join your confirmed consultation.</p>
                </div>
              </div>

              <ConsultationVideo key={session?.id} session={session} user={user} onJoin={stopPreview} onActiveChange={setVideoActive} onUpdated={() => { queryClient.invalidateQueries({ queryKey: ['telehealth-thread', selectedThreadId] }); queryClient.invalidateQueries({ queryKey: ['telehealth-threads'] }) }} />
              <Link to={messagePath} state={{ threadId: detail.id }} className="btn-secondary">Open consultation messages</Link>

              <div>
                <h3 className="section-title mb-3">Consultation updates</h3>
                <div className="space-y-3">
                  {(detail.messages || []).length ? detail.messages.map((message) => (
                    <div key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{message.sender_name || 'Care team'}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(message.created_at)}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{message.body}</p>
                    </div>
                  )) : <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">Consultation updates will appear here after the care team responds.</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {showRequest ? (
        <Modal onClose={() => { setShowRequest(false); setRequestError('') }}>
          <form onSubmit={submitRequest} className="space-y-4">
            {!patientMode ? (
              <div>
                <label className="label">Patient</label>
                <select value={requestForm.patientId} onChange={(event) => setRequestForm((current) => ({ ...current, patientId: event.target.value }))} className="input">
                  <option value="">Choose patient</option>
                  {(directory.patients || []).map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}
                </select>
              </div>
            ) : null}
            <div>
              <label className="label">Doctor or midwife</label>
              <select value={requestForm.clinicianId} onChange={(event) => setRequestForm((current) => ({ ...current, clinicianId: event.target.value }))} className="input">
                <option value="">Choose provider</option>
                {clinicians.map((person) => <option key={person.id} value={person.id}>{staffName(person)} · {roleLabel(person.role)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Consultation title</label>
              <input value={requestForm.title} onChange={(event) => setRequestForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Example: Prenatal follow-up" />
            </div>
            {!patientMode ? (
              <div>
                <label className="label">Preferred schedule</label>
                <input type="datetime-local" value={requestForm.startAt} onChange={(event) => setRequestForm((current) => ({ ...current, startAt: event.target.value }))} className="input" />
                <p className="mt-1 text-xs text-slate-500">Leave blank for a request that still needs clinic confirmation.</p>
              </div>
            ) : null}
            <div>
              <label className="label">Reason for consultation</label>
              <textarea value={requestForm.reason} onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))} className="input min-h-[8rem] resize-y" placeholder="Briefly describe the concern, symptoms, or follow-up needed." />
            </div>
            {requestError ? <div className="alert-critical"><span>{requestError}</span></div> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowRequest(false); setRequestError('') }} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">{createMutation.isPending ? 'Submitting...' : 'Submit request'}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
