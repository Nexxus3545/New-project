import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import api from '../../utils/api'
import PregnancyWireframeScene from '../../components/patient/PregnancyWireframeScene'
import RealtimeVitalsPanel from '../../components/patient/RealtimeVitalsPanel'

const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

export default function PatientReportsPage() {
  const { data: patient, isLoading: patientLoading } = useQuery({
    queryKey: ['patient-me-reports'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['patient-dashboard-reports'],
    queryFn: () => api.get('/reports/patient-dashboard').then((response) => response.data.data),
  })

  const { data: vitals, isLoading: vitalsLoading } = useQuery({
    queryKey: ['patient-vitals-reports', patient?.id],
    queryFn: () => api.get(`/vitals/patient/${patient.id}`).then((response) => response.data.data),
    enabled: !!patient?.id,
  })

  const { data: education = [], isLoading: educationLoading } = useQuery({
    queryKey: ['patient-education-reports'],
    queryFn: () => api.get('/education').then((response) => response.data.data),
  })

  if (patientLoading || dashboardLoading || vitalsLoading || educationLoading) {
    return <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
  }

  const chartData = [...(vitals || [])].slice(0, 5).reverse().map((item) => ({
    date: formatDate(item.visit_date),
    systolic: item.bp_systolic || 0,
    diastolic: item.bp_diastolic || 0,
  }))

  const latestVitals = (vitals || [])[0]
  const featuredTips = education.slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Moving vitals, a 3D pregnancy guide, and record highlights in the same patient portal.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card"><p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Verified docs</p><p className="mt-3 text-3xl font-semibold text-gray-900">{dashboard?.documentSummary?.verified || 0}</p></div>
        <div className="card"><p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Unread threads</p><p className="mt-3 text-3xl font-semibold text-gray-900">{dashboard?.unreadMessages || 0}</p></div>
        <div className="card"><p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Open tasks</p><p className="mt-3 text-3xl font-semibold text-gray-900">{dashboard?.openCareTasks || 0}</p></div>
        <div className="card"><p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Clinic rating</p><p className="mt-3 text-3xl font-semibold text-gray-900">{Number(dashboard?.reviewSummary?.average_rating || 0).toFixed(2)}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <RealtimeVitalsPanel
          latestVitals={latestVitals}
          activePregnancy={dashboard?.activePregnancy}
          title="Realtime vitals report"
        />
        <PregnancyWireframeScene
          dashboard={dashboard}
          latestVitals={latestVitals}
          tips={featuredTips}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="card">
          <h3 className="section-title">Vitals trend</h3>
          {!chartData.length ? (
            <p className="mt-4 text-sm text-gray-500">No vitals trend is available yet.</p>
          ) : (
            <div className="mt-5 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: -24, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="systolic" stroke="#c98994" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="diastolic" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title">Care summary</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-600">
              <p>Next appointment: <span className="font-medium text-gray-900">{dashboard?.nextAppointment ? new Date(dashboard.nextAppointment.scheduled_date).toLocaleDateString('en-PH') : 'None scheduled'}</span></p>
              <p>Due date: <span className="font-medium text-gray-900">{dashboard?.activePregnancy?.edd ? new Date(dashboard.activePregnancy.edd).toLocaleDateString('en-PH') : 'Not available'}</span></p>
              <p>Pending documents: <span className="font-medium text-gray-900">{dashboard?.documentSummary?.pending || 0}</span></p>
              <p>Latest fetal heart rate: <span className="font-medium text-gray-900">{latestVitals?.fetal_heart_rate ? `${latestVitals.fetal_heart_rate} bpm` : 'Not recorded'}</span></p>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Pregnancy tip highlights</h3>
            {featuredTips.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No pregnancy tip highlights are available yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {featuredTips.map((tip) => (
                  <div key={tip.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tip.category || 'General'}</p>
                    <p className="mt-2 font-semibold text-slate-900">{tip.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{tip.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title">Open detailed views</h3>
            <div className="mt-4 flex flex-col gap-3">
              <Link to="/my/appointments" className="btn-secondary justify-center">My appointments</Link>
              <Link to="/my/vitals" className="btn-secondary justify-center">My vitals</Link>
              <Link to="/my/records" className="btn-secondary justify-center">My records</Link>
              <Link to="/my/education" className="btn-secondary justify-center">Health tips</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
