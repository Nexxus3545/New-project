import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'

const MESSAGE_TYPES = [
  ['care_team', 'Care team'],
  ['handoff', 'Handoff'],
  ['announcement', 'Announcement'],
  ['patient_support', 'Patient support'],
]

const STATUS_OPTIONS = [
  ['open', 'Open'],
  ['resolved', 'Resolved'],
  ['archived', 'Archived'],
]

const PRIORITY_OPTIONS = [
  ['normal', 'Normal'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
  ['low', 'Low'],
]

const emptyStaffThread = { title: '', threadType: 'care_team', priority: 'normal', patientId: '', participantIds: [], initialMessage: '' }
const emptyPatientThread = { title: '', initialMessage: '' }

const roleLabel = (value) => (value || 'user').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No activity yet'
const initials = (firstName = '', lastName = '') => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim().toUpperCase() || 'MW'
const priorityClass = (value) => value === 'urgent' ? 'badge-danger' : value === 'high' ? 'badge-warning' : value === 'low' ? 'badge-gray' : 'badge-info'
const statusClass = (value) => value === 'resolved' ? 'badge-success' : value === 'archived' ? 'badge-gray' : 'badge-info'

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function MessagesPage() {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const queryClient = useQueryClient()
  const patientMode = user?.role === 'patient'
  const isStaff = ['admin', 'doctor', 'midwife', 'nurse'].includes(user?.role)
  const [selectedThreadId, setSelectedThreadId] = useState(null)
  const [threadTypeFilter, setThreadTypeFilter] = useState('')
  const [threadStatusFilter, setThreadStatusFilter] = useState('open')
  const [messageBody, setMessageBody] = useState('')
  const [messageCategory, setMessageCategory] = useState('general')
  const [showComposer, setShowComposer] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [staffThreadForm, setStaffThreadForm] = useState(emptyStaffThread)
  const [patientThreadForm, setPatientThreadForm] = useState(emptyPatientThread)
  const markReadRef = useRef(null)

  const directoryQuery = useQuery({
    queryKey: ['message-directory'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const threadsQuery = useQuery({
    queryKey: ['message-threads', threadTypeFilter, threadStatusFilter],
    queryFn: () => api.get('/interactions/threads', {
      params: {
        ...(threadTypeFilter ? { threadType: threadTypeFilter } : {}),
        ...(threadStatusFilter ? { status: threadStatusFilter } : {}),
      },
    }).then((response) => response.data.data),
  })

  const threads = (threadsQuery.data || []).filter((thread) => thread.thread_type !== 'tele_consult')
  const directory = directoryQuery.data || { staff: [], patients: [] }
  const staffOptions = useMemo(() => directory.staff || [], [directory.staff])
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) || null

  const threadDetailQuery = useQuery({
    queryKey: ['message-thread', selectedThreadId],
    queryFn: () => api.get(`/interactions/threads/${selectedThreadId}`).then((response) => response.data.data),
    enabled: Boolean(selectedThreadId),
  })

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null)
      return
    }
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(threads[0].id)
  }, [threads, selectedThreadId])

  useEffect(() => {
    const targetThreadId = location.state?.threadId
    if (targetThreadId && threads.some((thread) => thread.id === targetThreadId)) setSelectedThreadId(targetThreadId)
  }, [location.state, threads])

  useEffect(() => {
    markReadRef.current = null
    setMessageError('')
  }, [selectedThreadId])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['message-threads'] })
    queryClient.invalidateQueries({ queryKey: ['message-thread'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['patient-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const createThreadMutation = useMutation({
    mutationFn: (payload) => api.post('/interactions/threads', payload).then((response) => response.data.data),
    onSuccess: (thread) => {
      setShowComposer(false)
      setComposerError('')
      setStaffThreadForm(emptyStaffThread)
      setPatientThreadForm(emptyPatientThread)
      setSelectedThreadId(thread.id)
      invalidate()
    },
    onError: (error) => setComposerError(error.response?.data?.message || 'We could not start this conversation. Please try again.'),
  })

  const messageMutation = useMutation({
    mutationFn: (payload) => api.post(`/interactions/threads/${selectedThreadId}/messages`, payload),
    onSuccess: () => {
      setMessageBody('')
      setMessageCategory('general')
      invalidate()
    },
    onError: (error) => setMessageError(error.response?.data?.message || 'We could not send your reply. Please try again.'),
  })

  const promoteMutation = useMutation({
    mutationFn: (messageId) => api.post(`/interactions/messages/${messageId}/promote`),
    onSuccess: invalidate,
    onError: (error) => setMessageError(error.response?.data?.message || 'We could not add this message to the medical record.'),
  })

  const markReadMutation = useMutation({
    mutationFn: (threadId) => api.patch(`/interactions/threads/${threadId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['message-threads'] }),
  })

  useEffect(() => {
    if (!selectedThread || !threadDetailQuery.data || selectedThread.unread_count <= 0) return
    if (markReadRef.current === selectedThread.id) return
    markReadRef.current = selectedThread.id
    markReadMutation.mutate(selectedThread.id)
  }, [selectedThread, threadDetailQuery.data])

  const toggleParticipant = (id) => {
    setStaffThreadForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(id)
        ? current.participantIds.filter((value) => value !== id)
        : [...current.participantIds, id],
    }))
  }

  const submitThread = (event) => {
    event.preventDefault()
    setComposerError('')

    if (patientMode) {
      if (!patientThreadForm.initialMessage.trim()) {
        setComposerError('Please write your message before sending it to the clinic.')
        return
      }
      createThreadMutation.mutate({
        title: patientThreadForm.title.trim(),
        initialMessage: patientThreadForm.initialMessage.trim(),
      })
      return
    }

    if (!staffThreadForm.initialMessage.trim()) {
      setComposerError('Please add the opening message for this conversation.')
      return
    }
    if (!staffThreadForm.patientId && staffThreadForm.participantIds.length === 0) {
      setComposerError('Select a patient or at least one care-team participant.')
      return
    }

    createThreadMutation.mutate({
      title: staffThreadForm.title.trim(),
      threadType: staffThreadForm.threadType,
      priority: staffThreadForm.priority,
      patientId: staffThreadForm.patientId || undefined,
      participantIds: staffThreadForm.participantIds,
      initialMessage: staffThreadForm.initialMessage.trim(),
    })
  }

  const submitMessage = (event) => {
    event.preventDefault()
    if (!messageBody.trim()) return
    setMessageError('')
    messageMutation.mutate({ body: messageBody.trim(), messageCategory })
  }

  const detail = threadDetailQuery.data
  const unreadCount = threads.reduce((total, thread) => total + Number(thread.unread_count || 0), 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="page-header mb-0">
        <div>
          <p className="section-kicker">Secure communication</p>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">Keep patient, provider, and clinic conversations together with clear timestamps and a complete care history.</p>
        </div>
        <button type="button" onClick={() => setShowComposer(true)} className="btn-primary">New message</button>
      </div>

      <div className="alert-warning">
        <span>Messages are not monitored for emergencies. For urgent symptoms, contact emergency services or go to the nearest appropriate healthcare facility.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[18rem,minmax(0,1fr)]">
        <aside className="card h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title mb-1">Conversations</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}</p>
            </div>
            <span className="badge badge-gray">{threads.length}</span>
          </div>

          <div className="mt-4 grid gap-2">
            <select value={threadTypeFilter} onChange={(event) => setThreadTypeFilter(event.target.value)} className="input" aria-label="Filter conversations by type">
              <option value="">All conversation types</option>
              {MESSAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={threadStatusFilter} onChange={(event) => setThreadStatusFilter(event.target.value)} className="input" aria-label="Filter conversations by status">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {threadsQuery.isLoading ? <div className="flex justify-center py-8"><div className="loading-spinner h-7 w-7" /></div> : null}
            {!threadsQuery.isLoading && !threads.length ? <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">No conversations match this filter.</p> : null}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedThreadId(thread.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${thread.id === selectedThreadId ? 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20' : 'border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{thread.title}</p>
                  {thread.unread_count ? <span className="badge badge-danger">{thread.unread_count}</span> : null}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{thread.patient_name || thread.latest_sender_name || 'Care conversation'}</p>
                {thread.latest_message ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{thread.latest_message}</p> : null}
                <p className="mt-2 text-[11px] text-slate-400">{formatDateTime(thread.last_message_at || thread.updated_at)}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="card min-h-[38rem]">
          {!selectedThreadId ? (
            <div className="flex min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 text-center dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Choose a conversation</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Select a conversation on the left, or start a new message for the clinic care team.</p>
            </div>
          ) : threadDetailQuery.isLoading ? (
            <div className="flex min-h-[32rem] items-center justify-center"><div className="loading-spinner h-9 w-9" /></div>
          ) : threadDetailQuery.isError ? (
            <div className="alert-critical"><span>{threadDetailQuery.error.response?.data?.message || 'We could not load this conversation.'}</span></div>
          ) : (
            <div className="flex min-h-[34rem] flex-col">
              <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">{detail.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{detail.patient_name || 'Care team conversation'} · Updated {formatDateTime(detail.last_message_at || detail.updated_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`badge ${statusClass(detail.status)}`}>{roleLabel(detail.status)}</span>
                    <span className={`badge ${priorityClass(detail.priority)}`}>{roleLabel(detail.priority)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">Participants: {(detail.participants || []).map((person) => `${person.first_name} ${person.last_name}`).join(', ') || 'Care team'}</p>
              </div>

              {messageError ? <div className="mt-4 alert-critical"><span>{messageError}</span></div> : null}

              <div className="my-4 min-h-[17rem] flex-1 space-y-3 overflow-y-auto pr-1">
                {!(detail.messages || []).length ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">No messages yet. Add the first update below.</p> : null}
                {(detail.messages || []).map((message) => (
                  <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${message.sender_id === user?.id ? 'bg-[var(--accent)] text-white' : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`font-semibold ${message.sender_id === user?.id ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{message.sender_name}</span>
                        <span className={message.sender_id === user?.id ? 'text-white/70' : 'text-slate-400'}>{roleLabel(message.sender_role)}</span>
                      </div>
                      <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.sender_id === user?.id ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{message.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] ${message.sender_id === user?.id ? 'text-white/70' : 'text-slate-400'}`}>{formatDateTime(message.created_at)}</span>
                        {message.is_clinical_note ? <span className={`badge ${message.sender_id === user?.id ? 'badge-gray' : 'badge-success'}`}>Clinical note</span> : null}
                        {message.record_promotion_status === 'promoted' ? <span className={`badge ${message.sender_id === user?.id ? 'badge-gray' : 'badge-success'}`}>Added to record</span> : null}
                      </div>
                      {isStaff && message.sender_id !== user?.id && message.record_promotion_status !== 'promoted' ? (
                        <button type="button" disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate(message.id)} className={`mt-3 text-xs font-semibold ${message.sender_id === user?.id ? 'text-white/85' : 'text-[var(--accent)]'}`}>
                          {promoteMutation.isPending ? 'Adding...' : 'Add to medical record'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={submitMessage} className="border-t border-slate-100 pt-4 dark:border-slate-800">
                {isStaff ? (
                  <div className="mb-3 max-w-xs">
                    <label className="label">Message category</label>
                    <select value={messageCategory} onChange={(event) => setMessageCategory(event.target.value)} className="input">
                      <option value="general">General update</option>
                      <option value="clinical_advice">Clinical advice</option>
                      <option value="clinical_note">Clinical note</option>
                      <option value="handoff">Handoff</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                ) : null}
                <label className="label">Reply</label>
                <textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} className="input min-h-[6.5rem] resize-y" placeholder={patientMode ? 'Share your question or update for the clinic...' : 'Add a clear care update, handoff, or next step...'} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Your reply will notify the other participants in this conversation.</p>
                  <button type="submit" disabled={messageMutation.isPending || !messageBody.trim()} className="btn-primary">{messageMutation.isPending ? 'Sending...' : 'Send reply'}</button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>

      {showComposer ? (
        <Modal
          title={patientMode ? 'Message the clinic' : 'Start a care conversation'}
          subtitle={patientMode ? 'The clinic care team will receive your message.' : 'Keep one topic or patient handoff in each conversation.'}
          onClose={() => { setShowComposer(false); setComposerError('') }}
        >
          <form onSubmit={submitThread} className="space-y-4">
            {composerError ? <div className="alert-critical"><span>{composerError}</span></div> : null}
            {patientMode ? (
              <>
                <div><label className="label">Subject</label><input value={patientThreadForm.title} onChange={(event) => setPatientThreadForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Question about my next appointment" /></div>
                <div><label className="label">Message</label><textarea value={patientThreadForm.initialMessage} onChange={(event) => setPatientThreadForm((current) => ({ ...current, initialMessage: event.target.value }))} className="input min-h-[9rem] resize-y" placeholder="Share your concern, symptom, request, or follow-up question." /></div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label className="label">Conversation type</label><select value={staffThreadForm.threadType} onChange={(event) => setStaffThreadForm((current) => ({ ...current, threadType: event.target.value }))} className="input">{MESSAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div><label className="label">Priority</label><select value={staffThreadForm.priority} onChange={(event) => setStaffThreadForm((current) => ({ ...current, priority: event.target.value }))} className="input">{PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                </div>
                <div><label className="label">Subject</label><input value={staffThreadForm.title} onChange={(event) => setStaffThreadForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Postnatal follow-up" /></div>
                <div><label className="label">Related patient</label><select value={staffThreadForm.patientId} onChange={(event) => setStaffThreadForm((current) => ({ ...current, patientId: event.target.value }))} className="input"><option value="">No linked patient</option>{directory.patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}</option>)}</select></div>
                <fieldset><legend className="label">Care-team participants</legend><div className="grid max-h-44 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 dark:border-slate-700">{staffOptions.map((member) => <label key={member.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"><input type="checkbox" checked={staffThreadForm.participantIds.includes(member.id)} onChange={() => toggleParticipant(member.id)} /><span>{member.first_name} {member.last_name} · {roleLabel(member.role)}</span></label>)}</div></fieldset>
                <div><label className="label">Opening message</label><textarea value={staffThreadForm.initialMessage} onChange={(event) => setStaffThreadForm((current) => ({ ...current, initialMessage: event.target.value }))} className="input min-h-[9rem] resize-y" placeholder="Add the patient context, care update, or handoff details." /></div>
              </>
            )}
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowComposer(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={createThreadMutation.isPending} className="btn-primary">{createThreadMutation.isPending ? 'Creating...' : 'Create conversation'}</button></div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
