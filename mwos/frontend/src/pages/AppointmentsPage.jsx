// AppointmentsPage.jsx
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export function AppointmentsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ patientId: '', appointmentType: 'prenatal', scheduledDate: '', scheduledTime: '09:00', notes: '' })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => api.get('/appointments', { params: { limit: 50 } }).then(r => r.data.data),
  })

  const { data: patients } = useQuery({
    queryKey: ['patients-list'],
    queryFn: () => api.get('/patients', { params: { limit: 200 } }).then(r => r.data.data),
    enabled: showForm,
  })

  const createMut = useMutation({
    mutationFn: (body) => api.post('/appointments', body),
    onSuccess: () => { qc.invalidateQueries(['appointments']); setShowForm(false); setForm({ patientId: '', appointmentType: 'prenatal', scheduledDate: '', scheduledTime: '09:00', notes: '' }) },
    onError: (err) => setError(err.response?.data?.message || 'Failed to schedule appointment'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/appointments/${id}`, body),
    onSuccess: () => qc.invalidateQueries(['appointments']),
  })

  const statusColor = { scheduled: 'badge-info', confirmed: 'badge-success', completed: 'badge-gray', cancelled: 'badge-danger', no_show: 'badge-warning' }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Appointments</h1><p className="page-sub">{data?.length ?? 0} appointments</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Schedule</button>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Patient</th><th>Date</th><th>Time</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(data || []).map(a => (
                <tr key={a.id}>
                  <td className="font-medium">{a.patient_name}</td>
                  <td>{new Date(a.scheduled_date).toLocaleDateString('en-PH')}</td>
                  <td className="font-mono">{a.scheduled_time?.slice(0, 5)}</td>
                  <td className="capitalize">{a.appointment_type}</td>
                  <td><span className={`badge ${statusColor[a.status] || 'badge-gray'}`}>{a.status}</span></td>
                  <td>
                    {a.status === 'scheduled' && (
                      <div className="flex gap-1">
                        <button onClick={() => updateMut.mutate({ id: a.id, status: 'completed' })} className="btn-secondary btn-sm">✓ Done</button>
                        <button onClick={() => updateMut.mutate({ id: a.id, status: 'cancelled' })} className="btn-danger btn-sm">✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Schedule Appointment</h2><button onClick={() => setShowForm(false)} className="btn-ghost">✕</button></div>
            {error && <div className="alert-critical mb-3 text-sm"><span>⚠️</span><span>{error}</span></div>}
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} className="space-y-3">
              <div>
                <label className="label">Patient</label>
                <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} className="input" required>
                  <option value="">Select patient...</option>
                  {(patients || []).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select value={form.appointmentType} onChange={e => setForm(f => ({ ...f, appointmentType: e.target.value }))} className="input">
                  <option value="prenatal">Prenatal</option><option value="postnatal">Postnatal</option>
                  <option value="consultation">Consultation</option><option value="delivery">Delivery</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date</label><input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="input" required /></div>
                <div><label className="label">Time</label><input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} className="input" required /></div>
              </div>
              <div><label className="label">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">{createMut.isPending ? 'Scheduling...' : 'Schedule'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppointmentsPage
