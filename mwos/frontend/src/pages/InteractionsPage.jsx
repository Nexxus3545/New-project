import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'

const THREAD_TYPES = [
  ['care_team', 'Care team'],
  ['handoff', 'Handoff'],
  ['announcement', 'Announcement'],
  ['patient_support', 'Patient support'],
  ['tele_consult', 'Tele-consult'],
]
const THREAD_CREATION_TYPES = THREAD_TYPES.filter(([value]) => value !== 'tele_consult')

const STATUSES = [
  ['open', 'Open'],
  ['resolved', 'Resolved'],
  ['archived', 'Archived'],
]

const PRIORITIES = [
  ['normal', 'Normal'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
  ['low', 'Low'],
]

const initialStaffThread = { title: '', threadType: 'care_team', priority: 'normal', patientId: '', participantIds: [], initialMessage: '' }
const initialPatientThread = { title: '', initialMessage: '' }
const initialTask = { title: '', description: '', patientId: '', threadId: '', assignedTo: '', dueDate: '', priority: 'normal', patientVisible: false }

const roleLabel = (value) => (value || 'user').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No activity'
const dateOnly = (value) => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'
const initials = (firstName = '', lastName = '') => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim().toUpperCase() || 'MW'
const priorityClass = (value) => value === 'urgent' ? 'badge-danger' : value === 'high' ? 'badge-warning' : value === 'low' ? 'badge-gray' : 'badge-info'
const statusClass = (value) => value === 'completed' || value === 'resolved' ? 'badge-success' : value === 'cancelled' || value === 'archived' ? 'badge-gray' : value === 'in_progress' ? 'badge-warning' : 'badge-info'

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function InteractionsPage() {
  const user = useAuthStore((state) => state.user)
  const qc = useQueryClient()
  const location = useLocation()
  const patientMode = user?.role === 'patient'
  const isStaff = ['admin', 'doctor', 'midwife', 'nurse'].includes(user?.role)
  const isClinician = ['doctor', 'midwife'].includes(user?.role)
  const [selectedThreadId, setSelectedThreadId] = useState(null)
  const [threadTypeFilter, setThreadTypeFilter] = useState('')
  const [threadStatusFilter, setThreadStatusFilter] = useState('open')
  const [messageBody, setMessageBody] = useState('')
  const [messageCategory, setMessageCategory] = useState('general')
  const [showThreadModal, setShowThreadModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [taskError, setTaskError] = useState('')
  const [messageActionError, setMessageActionError] = useState('')
  const [staffThreadForm, setStaffThreadForm] = useState(initialStaffThread)
  const [patientThreadForm, setPatientThreadForm] = useState(initialPatientThread)
  const [taskForm, setTaskForm] = useState(initialTask)
  const markReadRef = useRef(null)

  const directoryQuery = useQuery({
    queryKey: ['interaction-directory'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const threadsQuery = useQuery({
    queryKey: ['interaction-threads', threadTypeFilter, threadStatusFilter],
    queryFn: () => api.get('/interactions/threads', {
      params: {
        ...(threadTypeFilter ? { threadType: threadTypeFilter } : {}),
        ...(threadStatusFilter ? { status: threadStatusFilter } : {}),
      },
    }).then((response) => response.data.data),
  })

  const tasksQuery = useQuery({
    queryKey: ['interaction-tasks', showCompletedTasks],
    queryFn: () => api.get('/interactions/tasks', {
      params: showCompletedTasks ? { includeCompleted: 'true' } : {},
    }).then((response) => response.data.data),
  })

  const threads = threadsQuery.data || []
  const tasks = tasksQuery.data || []
  const directory = directoryQuery.data || { staff: [], patients: [] }
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) || null

  const threadDetailQuery = useQuery({
    queryKey: ['interaction-thread', selectedThreadId],
    queryFn: () => api.get(`/interactions/threads/${selectedThreadId}`).then((response) => response.data.data),
    enabled: Boolean(selectedThreadId),
  })

  const assignees = useMemo(() => [
    ...directory.staff.map((member) => ({ id: member.id, label: `${member.first_name} ${member.last_name}`, role: member.role })),
    ...directory.patients.filter((patient) => patient.user_id).map((patient) => ({ id: patient.user_id, label: `${patient.first_name} ${patient.last_name}`, role: 'patient' })),
  ], [directory])

  useEffect(() => {
    if (!threads.length) return setSelectedThreadId(null)
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(threads[0].id)
  }, [threads, selectedThreadId])

  useEffect(() => {
    const targetThreadId = location.state?.threadId
    if (!targetThreadId) return
    if (threads.some((thread) => thread.id === targetThreadId)) {
      setSelectedThreadId(targetThreadId)
    }
  }, [location.state, threads])

  useEffect(() => { markReadRef.current = null }, [selectedThreadId])
  useEffect(() => { setMessageActionError('') }, [selectedThreadId])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['interaction-threads'] })
    qc.invalidateQueries({ queryKey: ['interaction-thread'] })
    qc.invalidateQueries({ queryKey: ['interaction-tasks'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['patient-dashboard'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const createThreadMutation = useMutation({
    mutationFn: (payload) => api.post('/interactions/threads', payload).then((response) => response.data.data),
    onSuccess: (thread) => {
      setShowThreadModal(false)
      setThreadError('')
      setStaffThreadForm(initialStaffThread)
      setPatientThreadForm(initialPatientThread)
      setSelectedThreadId(thread.id)
      invalidate()
    },
    onError: (error) => setThreadError(error.response?.data?.message || 'Unable to create this conversation right now.'),
  })

  const createTeleconsultMutation = useMutation({
    mutationFn: (payload) => api.post('/interactions/teleconsults', payload).then((response) => response.data.data),
    onSuccess: (result) => {
      setShowThreadModal(false)
      setThreadError('')
      setStaffThreadForm(initialStaffThread)
      setPatientThreadForm(initialPatientThread)
      setSelectedThreadId(result.thread?.id || null)
      invalidate()
    },
    onError: (error) => setThreadError(error.response?.data?.message || 'Unable to start a tele-consult right now.'),
  })

  const messageMutation = useMutation({
    mutationFn: (payload) => api.post(`/interactions/threads/${selectedThreadId}/messages`, payload),
    onSuccess: () => {
      setMessageBody('')
      setMessageCategory('general')
      invalidate()
    },
  })

  const promoteMessageMutation = useMutation({
    mutationFn: (messageId) => api.post(`/interactions/messages/${messageId}/promote`),
    onSuccess: () => {
      setMessageActionError('')
      invalidate()
    },
    onError: (error) => {
      setMessageActionError(error.response?.data?.message || 'Unable to promote this message right now.')
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (threadId) => api.patch(`/interactions/threads/${threadId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interaction-threads'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['patient-dashboard'] })
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: (payload) => api.post('/interactions/tasks', payload),
    onSuccess: () => {
      setShowTaskModal(false)
      setTaskError('')
      setTaskForm(initialTask)
      invalidate()
    },
    onError: (error) => setTaskError(error.response?.data?.message || 'Unable to assign this task right now.'),
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }) => api.patch(`/interactions/tasks/${taskId}`, payload),
    onSuccess: invalidate,
  })

  useEffect(() => {
    if (!selectedThread || !threadDetailQuery.data || selectedThread.unread_count <= 0) return
    if (markReadRef.current === selectedThread.id) return
    markReadRef.current = selectedThread.id
    markReadMutation.mutate(selectedThread.id)
  }, [selectedThread, threadDetailQuery.data])

  const toggleParticipant = (id) => setStaffThreadForm((current) => ({
    ...current,
    participantIds: current.participantIds.includes(id) ? current.participantIds.filter((value) => value !== id) : [...current.participantIds, id],
  }))

  const submitThread = (event) => {
    event.preventDefault()
    setThreadError('')
    if (patientMode) {
      if (!patientThreadForm.initialMessage.trim()) return setThreadError('Please write your message first.')
      return createThreadMutation.mutate({ title: patientThreadForm.title.trim(), initialMessage: patientThreadForm.initialMessage.trim() })
    }
    if (!staffThreadForm.initialMessage.trim()) return setThreadError('Please add the opening care note.')
    if (!staffThreadForm.patientId && staffThreadForm.participantIds.length === 0) return setThreadError('Select at least one participant or attach the thread to a patient.')
    if (staffThreadForm.threadType === 'tele_consult') {
      if (!isClinician) return setThreadError('Tele-consult sessions require a doctor or midwife.')
      return createTeleconsultMutation.mutate({
        title: staffThreadForm.title.trim(),
        patientId: staffThreadForm.patientId || undefined,
        clinicianId: user.id,
        participantIds: staffThreadForm.participantIds,
        reason: staffThreadForm.initialMessage.trim(),
        initialMessage: staffThreadForm.initialMessage.trim(),
        triggerSource: 'manual',
      })
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

  const submitTask = (event) => {
    event.preventDefault()
    setTaskError('')
    if (!taskForm.title.trim() || !taskForm.assignedTo) return setTaskError('Task title and assignee are required.')
    createTaskMutation.mutate({
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      patientId: taskForm.patientId || undefined,
      threadId: taskForm.threadId || selectedThreadId || undefined,
      assignedTo: taskForm.assignedTo,
      dueDate: taskForm.dueDate || undefined,
      priority: taskForm.priority,
      patientVisible: taskForm.patientVisible,
    })
  }

  const submitMessage = (event) => {
    event.preventDefault()
    if (!messageBody.trim()) return
    messageMutation.mutate({ body: messageBody.trim(), messageCategory })
  }

  const threadDetail = threadDetailQuery.data
  const unreadCount = threads.reduce((sum, thread) => sum + Number(thread.unread_count || 0), 0)
  const openTaskCount = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{patientMode ? 'Care Team' : 'Care Hub'}</h1>
          <p className="page-sub">{patientMode ? 'Message the clinic, review replies, and track your visible care tasks.' : 'Shared coordination for admin, doctor, midwife, nurse, and patient workflows.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowThreadModal(true)} className="btn-primary">New conversation</button>
          {isStaff && <button type="button" onClick={() => setShowTaskModal(true)} className="btn-secondary">Assign task</button>}
        </div>
      </div>

      {messageActionError ? (
        <div className="alert-critical">
          <span>{messageActionError}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card-hover"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">Unread threads</p><p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-slate-50">{unreadCount}</p><p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Updates from another role that still need attention.</p></div>
        <div className="card-hover"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">{patientMode ? 'Visible care tasks' : 'Open assignments'}</p><p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-slate-50">{openTaskCount}</p><p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{patientMode ? 'Tasks the clinic shared with you.' : 'Tasks assigned to you or still active in your lane.'}</p></div>
        <div className="card-hover"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">Role view</p><p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-slate-50">{roleLabel(user?.role)}</p><p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{patientMode ? 'Patient-safe collaboration only.' : 'Role-aware coordination and handoffs.'}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,minmax(0,1fr),340px]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="section-title mb-1">Conversations</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Filter your care threads.</p>
              </div>
              <span className="badge badge-gray">{threads.length}</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <select value={threadTypeFilter} onChange={(event) => setThreadTypeFilter(event.target.value)} className="input">
                <option value="">All thread types</option>
                {THREAD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={threadStatusFilter} onChange={(event) => setThreadStatusFilter(event.target.value)} className="input">
                <option value="">All statuses</option>
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="mt-5 space-y-3">
              {threadsQuery.isLoading && <div className="flex justify-center py-10"><div className="loading-spinner h-8 w-8" /></div>}
              {!threadsQuery.isLoading && threads.length === 0 && <div className="rounded-3xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">No conversations match this filter yet.</div>}

              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full rounded-3xl border p-4 text-left transition-all ${thread.id === selectedThreadId ? 'border-transparent bg-[var(--accent-ghost)] shadow-md dark:bg-slate-800' : 'border-gray-200 bg-white/80 hover:border-gray-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{thread.title}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{thread.patient_name ? `${thread.patient_name} - ` : ''}{thread.latest_sender_name || 'Conversation thread'}</p>
                    </div>
                    {thread.unread_count > 0 && <span className="badge badge-danger whitespace-nowrap">{thread.unread_count} new</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`badge ${statusClass(thread.status)}`}>{roleLabel(thread.status)}</span>
                    <span className={`badge ${priorityClass(thread.priority)}`}>{roleLabel(thread.priority)}</span>
                    <span className="badge badge-gray">{roleLabel(thread.thread_type)}</span>
                  </div>
                  {thread.latest_message && <p className="mt-3 line-clamp-2 text-sm text-gray-600 dark:text-slate-300">{thread.latest_message}</p>}
                  <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">{dateTime(thread.last_message_at || thread.updated_at)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="section-title mb-1">Care team directory</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">{patientMode ? 'People who can support your case.' : 'People available for coordination.'}</p>
              </div>
              <span className="badge badge-gray">{directory.staff.length} staff</span>
            </div>
            <div className="space-y-3">
              {directory.staff.slice(0, 6).map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-3 dark:bg-slate-800/70">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-text)]">
                    {member.avatar_url ? <img src={member.avatar_url} alt={`${member.first_name} ${member.last_name}`} className="h-full w-full object-cover" /> : initials(member.first_name, member.last_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{member.first_name} {member.last_name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{roleLabel(member.role)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card min-h-[720px]">
          {!selectedThreadId ? (
            <div className="flex h-full min-h-[500px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 px-6 text-center dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Choose a conversation</h3>
              <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-slate-400">Open a thread from the left or start a new conversation to coordinate next steps.</p>
            </div>
          ) : threadDetailQuery.isLoading ? (
            <div className="flex min-h-[500px] items-center justify-center"><div className="loading-spinner h-10 w-10" /></div>
          ) : threadDetailQuery.isError ? (
            <div className="alert-critical"><div><p className="font-medium">The selected conversation could not be loaded.</p><p className="mt-1 text-sm">{threadDetailQuery.error.response?.data?.message || threadDetailQuery.error.message}</p></div></div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-gray-100 pb-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{threadDetail.title}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{threadDetail.patient_name ? `${threadDetail.patient_name} - ` : ''}Updated {dateTime(threadDetail.last_message_at || threadDetail.updated_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`badge ${statusClass(threadDetail.status)}`}>{roleLabel(threadDetail.status)}</span>
                    <span className={`badge ${priorityClass(threadDetail.priority)}`}>{roleLabel(threadDetail.priority)}</span>
                    <span className="badge badge-gray">{roleLabel(threadDetail.thread_type)}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(threadDetail.participants || []).map((participant) => <span key={participant.id} className="badge badge-gray">{participant.first_name} {participant.last_name} - {roleLabel(participant.role)}</span>)}
                </div>
                {threadDetail.teleconsult_session ? (
                  <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50/70 px-4 py-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">Tele-consult session</p>
                        <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/75">
                          {threadDetail.teleconsult_session.reason || 'Clinical escalation'} • {threadDetail.teleconsult_session.meeting_provider || 'jitsi'} • {threadDetail.teleconsult_session.meeting_code || 'meeting pending'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`badge ${statusClass(threadDetail.teleconsult_session.status)}`}>{roleLabel(threadDetail.teleconsult_session.status)}</span>
                        <span className="badge badge-gray">{roleLabel(threadDetail.teleconsult_session.meeting_provider || 'jitsi')}</span>
                        {threadDetail.teleconsult_session.meeting_url ? (
                          <a href={threadDetail.teleconsult_session.meeting_url} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                            Open tele-consult
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : isClinician && threadDetail.patient_id ? (
                  <div className="mt-4 rounded-3xl border border-dashed border-rose-200 bg-rose-50/60 px-4 py-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">Tele-consult escalation</p>
                        <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/75">
                          Start a secure tele-consult session for this patient and open the meeting link right away.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={createTeleconsultMutation.isPending}
                        onClick={() => createTeleconsultMutation.mutate({
                          threadId: threadDetail.id,
                          patientId: threadDetail.patient_id,
                          clinicianId: user.id,
                          reason: threadDetail.title,
                          initialMessage: `Tele-consult escalated by ${user.first_name} ${user.last_name}.`,
                          triggerSource: 'message',
                          clinicalTrigger: 'manual_escalation',
                        })}
                        className="btn-primary btn-sm"
                      >
                        {createTeleconsultMutation.isPending ? 'Starting...' : 'Start tele-consult'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto py-5">
                {!(threadDetail.messages || []).length && <div className="rounded-3xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">No messages yet. Start the care discussion below.</div>}
                {(threadDetail.messages || []).map((message) => (
                  <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-3xl px-4 py-3 ${message.sender_id === user?.id ? 'bg-[var(--accent)] text-white' : 'border border-gray-200 bg-white text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
                      <div className="mb-2 flex items-center gap-2 text-xs"><span className={`font-semibold ${message.sender_id === user?.id ? 'text-white/90' : 'text-gray-600 dark:text-slate-300'}`}>{message.sender_name}</span><span className={message.sender_id === user?.id ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}>{roleLabel(message.sender_role)}</span></div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        {message.message_category && message.message_category !== 'general' ? <span className={`badge ${message.sender_id === user?.id ? 'badge-gray' : 'badge-info'}`}>{roleLabel(message.message_category)}</span> : null}
                        {message.is_clinical_note ? <span className={`badge ${message.sender_id === user?.id ? 'badge-gray' : 'badge-success'}`}>Clinical note</span> : null}
                        {message.record_promotion_status === 'promoted' ? <span className={`badge ${message.sender_id === user?.id ? 'badge-gray' : 'badge-success'}`}>Promoted to record</span> : null}
                      </div>
                      <p className={`whitespace-pre-wrap text-sm ${message.sender_id === user?.id ? 'text-white' : 'text-gray-700 dark:text-slate-200'}`}>{message.body}</p>
                      <p className={`mt-2 text-[11px] ${message.sender_id === user?.id ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}`}>{dateTime(message.created_at)}</p>
                      {isStaff && message.sender_id !== user?.id && message.record_promotion_status !== 'promoted' ? (
                        <button
                          type="button"
                          disabled={promoteMessageMutation.isPending}
                          onClick={() => promoteMessageMutation.mutate(message.id)}
                          className={`mt-3 text-[11px] font-semibold ${message.sender_id === user?.id ? 'text-white/80' : 'text-[var(--accent)]'}`}
                        >
                          {promoteMessageMutation.isPending ? 'Promoting...' : 'Promote to record'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={submitMessage} className="border-t border-gray-100 pt-4 dark:border-slate-800">
                <label className="label">Reply to this thread</label>
                {isStaff ? (
                  <div className="mb-3">
                    <label className="label">Message category</label>
                    <select value={messageCategory} onChange={(event) => setMessageCategory(event.target.value)} className="input">
                      {[
                        ['general', 'General'],
                        ['clinical_advice', 'Clinical advice'],
                        ['clinical_note', 'Clinical note'],
                        ['teleconsult', 'Tele-consult'],
                        ['handoff', 'Handoff'],
                        ['urgent', 'Urgent'],
                      ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                ) : null}
                <textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} className="input min-h-[120px] resize-y" placeholder={patientMode ? 'Share an update or question for your care team...' : 'Add a handoff, note, or next step...'} />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 dark:text-slate-400">Replies notify the other participants in this thread.</p>
                  <button type="submit" disabled={messageMutation.isPending || !messageBody.trim()} className="btn-primary">{messageMutation.isPending ? 'Sending...' : 'Send update'}</button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="section-title mb-1">{patientMode ? 'My care tasks' : 'Task board'}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">{patientMode ? 'Patient-visible follow-ups and reminders from your clinic.' : 'Handoffs, reminders, and patient follow-up work.'}</p>
              </div>
              <button type="button" onClick={() => setShowCompletedTasks((value) => !value)} className="btn-ghost px-3 py-2 text-xs">{showCompletedTasks ? 'Hide completed' : 'Show completed'}</button>
            </div>

            <div className="space-y-3">
              {tasksQuery.isLoading && <div className="flex justify-center py-10"><div className="loading-spinner h-8 w-8" /></div>}
              {!tasksQuery.isLoading && tasks.length === 0 && <div className="rounded-3xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">No task assignments are visible right now.</div>}
              {tasks.map((task) => (
                <div key={task.id} className="rounded-3xl border border-gray-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{task.title}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{task.patient_name ? `${task.patient_name} - ` : ''}{task.assigned_to_name ? `${task.assigned_to_name} - ` : ''}Due {dateOnly(task.due_date)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${statusClass(task.status)}`}>{roleLabel(task.status)}</span>
                      <span className={`badge ${priorityClass(task.priority)}`}>{roleLabel(task.priority)}</span>
                    </div>
                  </div>
                  {task.description && <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">{task.description}</p>}
                  {task.thread_title && <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">Linked thread: {task.thread_title}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!['in_progress', 'completed'].includes(task.status) && <button type="button" onClick={() => updateTaskMutation.mutate({ taskId: task.id, payload: { status: 'in_progress', acknowledged: true } })} className="btn-secondary btn-sm">Start</button>}
                    {task.status !== 'completed' && <button type="button" onClick={() => updateTaskMutation.mutate({ taskId: task.id, payload: { status: 'completed', acknowledged: true } })} className="btn-primary btn-sm">Mark complete</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isStaff && <div className="card"><h3 className="section-title mb-2">Recommended flow</h3><div className="space-y-3 text-sm text-gray-600 dark:text-slate-300"><p>1. Start one thread per case, handoff, or announcement.</p><p>2. Assign the next clear action so ownership is visible.</p><p>3. Keep updates in the same thread so the audit trail stays readable.</p></div></div>}
        </div>
      </div>

      {showThreadModal && (
        <Modal
          title={patientMode ? 'Message your care team' : 'Create a care conversation'}
          subtitle={patientMode ? 'Your message will notify clinic staff.' : 'Use one thread per case, handoff, or announcement.'}
          onClose={() => { setShowThreadModal(false); setThreadError('') }}
        >
          <form onSubmit={submitThread} className="space-y-4">
            {threadError && <div className="alert-critical"><span>{threadError}</span></div>}
            {patientMode ? (
              <>
                <div><label className="label">Subject</label><input value={patientThreadForm.title} onChange={(event) => setPatientThreadForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Question about my next visit" /></div>
                <div><label className="label">Message</label><textarea value={patientThreadForm.initialMessage} onChange={(event) => setPatientThreadForm((current) => ({ ...current, initialMessage: event.target.value }))} className="input min-h-[160px] resize-y" placeholder="Share your concern, symptom, request, or follow-up question." /></div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><label className="label">Thread type</label><select value={staffThreadForm.threadType} onChange={(event) => setStaffThreadForm((current) => ({ ...current, threadType: event.target.value }))} className="input">{THREAD_CREATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div><label className="label">Priority</label><select value={staffThreadForm.priority} onChange={(event) => setStaffThreadForm((current) => ({ ...current, priority: event.target.value }))} className="input">{PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                </div>
                <div><label className="label">Title</label><input value={staffThreadForm.title} onChange={(event) => setStaffThreadForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Ana Gomez postpartum follow-up" /></div>
                <div><label className="label">Related patient</label><select value={staffThreadForm.patientId} onChange={(event) => setStaffThreadForm((current) => ({ ...current, patientId: event.target.value }))} className="input"><option value="">No linked patient</option>{directory.patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}{patient.city ? ` - ${patient.city}` : ''}</option>)}</select></div>
                <div><label className="label">Participants</label><div className="grid grid-cols-1 gap-2 rounded-3xl border border-gray-200 p-3 dark:border-slate-700">{directory.staff.map((member) => <label key={member.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"><input type="checkbox" checked={staffThreadForm.participantIds.includes(member.id)} onChange={() => toggleParticipant(member.id)} /><span className="text-sm text-gray-700 dark:text-slate-200">{member.first_name} {member.last_name} - {roleLabel(member.role)}</span></label>)}</div></div>
                <div><label className="label">Opening message</label><textarea value={staffThreadForm.initialMessage} onChange={(event) => setStaffThreadForm((current) => ({ ...current, initialMessage: event.target.value }))} className="input min-h-[160px] resize-y" placeholder="Share the patient context, concern, or handoff details." /></div>
              </>
            )}
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowThreadModal(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={createThreadMutation.isPending} className="btn-primary">{createThreadMutation.isPending ? 'Creating...' : 'Create conversation'}</button></div>
          </form>
        </Modal>
      )}

      {showTaskModal && isStaff && (
        <Modal title="Assign a care task" subtitle="Use tasks for explicit handoffs, patient reminders, and next-step ownership." onClose={() => { setShowTaskModal(false); setTaskError('') }}>
          <form onSubmit={submitTask} className="space-y-4">
            {taskError && <div className="alert-critical"><span>{taskError}</span></div>}
            <div><label className="label">Task title</label><input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Confirm postpartum visit schedule" /></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><label className="label">Assign to</label><select value={taskForm.assignedTo} onChange={(event) => setTaskForm((current) => ({ ...current, assignedTo: event.target.value }))} className="input"><option value="">Select assignee</option>{assignees.map((option) => <option key={`${option.role}-${option.id}`} value={option.id}>{option.label} - {roleLabel(option.role)}</option>)}</select></div>
              <div><label className="label">Priority</label><select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))} className="input">{PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><label className="label">Related patient</label><select value={taskForm.patientId} onChange={(event) => setTaskForm((current) => ({ ...current, patientId: event.target.value }))} className="input"><option value="">No linked patient</option>{directory.patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}</option>)}</select></div>
              <div><label className="label">Due date</label><input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} className="input" /></div>
            </div>
            <div><label className="label">Attach to active thread</label><select value={taskForm.threadId} onChange={(event) => setTaskForm((current) => ({ ...current, threadId: event.target.value }))} className="input"><option value="">Use current thread or none</option>{threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}</select></div>
            <div><label className="label">Details</label><textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} className="input min-h-[140px] resize-y" placeholder="Add the context, goal, and what completion looks like." /></div>
            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-slate-700 dark:text-slate-200"><input type="checkbox" checked={taskForm.patientVisible} onChange={(event) => setTaskForm((current) => ({ ...current, patientVisible: event.target.checked }))} />Make this task visible in the patient portal</label>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowTaskModal(false)} className="btn-secondary">Cancel</button><button type="submit" disabled={createTaskMutation.isPending} className="btn-primary">{createTaskMutation.isPending ? 'Assigning...' : 'Assign task'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}




