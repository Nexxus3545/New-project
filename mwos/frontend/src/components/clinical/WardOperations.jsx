import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { QueryState, WorkflowError } from '../common/WorkflowForm'

const categories = [
  ['medication', 'Medication coordination'],
  ['meal', 'Meals'],
  ['operations', 'Other ward tasks'],
]
const clinicToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const admissionTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const labelForStage = (stage) => String(stage || 'Admitted').replaceAll('_', ' ').replace(/^./, first => first.toUpperCase())

function WardTaskForm({ staff, day, pending, error, onSave, onCancel }) {
  const [category, setCategory] = useState('meal')

  function submitTask(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    if (!title) return
    onSave({
      title,
      category,
      assignedTo: form.get('assignedTo'),
      description: String(form.get('description') || '').trim(),
      dueDate: day,
      dueTime: form.get('dueTime') || undefined,
    })
  }

  return <form onSubmit={submitTask} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
    <h4 className="font-semibold">Assign a ward task</h4>
    <WorkflowError error={error} />
    <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="text-sm">Category<select className="input mt-1" name="category" required value={category} onChange={event => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Assigned staff<select className="input mt-1" name="assignedTo" required defaultValue=""><option value="">Choose a staff member</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
      <label className="text-sm">Task<input className="input mt-1" name="title" required maxLength={120} placeholder={category === 'medication' ? 'E.g. Review signed medication order' : category === 'meal' ? 'E.g. Coordinate lunch tray' : 'E.g. Prepare room for handover'} /></label>
      <label className="text-sm">Scheduled time (PHT)<input className="input mt-1" name="dueTime" type="time" /></label>
      <label className="text-sm sm:col-span-2">Staff handover note (optional)<textarea className="input mt-1" name="description" rows={2} maxLength={500} /></label>
    </fieldset>
    {category === 'medication' && <p className="text-sm text-slate-600 dark:text-slate-300">Follow the signed medication order in the patient record. Use this task for staffing and handover.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="submit" className="btn-primary" disabled={pending || !staff.length}>{pending ? 'Assigning…' : 'Assign task'}</button>
      <button type="button" className="btn-secondary" disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

function WardTask({ task, complete, pending }) {
  const done = task.status === 'completed'
  return <li className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <strong className="break-words">{task.title}</strong>
      <span className={`badge ${done ? 'badge-success' : 'badge-gray'}`}>{labelForStage(task.status)}</span>
    </div>
    <p className="text-xs text-slate-600 dark:text-slate-300">{task.assigned_to_name || 'Staff assignment unavailable'}{task.due_time ? ` · ${String(task.due_time).slice(0, 5)} PHT` : ''}</p>
    {task.description && <p className="whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">{task.description}</p>}
    {task.can_complete && !done && <button type="button" className="btn-secondary btn-sm mt-2" disabled={pending} onClick={() => complete(task.id)}>Mark task complete</button>}
  </li>
}

export default function WardOperations() {
  const [day, setDay] = useState(clinicToday)
  const [editingPatient, setEditingPatient] = useState(null)
  const queryClient = useQueryClient()
  const ward = useQuery({
    queryKey: ['labor-ward', day],
    queryFn: ({ signal }) => api.get('/deliveries/ward', { params: { date: day }, signal }).then(response => response.data.data),
    refetchInterval: 30000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['labor-ward'] })
  const assign = useMutation({
    mutationFn: body => api.post('/deliveries/ward/tasks', body),
    onSuccess: async () => { await refresh(); setEditingPatient(null) },
  })
  const complete = useMutation({
    mutationFn: id => api.patch(`/deliveries/ward/tasks/${id}/complete`, {}),
    onSuccess: refresh,
  })
  const admissions = ward.data?.admissions ?? []
  const tasks = ward.data?.tasks ?? []
  const staff = ward.data?.staff ?? []

  return <section aria-labelledby="ward-operations-heading" className="card min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="ward-operations-heading" className="section-title">Ward admissions & daily tasks</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Current admissions and staff assignments for the selected clinic date.</p>
      </div>
      <label className="text-sm">Ward task date<input className="input mt-1" type="date" value={day} disabled={assign.isPending || complete.isPending} onChange={event => { if (event.target.value) { setDay(event.target.value); setEditingPatient(null); assign.reset(); complete.reset() } }} /></label>
    </div>

    <WorkflowError error={complete.error} />
    <QueryState query={ward}>
      {admissions.length ? <ol aria-label="Current ward admissions" className="space-y-3">
        {admissions.map(admission => {
          const patientTasks = tasks.filter(task => task.patient_id === admission.patient_id)
          const admittedAt = new Date(admission.admitted_at)
          return <li key={admission.patient_id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]">{admission.number}</span>
                <div>
                  <h3 className="break-words font-semibold">{admission.patient_name}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{[admission.patient_code, labelForStage(admission.stage), !Number.isNaN(admittedAt.getTime()) ? admissionTime.format(admittedAt) + ' PHT' : null].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/patients/${admission.patient_id}`} className="btn-secondary btn-sm">View patient record</Link>
                <button type="button" className="btn-primary btn-sm" aria-expanded={editingPatient === admission.patient_id} disabled={assign.isPending} onClick={() => { assign.reset(); setEditingPatient(admission.patient_id) }}>Add task</button>
              </div>
            </div>

            {editingPatient === admission.patient_id && <WardTaskForm key={`${admission.patient_id}-${day}`} staff={staff} day={day} pending={assign.isPending} error={assign.error} onSave={body => assign.mutate({ ...body, patientId: admission.patient_id })} onCancel={() => setEditingPatient(null)} />}

            {patientTasks.length ? <div className="grid gap-3 lg:grid-cols-3">
              {categories.map(([category, label]) => {
                const entries = patientTasks.filter(task => task.category === category)
                return entries.length ? <div key={category} className="space-y-2">
                  <h4 className="text-sm font-semibold">{label}</h4>
                  <ul className="space-y-2">{entries.map(task => <WardTask key={task.id} task={task} complete={complete.mutate} pending={complete.isPending} />)}</ul>
                </div> : null
              })}
            </div> : <p className="text-sm text-slate-500 dark:text-slate-400">No ward tasks for this date.</p>}
          </li>
        })}
      </ol> : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No current ward admissions. Recorded labor admissions and open ward visits appear here.</p>}
    </QueryState>
  </section>
}
