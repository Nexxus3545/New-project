import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const APPOINTMENT_TYPES = {
  prenatal: 'Prenatal',
  postnatal: 'Postnatal',
  consultation: 'Consultation',
  delivery: 'Delivery',
}

const TODAY_KEY = new Date().toLocaleDateString('en-CA')
const QUICK_BOOKING_DEFAULT = {
  patientId: '',
  assignedTo: '',
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

const formatSelectedDate = (value) => {
  if (!value) return 'Today'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Today'
  return date.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatTimeLabel = (value) => (value ? value.slice(0, 5) : '--')

export default function ClinicControlBoard({ appointments = [], patients = [] }) {
  const qc = useQueryClient()
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDateKey, setSelectedDateKey] = useState(TODAY_KEY)
  const [bookingForm, setBookingForm] = useState(QUICK_BOOKING_DEFAULT)
  const [bookingError, setBookingError] = useState('')

  const { data: directory } = useQuery({
    queryKey: ['dashboard-directory'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const bookingMutation = useMutation({
    mutationFn: (body) => api.post('/appointments', body),
    onMutate: () => setBookingError(''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['dashboard-upcoming-appointments'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      setBookingForm(QUICK_BOOKING_DEFAULT)
      setBookingError('')
    },
    onError: (error) => {
      setBookingError(error.response?.data?.message || 'Unable to book the appointment')
    },
  })

  const careTeam = useMemo(() => {
    const source = Array.isArray(directory?.staff) ? directory.staff : []
    return source.filter((member) => ['doctor', 'midwife', 'nurse'].includes(member.role)).slice(0, 4)
  }, [directory])

  const appointmentByDate = useMemo(() => {
    return appointments.reduce((acc, appointment) => {
      const key = toDateKey(appointment.scheduled_date)
      if (!key) return acc
      if (!acc[key]) acc[key] = []
      acc[key].push(appointment)
      return acc
    }, {})
  }, [appointments])

  const monthLabel = calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

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
        day: date.getDate(),
        inMonth: date.getMonth() === calendarMonth.getMonth(),
        appointments: appointmentByDate[key] || [],
      }
    })
  }, [appointmentByDate, calendarMonth])

  const selectedDateAppointments = appointmentByDate[selectedDateKey] || []
  const selectedDateLabel = formatSelectedDate(selectedDateKey)

  const moveMonth = (direction) => {
    setCalendarMonth((current) => {
      const next = new Date(current)
      next.setMonth(current.getMonth() + direction)
      return next
    })
  }

  const handleBookingSubmit = (event) => {
    event.preventDefault()
    if (!bookingForm.patientId || !bookingForm.scheduledDate || !bookingForm.scheduledTime) {
      setBookingError('Select a patient, date, and time before booking.')
      return
    }

    bookingMutation.mutate({
      patientId: bookingForm.patientId,
      assignedTo: bookingForm.assignedTo || undefined,
      appointmentType: bookingForm.appointmentType,
      scheduledDate: bookingForm.scheduledDate,
      scheduledTime: bookingForm.scheduledTime,
      notes: bookingForm.notes,
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Clinic calendar</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{monthLabel}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveMonth(-1)} className="btn-secondary btn-sm rounded-full">Prev</button>
            <button type="button" onClick={() => moveMonth(1)} className="btn-secondary btn-sm rounded-full">Next</button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-2">
          {calendarCells.map((cell) => {
            const isSelected = cell.key === selectedDateKey
            const isToday = cell.key === TODAY_KEY
            const count = cell.appointments.length

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDateKey(cell.key)}
                className={`min-h-[108px] rounded-[22px] border p-3 text-left transition ${
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
                  {count ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">{count}</span>
                  ) : null}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {count ? `${cell.appointments[0].patient_name || 'Visit'} - ${formatTimeLabel(cell.appointments[0].scheduled_time)}` : 'Open slot'}
                </p>
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Selected day</p>
              <h4 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">{selectedDateLabel}</h4>
            </div>
            <span className="badge badge-gray">{selectedDateAppointments.length} visits</span>
          </div>
          <div className="mt-3 space-y-2">
            {selectedDateAppointments.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No scheduled visits for this date.</p>
            ) : (
              selectedDateAppointments.slice(0, 3).map((appointment) => (
                <div key={appointment.id} className="rounded-2xl border border-white/80 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{appointment.patient_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {APPOINTMENT_TYPES[appointment.appointment_type] || appointment.appointment_type} - {formatTimeLabel(appointment.scheduled_time)}
                      </p>
                    </div>
                    <span className="badge badge-gray capitalize">{appointment.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Care team</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Doctors and midwives</h3>
          </div>
          <span className="badge badge-gray">{careTeam.length}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {careTeam.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No team members available.</p>
          ) : (
            careTeam.map((member) => (
              <div key={member.id} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-violet-100 text-sm font-semibold text-[#8b2154] dark:from-rose-400/20 dark:to-violet-400/20 dark:text-rose-100">
                  {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{member.first_name} {member.last_name}</p>
                  <p className="text-xs capitalize text-slate-500">{member.role}</p>
                </div>
                <span className="badge badge-gray capitalize">{member.activity_status || 'online'}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[30px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Quick booking</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Book appointment</h3>
          </div>
          <span className="badge badge-info">Live</span>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleBookingSubmit}>
          <div>
            <label className="label">Patient</label>
            <select
              className="input"
              value={bookingForm.patientId}
              onChange={(event) => setBookingForm((current) => ({ ...current, patientId: event.target.value }))}
            >
              <option value="">Select patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} {patient.patient_code ? `- ${patient.patient_code}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Provider</label>
              <select
                className="input"
                value={bookingForm.assignedTo}
                onChange={(event) => setBookingForm((current) => ({ ...current, assignedTo: event.target.value }))}
              >
                <option value="">Any available provider</option>
                {careTeam.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={bookingForm.appointmentType}
                onChange={(event) => setBookingForm((current) => ({ ...current, appointmentType: event.target.value }))}
              >
                {Object.entries(APPOINTMENT_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={bookingForm.scheduledDate}
                onChange={(event) => setBookingForm((current) => ({ ...current, scheduledDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">Time</label>
              <input
                className="input"
                type="time"
                value={bookingForm.scheduledTime}
                onChange={(event) => setBookingForm((current) => ({ ...current, scheduledTime: event.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[96px]"
              value={bookingForm.notes}
              onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Reason for visit, reminders, or triage notes."
            />
          </div>

          {bookingError ? <div className="alert-critical text-sm">{bookingError}</div> : null}

          <button type="submit" className="btn-primary w-full justify-center" disabled={bookingMutation.isPending}>
            {bookingMutation.isPending ? 'Booking...' : 'Book appointment'}
          </button>
        </form>
      </div>
    </div>
  )
}
