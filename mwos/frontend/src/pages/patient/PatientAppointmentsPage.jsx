import FacilityPhoto from '../../components/common/FacilityPhoto'
import { clinicFacilities } from '../../utils/clinicFacilities'
import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import AppIcon from '../../components/common/AppIcon'
import { appointmentLabel, generalAppointments, maternalAppointments, isMaternalAppointment } from '../../utils/patientCare'
import { formatCareDate, formatCareTime } from '../../utils/recordedCare'

export default function PatientAppointmentsPage() {
  const queryClient = useQueryClient()
  const [care, setCare] = useState('general')
  const [form, setForm] = useState({ appointmentType: 'consultation', scheduledDate: '', scheduledTime: '', assignedTo: '', notes: '' })
  const [receipt, setReceipt] = useState(null)
  const patient = useQuery({ queryKey: ['patient-me-appointments'], queryFn: () => api.get('/patients/me').then((response) => response.data.data) })
  const appointments = useQuery({ queryKey: ['patient-appointments'], queryFn: () => api.get('/appointments', { params: { limit: 100 } }).then((response) => response.data.data) })
  const directory = useQuery({ queryKey: ['patient-appointment-directory'], queryFn: () => api.get('/interactions/directory').then((response) => response.data.data) })
  const booking = useMutation({
    mutationFn: (payload) => api.post('/appointments', payload, { timeout: 30000 }).then((response) => ({ ...response.data.data, notification: response.data.notification })),
    onSuccess: (saved) => {
      setReceipt(saved)
      queryClient.invalidateQueries({ queryKey: ['patient-appointments'] })
      queryClient.invalidateQueries({ queryKey: ['patient-dashboard'] })
    },
  })
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); booking.reset() }
  const submit = (event) => {
    event.preventDefault()
    if (booking.isPending || receipt || !patient.data?.id) return
    const pregnancy = (patient.data.pregnancies || []).find((item) => item?.status === 'active')
    booking.mutate({ ...form, patientId: patient.data.id, pregnancyId: isMaternalAppointment(form.appointmentType) ? pregnancy?.id || null : null })
  }
  const options = care === 'maternal' ? maternalAppointments : generalAppointments
  const providers = (directory.data?.staff || []).filter((member) => ['doctor', 'midwife', 'nurse'].includes(member.role))

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="page-title">My appointments</h1><p className="page-sub">Choose a general checkup or pregnancy-related visit. The clinic will confirm provider availability.</p></div></div>
      <FacilityPhoto facility={clinicFacilities.reception} />
    <section className="card" aria-label="Request a clinic appointment">
      <h2 className="section-title flex items-center gap-2"><AppIcon name="calendar" />Request a clinic appointment</h2>
      {patient.isLoading ? <p role="status">Loading your patient record...</p> : patient.isError ? <div role="alert" className="alert-critical">Your patient record could not be loaded. Please refresh before booking.</div> : receipt ? (
        <div role="status" className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100">
          <h3 className="font-semibold">Your appointment request was saved</h3>
          <p className="mt-2">{appointmentLabel(receipt.appointment_type)} | {formatCareDate(receipt.scheduled_date)} | {formatCareTime(receipt.scheduled_time)}</p>
          <p className="mt-2 text-sm">Reference: {receipt.id}. Status: {receipt.status || 'scheduled'}. Wait for the clinic to confirm your visit; you do not need to send this request again.</p>
          {receipt.notification ? <p className="mt-2 text-sm">{receipt.notification.email === 'accepted' ? 'The email server accepted your appointment update. Check your inbox or spam folder; delivery is not guaranteed.' : receipt.notification.email === 'unconfigured' ? 'Your request is saved in MWOS. Email updates are not active because the clinic email sender is not connected yet.' : 'Your request is saved in MWOS, but email delivery could not be confirmed. Check Notifications for the latest update.'}</p> : null}
          <button type="button" className="btn-secondary mt-4" onClick={() => { setReceipt(null); setForm((current) => ({ ...current, scheduledDate: '', scheduledTime: '', notes: '' })); booking.reset() }}>Request another visit</button>
        </div>
      ) : <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div><label htmlFor="appointment-care" className="label">Visit category</label><select id="appointment-care" className="input" value={care} onChange={(event) => { setCare(event.target.value); update('appointmentType', event.target.value === 'maternal' ? 'prenatal' : 'consultation') }}><option value="general">General clinic care</option><option value="maternal">Pregnancy / postnatal care</option></select></div>
          <div><label htmlFor="appointment-type" className="label">Appointment type</label><select id="appointment-type" className="input" value={form.appointmentType} onChange={(event) => update('appointmentType', event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div><label htmlFor="appointment-date" className="label">Preferred date</label><input id="appointment-date" className="input" type="date" required min={new Date().toLocaleDateString('en-CA')} value={form.scheduledDate} onChange={(event) => update('scheduledDate', event.target.value)} /></div>
          <div><label htmlFor="appointment-time" className="label">Preferred time</label><input id="appointment-time" className="input" type="time" required value={form.scheduledTime} onChange={(event) => update('scheduledTime', event.target.value)} /></div>
          <div className="md:col-span-2"><label htmlFor="appointment-provider" className="label">Preferred provider (optional)</label><select id="appointment-provider" className="input" value={form.assignedTo} onChange={(event) => update('assignedTo', event.target.value)}><option value="">Let the clinic assign a provider</option>{providers.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} ({member.role})</option>)}</select>{directory.isError ? <p className="mt-2 text-sm text-slate-500">Provider list unavailable. You can still ask the clinic to assign one.</p> : null}</div>
          <div className="md:col-span-2"><label htmlFor="appointment-notes" className="label">Reason for visit (optional)</label><textarea id="appointment-notes" className="input" maxLength={2000} value={form.notes} onChange={(event) => update('notes', event.target.value)} /></div>
        </div>
        <p className="text-sm text-slate-500">{care === 'general' ? 'No pregnancy details are required for a general checkup.' : 'You can request your first prenatal visit even without an existing pregnancy record. Clinic staff will review your details.'}</p>
        {booking.isError ? <div role="alert" className="alert-critical">{booking.error.response?.data?.message || 'We could not confirm whether your request was saved. Check the list below or contact the clinic before trying again.'}</div> : null}
        <button className="btn-primary" type="submit" disabled={booking.isPending || !patient.data?.id}>{booking.isPending ? 'Saving request...' : 'Send appointment request'}</button>
      </form>}
    </section>
    <section className="card" aria-label="Appointment history"><h2 className="section-title">Your appointment history</h2>
      {appointments.isLoading ? <p role="status">Loading appointments...</p> : appointments.isError ? <div role="alert">Appointments could not be loaded. <button className="btn-secondary" onClick={() => appointments.refetch()}>Try again</button></div> : !appointments.data?.length ? <p className="text-sm text-slate-500">No appointments recorded yet.</p> : <ul className="divide-y divide-slate-200 dark:divide-slate-700">{appointments.data.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{appointmentLabel(item.appointment_type)}</p><p className="mt-1 text-sm text-slate-500">{formatCareDate(item.scheduled_date)} | {formatCareTime(item.scheduled_time)}{item.assigned_to_name ? ` | ${item.assigned_to_name}` : ''}</p></div><span className="badge badge-gray">{item.status.replaceAll('_', ' ')}</span></li>)}</ul>}
    </section>
  </div>
}
