import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

const tabs = ['Overview', 'Vitals', 'Pregnancies', 'Labs', 'Prescriptions', 'Deliveries', 'Billing']

export default function PatientDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState('Overview')
  const [vitalForm, setVitalForm] = useState({ visitDate: new Date().toISOString().split('T')[0], bpSystolic: '', bpDiastolic: '', weightKg: '', fetalHeartRate: '', fetalMovement: 'present', notes: '' })
  const [vitalError, setVitalError] = useState('')
  const [vitalAlerts, setVitalAlerts] = useState([])

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['patient-summary', id],
    queryFn: () => api.get(`/patients/${id}/summary`).then(r => r.data.data),
  })

  const { data: vitalsData } = useQuery({
    queryKey: ['vitals', id],
    queryFn: () => api.get(`/vitals/patient/${id}`).then(r => r.data.data),
    enabled: tab === 'Vitals',
  })

  const { data: labsData } = useQuery({
    queryKey: ['labs', id],
    queryFn: () => api.get(`/emr/labs/${id}`).then(r => r.data.data),
    enabled: tab === 'Labs',
  })

  const { data: rxData } = useQuery({
    queryKey: ['prescriptions', id],
    queryFn: () => api.get(`/emr/prescriptions/${id}`).then(r => r.data.data),
    enabled: tab === 'Prescriptions',
  })

  const { data: deliveriesData } = useQuery({
    queryKey: ['deliveries', id],
    queryFn: () => api.get(`/deliveries/patient/${id}`).then(r => r.data.data),
    enabled: tab === 'Deliveries',
  })

  const { data: billingData } = useQuery({
    queryKey: ['billing-patient', id],
    queryFn: () => api.get('/billing', { params: { patientId: id } }).then(r => r.data.data),
    enabled: tab === 'Billing',
  })

  const vitalMutation = useMutation({
    mutationFn: (body) => api.post('/vitals', body),
    onSuccess: (res) => {
      qc.invalidateQueries(['vitals', id])
      qc.invalidateQueries(['patient-summary', id])
      setVitalAlerts(res.data.alerts || [])
      setVitalForm({ visitDate: new Date().toISOString().split('T')[0], bpSystolic: '', bpDiastolic: '', weightKg: '', fetalHeartRate: '', fetalMovement: 'present', notes: '' })
      setVitalError('')
    },
    onError: (err) => setVitalError(err.response?.data?.message || 'Failed to record vitals'),
  })

  const handleVitalSubmit = (e) => {
    e.preventDefault()
    setVitalError('')
    setVitalAlerts([])
    vitalMutation.mutate({
      patientId: id,
      pregnancyId: summary?.activePregnancy?.id || null,
      ...vitalForm,
    })
  }

  if (isLoading) return <div className="flex justify-center py-20"><div className="loading-spinner w-8 h-8" /></div>
  if (error) return <div className="alert-critical"><span>⚠️</span><span>{error.response?.data?.message || 'Patient not found'}</span></div>

  const patient = summary?.patient
  if (!patient) return null

  const bpColor = (cat) => ({
    normal: 'badge-success', elevated: 'badge-warning',
    stage1_hypertension: 'badge-warning', stage2_hypertension: 'badge-danger',
    hypertensive_crisis: 'badge-danger',
  })[cat] || 'badge-gray'

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/patients" className="btn-ghost btn-sm">← Back</Link>
          <div>
            <h1 className="page-title">{patient.first_name} {patient.last_name}</h1>
            <p className="page-sub">DOB: {new Date(patient.date_of_birth).toLocaleDateString('en-PH')} · {patient.blood_type || 'Blood type unknown'}</p>
          </div>
        </div>
        <span className={`badge text-sm px-3 py-1 ${patient.risk_level === 'high' ? 'badge-danger' : patient.risk_level === 'moderate' ? 'badge-warning' : 'badge-success'}`}>
          {patient.risk_level} risk
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card text-sm">
          <p className="text-gray-500 text-xs mb-1">Phone</p>
          <p className="font-medium">{patient.phone || '—'}</p>
        </div>
        <div className="card text-sm">
          <p className="text-gray-500 text-xs mb-1">PhilHealth</p>
          <p className="font-medium">{patient.philhealth_id || '—'}</p>
        </div>
        <div className="card text-sm">
          <p className="text-gray-500 text-xs mb-1">Emergency Contact</p>
          <p className="font-medium">{patient.emergency_contact_name || '—'}</p>
          <p className="text-gray-400">{patient.emergency_contact_phone || ''}</p>
        </div>
        <div className="card text-sm">
          <p className="text-gray-500 text-xs mb-1">Allergies</p>
          <p className="font-medium text-red-700">{patient.allergies || 'None known'}</p>
        </div>
      </div>

      {/* Active pregnancy banner */}
      {summary?.activePregnancy && (
        <div className="alert-info mb-6">
          <span className="text-xl">🤰</span>
          <div>
            <p className="font-semibold">Active Pregnancy</p>
            <p className="text-sm">EDD: {new Date(summary.activePregnancy.edd).toLocaleDateString('en-PH')} · Risk: {summary.activePregnancy.risk_level}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="section-title">Latest Vitals</h3>
            {summary.recentVitals?.length === 0 ? <p className="text-gray-400 text-sm">No vitals recorded yet</p> : (
              <div className="space-y-2">
                {summary.recentVitals?.slice(0, 3).map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{new Date(v.visit_date).toLocaleDateString('en-PH')}</p>
                      <p className="text-xs text-gray-500">BP: {v.bp_systolic}/{v.bp_diastolic} · Weight: {v.weight_kg}kg</p>
                    </div>
                    <span className={`badge ${bpColor(v.bp_category)}`}>{v.bp_category?.replace(/_/g,' ') || 'normal'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3 className="section-title">Upcoming Appointments</h3>
            {summary.upcomingAppointments?.length === 0 ? <p className="text-gray-400 text-sm">No upcoming appointments</p> : (
              <div className="space-y-2">
                {summary.upcomingAppointments?.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{new Date(a.scheduled_date).toLocaleDateString('en-PH')}</p>
                      <p className="text-xs text-gray-500 capitalize">{a.appointment_type} · {a.scheduled_time?.slice(0,5)}</p>
                    </div>
                    <span className="badge badge-info">{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card col-span-1 lg:col-span-2">
            <h3 className="section-title">Medical History</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Conditions: </span>{patient.existing_conditions || 'None'}</div>
              <div><span className="text-gray-500">Medications: </span>{patient.current_medications || 'None'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Vitals tab */}
      {tab === 'Vitals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <h3 className="section-title">Vitals History</h3>
            {!vitalsData || vitalsData.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">No vitals recorded yet</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>Date</th><th>BP</th><th>Weight</th><th>FHR</th><th>FHR</th><th>Status</th></tr></thead>
                  <tbody>
                    {vitalsData.map(v => (
                      <tr key={v.id}>
                        <td>{new Date(v.visit_date).toLocaleDateString('en-PH')}</td>
                        <td className="font-mono">{v.bp_systolic}/{v.bp_diastolic}</td>
                        <td>{v.weight_kg ? `${v.weight_kg} kg` : '—'}</td>
                        <td>{v.fetal_heart_rate ? `${v.fetal_heart_rate} bpm` : '—'}</td>
                        <td>{v.fetal_movement || '—'}</td>
                        <td><span className={`badge ${bpColor(v.bp_category)}`}>{v.bp_category?.replace(/_/g,' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title">Record Vitals</h3>
            {vitalAlerts.length > 0 && (
              <div className="mb-4 space-y-2">
                {vitalAlerts.map((a, i) => (
                  <div key={i} className={a.type === 'critical' ? 'alert-critical' : 'alert-warning'}>
                    <span>⚠️</span><span className="text-sm">{a.message}</span>
                  </div>
                ))}
              </div>
            )}
            {vitalError && <div className="alert-critical mb-3 text-sm"><span>⚠️</span><span>{vitalError}</span></div>}
            <form onSubmit={handleVitalSubmit} className="space-y-3">
              <div>
                <label className="label">Visit Date</label>
                <input type="date" value={vitalForm.visitDate} onChange={e => setVitalForm(f => ({ ...f, visitDate: e.target.value }))} className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">BP Systolic</label>
                  <input type="number" value={vitalForm.bpSystolic} onChange={e => setVitalForm(f => ({ ...f, bpSystolic: e.target.value }))} className="input" placeholder="120" />
                </div>
                <div>
                  <label className="label text-xs">BP Diastolic</label>
                  <input type="number" value={vitalForm.bpDiastolic} onChange={e => setVitalForm(f => ({ ...f, bpDiastolic: e.target.value }))} className="input" placeholder="80" />
                </div>
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input type="number" step="0.1" value={vitalForm.weightKg} onChange={e => setVitalForm(f => ({ ...f, weightKg: e.target.value }))} className="input" placeholder="55.0" />
              </div>
              <div>
                <label className="label">Fetal Heart Rate (bpm)</label>
                <input type="number" value={vitalForm.fetalHeartRate} onChange={e => setVitalForm(f => ({ ...f, fetalHeartRate: e.target.value }))} className="input" placeholder="140" />
              </div>
              <div>
                <label className="label">Fetal Movement</label>
                <select value={vitalForm.fetalMovement} onChange={e => setVitalForm(f => ({ ...f, fetalMovement: e.target.value }))} className="input">
                  <option value="present">Present</option>
                  <option value="decreased">Decreased</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={vitalForm.notes} onChange={e => setVitalForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} />
              </div>
              <button type="submit" disabled={vitalMutation.isPending} className="btn-primary w-full justify-center">
                {vitalMutation.isPending ? 'Saving...' : 'Save Vitals'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Labs */}
      {tab === 'Labs' && (
        <div className="card">
          <h3 className="section-title">Laboratory Results</h3>
          {!labsData || labsData.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No lab results recorded</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Test</th><th>Date</th><th>Result</th><th>Reference</th><th>Status</th></tr></thead>
                <tbody>
                  {labsData.map(l => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.test_name}</td>
                      <td>{new Date(l.test_date).toLocaleDateString('en-PH')}</td>
                      <td>{l.result_value} {l.unit}</td>
                      <td className="text-gray-400 text-xs">{l.reference_range || '—'}</td>
                      <td><span className={`badge ${l.status === 'normal' ? 'badge-success' : l.status === 'critical' ? 'badge-danger' : 'badge-warning'}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Prescriptions */}
      {tab === 'Prescriptions' && (
        <div className="card">
          <h3 className="section-title">Prescriptions</h3>
          {!rxData || rxData.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No prescriptions recorded</p>
          ) : (
            <div className="space-y-3">
              {rxData.map(rx => (
                <div key={rx.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{rx.medication_name}</p>
                      <p className="text-sm text-gray-600">{rx.dosage} · {rx.frequency} · {rx.route}</p>
                      <p className="text-xs text-gray-400 mt-1">Duration: {rx.duration} · By: {rx.prescribed_by_name}</p>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(rx.prescribed_date).toLocaleDateString('en-PH')}</p>
                  </div>
                  {rx.instructions && <p className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">{rx.instructions}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deliveries */}
      {tab === 'Deliveries' && (
        <div className="card">
          <h3 className="section-title">Delivery Records</h3>
          {!deliveriesData || deliveriesData.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No delivery records</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>GA</th><th>Birth Weight</th><th>APGAR</th><th>Attendant</th></tr></thead>
                <tbody>
                  {deliveriesData.map(d => (
                    <tr key={d.id}>
                      <td>{new Date(d.delivery_date).toLocaleDateString('en-PH')}</td>
                      <td><span className={`badge ${d.delivery_type === 'NSD' ? 'badge-success' : 'badge-warning'}`}>{d.delivery_type}</span></td>
                      <td>{d.gestational_age_at_delivery ? `${d.gestational_age_at_delivery} wks` : '—'}</td>
                      <td>{d.birth_weight_kg ? `${d.birth_weight_kg} kg` : '—'}</td>
                      <td>{d.apgar_1min}/{d.apgar_5min}</td>
                      <td>{d.birth_attendant_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Billing */}
      {tab === 'Billing' && (
        <div className="card">
          <h3 className="section-title">Billing History</h3>
          {!billingData || billingData.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No billing records</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Date</th><th>Service</th><th>Amount</th><th>PhilHealth</th><th>Status</th></tr></thead>
                <tbody>
                  {billingData.map(b => (
                    <tr key={b.id}>
                      <td>{new Date(b.bill_date).toLocaleDateString('en-PH')}</td>
                      <td>{b.service_type || '—'}</td>
                      <td>₱{parseFloat(b.total_amount).toLocaleString()}</td>
                      <td>{b.philhealth_amount > 0 ? `₱${parseFloat(b.philhealth_amount).toLocaleString()}` : '—'}</td>
                      <td><span className={`badge ${b.payment_status === 'paid' ? 'badge-success' : b.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{b.payment_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
