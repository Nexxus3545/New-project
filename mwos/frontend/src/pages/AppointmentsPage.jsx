import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import CoverCard from '../components/common/CoverCard'

const APPOINTMENT_TYPES = {
  prenatal: 'Prenatal',
  postnatal: 'Postnatal',
  consultation: 'Consultation',
  delivery: 'Delivery',
}

const STATUS_TONE = {
  scheduled: 'badge-info',
  confirmed: 'badge-success',
  completed: 'badge-gray',
  cancelled: 'badge-danger',
  no_show: 'badge-warning',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TODAY_KEY = new Date().toLocaleDateString('en-CA')

const DEFAULT_FORM = {
  patientId: '',
  appointmentType: 'prenatal',
  scheduledDate: TODAY_KEY,
  scheduledTime: '09:00',
  notes: '',
}

const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const formatDateLabel = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
}

const formatTimeLabel = (value) => (value ? value.slice(0, 5) : '--')

export default function AppointmentsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDateKey, setSelectedDateKey] = useState(TODAY_KEY)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => api.get('/appointments', { params: { limit: 50 } }).then((r) => r.data.data),
  })

  const { data: patients } = useQuery({
    queryKey: ['patients-list'],
    queryFn: () => api.get('/patients', { params: { limit: 200 } }).then((r) => r.data.data),
    enabled: showForm,
  })

  const createMut = useMutation({
    mutationFn: (body) => api.post('/appointments', body),
    onSuccess: () => {
      qc.invalidateQueries(['appointments'])
      setShowForm(false)
      setForm(DEFAULT_FORM)
      setError('')
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to schedule appointment'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/appointments/${id}`, body),
    onSuccess: () => qc.invalidateQueries(['appointments']),
  })

  const appointments = data || []

  const appointmentByDate = useMemo(() => {
    return appointments.reduce((acc, appointment) => {
      const key = toDateKey(appointment.scheduled_date)
      if (!acc[key]) acc[key] = []
      acc[key].push(appointment)
      return acc
    }, {})
  }, [appointments])

  const metrics = useMemo(() => {
    const scheduled = appointments.filter((item) => item.status === 'scheduled').length
    const confirmed = appointments.filter((item) => item.status === 'confirmed').length
    const completed = appointments.filter((item) => item.status === 'completed').length
    const todayCount = appointments.filter((item) => toDateKey(item.scheduled_date) === TODAY_KEY).length

    return [
      { label: 'Today', value: todayCount, helper: 'Appointments booked for today' },
      { label: 'Scheduled', value: scheduled, helper: 'Waiting for clinic action' },
      { label: 'Confirmed', value: confirmed, helper: 'Ready for visit' },
      { label: 'Completed', value: completed, helper: 'Closed records' },
    ]
  }, [appointments])

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const start = new Date(firstOfMonth)
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const key = toDateKey(date)

      return {
        key,
        date,
        day: date.getDate(),
        inMonth: date.getMonth() === calendarMonth.getMonth(),
        appointments: appointmentByDate[key] || [],
      }
    })
  }, [appointmentByDate, calendarMonth])

  const selectedAppointments = appointmentByDate[selectedDateKey] || []

  const monthLabel = calendarMonth.toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })

  const openForm = (dateKey = selectedDateKey) => {
    setError('')
    setShowForm(true)
    setForm((current) => ({
      ...current,
      scheduledDate: dateKey || TODAY_KEY,
    }))
  }

  const closeForm = () => {
    setShowForm(false)
    setError('')
    setForm(DEFAULT_FORM)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    createMut.mutate(form)
  }

  const handleCellClick = (cellKey) => {
    setSelectedDateKey(cellKey)
    if (showForm) {
      setForm((current) => ({ ...current, scheduledDate: cellKey }))
    }
  }

  const moveMonth = (direction) => {
    setCalendarMonth((current) => {
      const next = new Date(current)
      next.setMonth(current.getMonth() + direction)
      return next
    })
  }

  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((left, right) => {
      const leftKey = `${left.scheduled_date || ''} ${left.scheduled_time || ''}`
      const rightKey = `${right.scheduled_date || ''} ${right.scheduled_time || ''}`
      return leftKey.localeCompare(rightKey)
    })
  }, [appointments])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-[#fff6fb] via-white to-[#f4efff] p-6 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b44b79]/70 dark:text-[#e8b4d1]/80">Appointment control</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">Appointments</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
                Manage prenatal, postnatal, consultation, and delivery bookings with a calendar-first scheduling board.
              </p>
            </div>
            <button onClick={() => openForm(selectedDateKey)} className="btn-primary self-start xl:self-auto">
              + Schedule Appointment
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{metric.value}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.helper}</p>
              </div>
            ))}
          </div>
        </div>

        <CoverCard
          image="/reference/appointments-hero.jpg"
          label="Visit planning"
          title="A schedule that feels organized, readable, and calm."
          description="Warm image-led scheduling helps staff quickly scan prenatal, postnatal, consultation, and delivery bookings."
          chips={['Calendar', 'Bookings', 'Follow-up']}
          tone="lavender"
          className="h-full min-h-[22rem]"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Calendar</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{monthLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveMonth(-1)} className="btn-secondary rounded-full px-4 py-2">
                  Prev
                </button>
                <button type="button" onClick={() => moveMonth(1)} className="btn-secondary rounded-full px-4 py-2">
                  Next
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2">
              {calendarCells.map((cell) => {
                const isSelected = cell.key === selectedDateKey
                const isToday = cell.key === TODAY_KEY
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => handleCellClick(cell.key)}
                    className={`min-h-[128px] rounded-[22px] border p-3 text-left transition ${
                      isSelected
                        ? 'border-[var(--accent)] bg-rose-50 shadow-sm dark:bg-rose-950/30'
                        : cell.inMonth
                          ? 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:bg-slate-900'
                          : 'border-slate-100 bg-slate-50/70 text-slate-400 dark:border-slate-800 dark:bg-slate-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${isToday ? 'text-[var(--accent)]' : 'text-slate-900 dark:text-slate-50'}`}>
                        {cell.day}
                      </span>
                      {cell.appointments.length ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {cell.appointments.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {cell.appointments.slice(0, 3).map((appointment) => (
                        <div
                          key={appointment.id}
                          className={`rounded-xl border px-3 py-2 text-xs shadow-sm ${
                            STATUS_TONE[appointment.status] === 'badge-danger'
                              ? 'border-rose-200 bg-rose-50 text-rose-800'
                              : STATUS_TONE[appointment.status] === 'badge-success'
                                ? 'border-violet-200 bg-violet-50 text-violet-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          <p className="font-semibold">{appointment.patient_name}</p>
                          <p className="mt-1 text-[11px] opacity-80">
                            {formatTimeLabel(appointment.scheduled_time)} - {APPOINTMENT_TYPES[appointment.appointment_type] || appointment.appointment_type}
                          </p>
                        </div>
                      ))}
                      {cell.appointments.length > 3 ? (
                        <p className="text-xs text-slate-400">+{cell.appointments.length - 3} more</p>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Appointments feed</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Upcoming appointments</h2>
              </div>
              <span className="badge badge-gray">{appointments.length}</span>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="loading-spinner h-8 w-8" />
              </div>
            ) : sortedAppointments.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">No appointments have been scheduled yet.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {sortedAppointments.slice(0, 8).map((appointment) => (
                  <div key={appointment.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{appointment.patient_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {APPOINTMENT_TYPES[appointment.appointment_type] || appointment.appointment_type} - {formatDateLabel(appointment.scheduled_date)} {formatTimeLabel(appointment.scheduled_time)}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">{appointment.notes || 'No notes recorded.'}</p>
                      </div>
                      <span className={`badge ${STATUS_TONE[appointment.status] || 'badge-gray'}`}>{appointment.status}</span>
                    </div>

                    {appointment.status === 'scheduled' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateMut.mutate({ id: appointment.id, status: 'completed' })}
                          className="btn-secondary btn-sm"
                        >
                          Mark done
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMut.mutate({ id: appointment.id, status: 'cancelled' })}
                          className="btn-danger btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Booking form</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Book Appointment</h2>
              </div>
              <span className="badge badge-info">{formatDateLabel(selectedDateKey)}</span>
            </div>

            {error ? <div className="alert-critical mt-4 text-sm">{error}</div> : null}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="label">Patient</label>
                <select
                  value={form.patientId}
                  onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
                  className="input"
                  required
                >
                  <option value="">Select patient...</option>
                  {(patients || []).map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.first_name} {patient.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Type</label>
                  <select
                    value={form.appointmentType}
                    onChange={(event) => setForm((current) => ({ ...current, appointmentType: event.target.value }))}
                    className="input"
                  >
                    <option value="prenatal">Prenatal</option>
                    <option value="postnatal">Postnatal</option>
                    <option value="consultation">Consultation</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="label">Time</label>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(event) => setForm((current) => ({ ...current, scheduledTime: event.target.value }))}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(event) => {
                      const nextDate = event.target.value
                      setForm((current) => ({ ...current, scheduledDate: nextDate }))
                      setSelectedDateKey(nextDate)
                    }}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Quick day</label>
                  <button
                    type="button"
                    onClick={() => openForm(selectedDateKey)}
                    className="btn-secondary w-full justify-center"
                  >
                    Use selected day
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="input"
                  rows={4}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">
                  {createMut.isPending ? 'Scheduling...' : 'Schedule'}
                </button>
                <button type="button" onClick={closeForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Selected day</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">{formatDateLabel(selectedDateKey)}</h2>
              </div>
              <button type="button" onClick={() => openForm(selectedDateKey)} className="btn-secondary btn-sm">
                Book this day
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedAppointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments are scheduled for this day.</p>
              ) : (
                selectedAppointments.map((appointment) => (
                  <div key={appointment.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{appointment.patient_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTimeLabel(appointment.scheduled_time)} - {APPOINTMENT_TYPES[appointment.appointment_type] || appointment.appointment_type}
                        </p>
                      </div>
                      <span className={`badge ${STATUS_TONE[appointment.status] || 'badge-gray'}`}>{appointment.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Schedule Appointment</h2>
                <p className="text-sm text-slate-500">Book a visit for the selected patient and day.</p>
              </div>
              <button onClick={closeForm} className="btn-ghost">
                Close
              </button>
            </div>
            <div className="p-5">
              {error ? <div className="alert-critical mb-3 text-sm">{error}</div> : null}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="label">Patient</label>
                  <select
                    value={form.patientId}
                    onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
                    className="input"
                    required
                  >
                    <option value="">Select patient...</option>
                    {(patients || []).map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.first_name} {patient.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select
                    value={form.appointmentType}
                    onChange={(event) => setForm((current) => ({ ...current, appointmentType: event.target.value }))}
                    className="input"
                  >
                    <option value="prenatal">Prenatal</option>
                    <option value="postnatal">Postnatal</option>
                    <option value="consultation">Consultation</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Date</label>
                    <input
                      type="date"
                      value={form.scheduledDate}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Time</label>
                    <input
                      type="time"
                      value={form.scheduledTime}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledTime: event.target.value }))}
                      className="input"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="input"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">
                    {createMut.isPending ? 'Scheduling...' : 'Schedule'}
                  </button>
                  <button type="button" onClick={closeForm} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
