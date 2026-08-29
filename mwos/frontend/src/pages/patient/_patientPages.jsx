import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'

// ── PATIENT DASHBOARD ─────────────────────────────────────────
export function PatientDashboardPage() {
  const user = useAuthStore(s => s.user)
  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-dashboard'],
    queryFn: () => api.get('/reports/patient-dashboard').then(r => r.data.data),
  })

  if (isLoading) return <div className="flex justify-center py-20"><div className="loading-spinner w-8 h-8" /></div>
  if (error) return <div className="alert-critical"><span>⚠️</span><span>{error.response?.data?.message || 'Failed to load dashboard'}</span></div>

  const d = data || {}

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {user?.firstName}! 👋</h1>
          <p className="page-sub">Your maternal health overview</p>
        </div>
      </div>

      <div className="clinic-hero rounded-[34px] p-6 md:p-8 mb-6">
        <div className="clinic-hero-grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <p className="section-kicker text-white/70">Your care, at a glance</p>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
              A brighter patient portal for visits, medicines, vitals, and emergency support.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-white/80">
              Track appointments, monitor vitals, browse medicines, and reach clinic support from a more polished home screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="hero-chip">Appointments</span>
              <span className="hero-chip">Pharmacy</span>
              <span className="hero-chip">Vitals</span>
              <span className="hero-chip">Emergency</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="clinic-metric">
              <p className="clinic-metric-label">Next appointment</p>
              <p className="clinic-metric-value">
                {d.nextAppointment ? new Date(d.nextAppointment.scheduled_date).toLocaleDateString('en-PH') : 'None'}
              </p>
              <p className="clinic-metric-meta">{d.nextAppointment ? `${d.nextAppointment.appointment_type} appointment` : 'No visit scheduled yet.'}</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Active pregnancy</p>
              <p className="clinic-metric-value">{d.activePregnancy ? 'Active' : 'None'}</p>
              <p className="clinic-metric-meta">{d.activePregnancy ? `EDD ${new Date(d.activePregnancy.edd).toLocaleDateString('en-PH')}` : 'Waiting for the next prenatal record.'}</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Latest BP</p>
              <p className="clinic-metric-value">{d.latestVitals?.bp_systolic ? `${d.latestVitals.bp_systolic}/${d.latestVitals.bp_diastolic}` : '--'}</p>
              <p className="clinic-metric-meta">{d.latestVitals ? new Date(d.latestVitals.visit_date).toLocaleDateString('en-PH') : 'No reading yet.'}</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Open tasks</p>
              <p className="clinic-metric-value">{d.openCareTasks ?? 0}</p>
              <p className="clinic-metric-meta">{d.unreadMessages ?? 0} unread thread(s) with the clinic.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="card bg-rose-50 border-rose-100">
          <p className="text-xs text-rose-600 font-medium mb-1">Next Appointment</p>
          <p className="font-bold text-gray-900 text-sm">
            {d.nextAppointment ? new Date(d.nextAppointment.scheduled_date).toLocaleDateString('en-PH') : 'None scheduled'}
          </p>
          {d.nextAppointment && <p className="text-xs text-gray-500 capitalize mt-0.5">{d.nextAppointment.appointment_type} · {d.nextAppointment.scheduled_time?.slice(0,5)}</p>}
        </div>
        <div className="card bg-purple-50 border-purple-100">
          <p className="text-xs text-purple-600 font-medium mb-1">Active Pregnancy</p>
          <p className="font-bold text-gray-900 text-sm">
            {d.activePregnancy ? `EDD: ${new Date(d.activePregnancy.edd).toLocaleDateString('en-PH')}` : 'None active'}
          </p>
          {d.activePregnancy && <p className="text-xs text-gray-500 mt-0.5">{d.activePregnancy.risk_level} risk</p>}
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 font-medium mb-1">Latest BP</p>
          <p className="font-bold text-gray-900 text-sm font-mono">
            {d.latestVitals?.bp_systolic ? `${d.latestVitals.bp_systolic}/${d.latestVitals.bp_diastolic}` : '—'}
          </p>
          {d.latestVitals && <p className="text-xs text-gray-500 mt-0.5">{new Date(d.latestVitals.visit_date).toLocaleDateString('en-PH')}</p>}
        </div>
        <div className={`card ${d.unpaidAmount > 0 ? 'bg-amber-50 border-amber-100' : ''}`}>
          <p className="text-xs text-amber-600 font-medium mb-1">Unpaid Balance</p>
          <p className="font-bold text-gray-900 text-sm">
            {d.unpaidAmount > 0 ? `₱${d.unpaidAmount.toLocaleString()}` : 'None'}
          </p>
        </div>
      </div>

      <div className="card mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="section-title mb-1">Care Team Messages</h3>
          <p className="text-sm text-gray-500">Stay in touch with the clinic and review the latest follow-up instructions.</p>
          <p className="text-xs text-gray-400 mt-1">{d.unreadMessages ?? 0} unread message threads and {d.openCareTasks ?? 0} active care tasks.</p>
        </div>
        <Link to="/my/interactions" className="btn-primary">
          Open Care Team
        </Link>
      </div>

      {/* Health education preview */}
      <div className="card">
        <h3 className="section-title">Health Tips for You</h3>
        <HealthTipsPreview />
      </div>
    </div>
  )
}

function HealthTipsPreview() {
  const { data } = useQuery({ queryKey: ['education-preview'], queryFn: () => api.get('/education').then(r => r.data.data?.slice(0, 3)) })
  if (!data?.length) return <p className="text-gray-400 text-sm">No tips available yet</p>
  return (
    <div className="space-y-3">
      {data.map(e => (
        <div key={e.id} className="flex gap-3 p-3 bg-rose-50 rounded-lg">
          <span className="text-2xl">📖</span>
          <div>
            <p className="font-medium text-gray-800 text-sm">{e.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{e.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PATIENT APPOINTMENTS ──────────────────────────────────────
export function PatientAppointmentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['patient-appointments'],
    queryFn: () => api.get('/appointments').then(r => r.data.data),
  })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">My Appointments</h1></div>
      <div className="table-container">
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <table className="table">
            <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No appointments found</td></tr>
              ) : (data || []).map(a => (
                <tr key={a.id}>
                  <td>{new Date(a.scheduled_date).toLocaleDateString('en-PH')}</td>
                  <td className="font-mono">{a.scheduled_time?.slice(0,5)}</td>
                  <td className="capitalize">{a.appointment_type}</td>
                  <td><span className={`badge ${a.status === 'scheduled' ? 'badge-info' : a.status === 'completed' ? 'badge-success' : 'badge-gray'}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── PATIENT VITALS ────────────────────────────────────────────
export function PatientVitalsPage() {
  const { data: meData } = useQuery({ queryKey: ['patient-me'], queryFn: () => api.get('/patients/me').then(r => r.data.data) })
  const patientId = meData?.id

  const { data, isLoading } = useQuery({
    queryKey: ['patient-vitals-me'],
    queryFn: () => api.get(`/vitals/patient/${patientId}`).then(r => r.data.data),
    enabled: !!patientId,
  })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">My Vitals</h1></div>
      <div className="table-container">
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <table className="table">
            <thead><tr><th>Date</th><th>BP</th><th>Weight</th><th>FHR</th><th>Status</th></tr></thead>
            <tbody>
              {!(data?.length) ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No vitals recorded yet</td></tr>
              ) : data.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.visit_date).toLocaleDateString('en-PH')}</td>
                  <td className="font-mono">{v.bp_systolic}/{v.bp_diastolic} mmHg</td>
                  <td>{v.weight_kg ? `${v.weight_kg} kg` : '—'}</td>
                  <td>{v.fetal_heart_rate ? `${v.fetal_heart_rate} bpm` : '—'}</td>
                  <td>
                    <span className={`badge ${
                      v.bp_category === 'normal' ? 'badge-success' :
                      ['stage2_hypertension','hypertensive_crisis'].includes(v.bp_category) ? 'badge-danger' : 'badge-warning'
                    }`}>{v.bp_category?.replace(/_/g,' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── PATIENT RECORDS ───────────────────────────────────────────
export function PatientRecordsPage() {
  const { data: meData } = useQuery({ queryKey: ['patient-me'], queryFn: () => api.get('/patients/me').then(r => r.data.data) })
  const patientId = meData?.id

  const { data: labs } = useQuery({ queryKey: ['labs-me'], queryFn: () => api.get(`/emr/labs/${patientId}`).then(r => r.data.data), enabled: !!patientId })
  const { data: rx } = useQuery({ queryKey: ['rx-me'], queryFn: () => api.get(`/emr/prescriptions/${patientId}`).then(r => r.data.data), enabled: !!patientId })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">My Records</h1></div>
      <div className="space-y-6">
        <div className="card">
          <h3 className="section-title">Lab Results</h3>
          {!labs?.length ? <p className="text-gray-400 text-sm">No lab results yet</p> : (
            <div className="space-y-2">
              {labs.map(l => (
                <div key={l.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div><p className="font-medium text-sm">{l.test_name}</p><p className="text-xs text-gray-400">{new Date(l.test_date).toLocaleDateString('en-PH')}</p></div>
                  <div className="text-right"><p className="text-sm font-mono">{l.result_value} {l.unit}</p><span className={`badge ${l.status === 'normal' ? 'badge-success' : 'badge-danger'}`}>{l.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 className="section-title">Prescriptions</h3>
          {!rx?.length ? <p className="text-gray-400 text-sm">No prescriptions yet</p> : (
            <div className="space-y-2">
              {rx.map(r => (
                <div key={r.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-sm">{r.medication_name}</p>
                  <p className="text-xs text-gray-500">{r.dosage} · {r.frequency} · {r.route}</p>
                  {r.instructions && <p className="text-xs text-gray-400 mt-1">{r.instructions}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PATIENT EDUCATION ─────────────────────────────────────────
export function PatientEducationPage() {
  const { data, isLoading } = useQuery({ queryKey: ['education'], queryFn: () => api.get('/education').then(r => r.data.data) })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Health Tips</h1></div>
      {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data || []).map(e => (
            <div key={e.id} className="card-hover border-rose-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge bg-rose-100 text-rose-700 capitalize">{e.category || 'General'}</span>
                {e.trimester_target !== 'all' && <span className="badge badge-gray">{e.trimester_target}</span>}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{e.title}</h3>
              <p className="text-sm text-gray-600">{e.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PATIENT PROFILE ───────────────────────────────────────────
export function PatientProfilePage() {
  const user = useAuthStore(s => s.user)
  const { data, isLoading } = useQuery({ queryKey: ['patient-me'], queryFn: () => api.get('/patients/me').then(r => r.data.data) })

  if (isLoading) return <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div>
  const p = data || {}

  return (
    <div>
      <div className="page-header"><h1 className="page-title">My Profile</h1></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title">Personal Information</h3>
          <div className="space-y-3 text-sm">
            {[
              ['Full Name', `${p.first_name} ${p.last_name}`],
              ['Date of Birth', p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-PH') : '—'],
              ['Blood Type', p.blood_type || '—'],
              ['Civil Status', p.civil_status || '—'],
              ['PhilHealth ID', p.philhealth_id || '—'],
              ['Address', p.address ? `${p.address}, ${p.city}` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <span className="text-gray-500 w-36 flex-shrink-0">{label}:</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="section-title">Medical Information</h3>
          <div className="space-y-3 text-sm">
            {[
              ['Allergies', p.allergies || 'None known'],
              ['Conditions', p.existing_conditions || 'None'],
              ['Medications', p.current_medications || 'None'],
              ['Emergency Contact', p.emergency_contact_name || '—'],
              ['Emergency Phone', p.emergency_contact_phone || '—'],
              ['Risk Level', p.risk_level || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <span className="text-gray-500 w-36 flex-shrink-0">{label}:</span>
                <span className={`font-medium ${label === 'Allergies' && value !== 'None known' ? 'text-red-700' : 'text-gray-900'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
