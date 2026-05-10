import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '../utils/api'

const StatCard = ({ icon, label, value, color, sub }) => (
  <div className="stat-card">
    <div className={`stat-icon bg-${color}-100 text-${color}-600`}>{icon}</div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
)

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard').then((r) => r.data.data),
    refetchInterval: 60000,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="loading-spinner w-8 h-8" />
    </div>
  )

  if (error) return (
    <div className="alert-critical">
      <span>⚠️</span>
      <div>
        <p className="font-medium">Failed to load dashboard</p>
        <p className="text-sm mt-1">{error.response?.data?.message || error.message}</p>
        <button onClick={refetch} className="btn-danger btn-sm mt-2">Retry</button>
      </div>
    </div>
  )

  const stats = data?.stats || {}
  const trend = data?.deliveryTrend || []
  const todayAppts = data?.todayAppointments || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">TMC Copino Birthing Home — Overview</p>
        </div>
        <button onClick={refetch} className="btn-secondary btn-sm">🔄 Refresh</button>
      </div>

      {/* Alerts */}
      {stats.recentAlerts > 0 && (
        <div className="alert-critical mb-6">
          <span className="text-xl">🚨</span>
          <div>
            <p className="font-semibold">{stats.recentAlerts} critical vital alert{stats.recentAlerts > 1 ? 's' : ''} in the last 24 hours</p>
            <p className="text-sm mt-0.5">Check patient vitals immediately — high BP or absent fetal movement recorded</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="👩" label="Total Patients" value={stats.totalPatients} color="teal" />
        <StatCard icon="🤰" label="Active Pregnancies" value={stats.activePregnancies} color="purple" />
        <StatCard icon="📅" label="Today's Appointments" value={stats.todayAppointments} color="blue" />
        <StatCard icon="🏥" label="Deliveries This Month" value={stats.deliveriesThisMonth} color="green" />
        <StatCard icon="⚠️" label="High Risk Patients" value={stats.highRiskPatients} color="red" sub="Needs close monitoring" />
        <StatCard icon="💳" label="Pending Bills" value={stats.pendingBills} color="amber" />
        <StatCard icon="📦" label="Low Inventory" value={stats.lowInventory} color="orange" sub="Items below reorder level" />
        <StatCard icon="🚨" label="Recent Alerts" value={stats.recentAlerts} color="red" sub="Last 24 hours" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery trend */}
        <div className="card lg:col-span-2">
          <h3 className="section-title mb-4">Monthly Deliveries (Last 6 months)</h3>
          {trend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No delivery data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value, name) => [value, name === 'nsd' ? 'Normal' : 'CS']}
                />
                <Bar dataKey="nsd" fill="#0d9488" radius={[3, 3, 0, 0]} name="nsd" />
                <Bar dataKey="cs" fill="#e11d48" radius={[3, 3, 0, 0]} name="cs" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 bg-teal-600 rounded-sm inline-block" />Normal Delivery
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 bg-rose-600 rounded-sm inline-block" />Cesarean Section
            </div>
          </div>
        </div>

        {/* Today's appointments */}
        <div className="card">
          <h3 className="section-title">Today's Schedule</h3>
          {todayAppts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-2">📅</p>
              <p className="text-sm">No appointments today</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {todayAppts.map((appt, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="text-xs font-mono text-gray-500 w-12 flex-shrink-0">
                    {appt.scheduled_time?.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{appt.patient_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{appt.appointment_type}</p>
                  </div>
                  <span className={`badge ${
                    appt.risk_level === 'high' ? 'badge-danger' :
                    appt.risk_level === 'moderate' ? 'badge-warning' : 'badge-success'
                  }`}>
                    {appt.risk_level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
