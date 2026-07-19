import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'

// ── VITALS PAGE ───────────────────────────────────────────────
export function VitalsPage() {
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Vitals</h1></div>
      <div className="card"><p className="text-gray-500 text-sm">Navigate to a specific patient record to record vitals. Go to <strong>Patients → Select Patient → Vitals tab</strong>.</p></div>
    </div>
  )
}

// ── DELIVERIES PAGE ───────────────────────────────────────────
export function DeliveriesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ patientId: '', pregnancyId: '', deliveryDate: new Date().toISOString().split('T')[0], deliveryType: 'NSD', newbornSex: '', birthWeightKg: '', apgar1min: '', apgar5min: '', notes: '' })
  const [error, setError] = useState('')

  const { data: patients } = useQuery({ queryKey: ['patients-list'], queryFn: () => api.get('/patients', { params: { limit: 200 } }).then(r => r.data.data) })

  const createMut = useMutation({
    mutationFn: (body) => api.post('/deliveries', body),
    onSuccess: () => { qc.invalidateQueries(['deliveries']); setShowForm(false); setError('') },
    onError: (err) => setError(err.response?.data?.message || 'Failed to record delivery'),
  })

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Deliveries</h1><p className="page-sub">Labor & delivery records</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Record Delivery</button>
      </div>
      <div className="card"><p className="text-gray-500 text-sm">View delivery records per patient via <strong>Patients → Select Patient → Deliveries tab</strong>.</p></div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Record Delivery</h2><button onClick={() => setShowForm(false)} className="btn-ghost">✕</button></div>
            {error && <div className="alert-critical mb-3 text-sm"><span>⚠️</span><span>{error}</span></div>}
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} className="space-y-3">
              <div>
                <label className="label">Patient</label>
                <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} className="input" required>
                  <option value="">Select patient...</option>
                  {(patients || []).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Delivery Date</label><input type="date" value={form.deliveryDate} onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))} className="input" required /></div>
                <div>
                  <label className="label">Type</label>
                  <select value={form.deliveryType} onChange={e => setForm(f => ({ ...f, deliveryType: e.target.value }))} className="input">
                    <option>NSD</option><option>CS</option><option>Forceps</option><option>Vacuum</option>
                  </select>
                </div>
                <div>
                  <label className="label">Newborn Sex</label>
                  <select value={form.newbornSex} onChange={e => setForm(f => ({ ...f, newbornSex: e.target.value }))} className="input">
                    <option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option>
                  </select>
                </div>
                <div><label className="label">Birth Weight (kg)</label><input type="number" step="0.001" value={form.birthWeightKg} onChange={e => setForm(f => ({ ...f, birthWeightKg: e.target.value }))} className="input" placeholder="3.200" /></div>
                <div><label className="label">APGAR 1 min</label><input type="number" min="0" max="10" value={form.apgar1min} onChange={e => setForm(f => ({ ...f, apgar1min: e.target.value }))} className="input" /></div>
                <div><label className="label">APGAR 5 min</label><input type="number" min="0" max="10" value={form.apgar5min} onChange={e => setForm(f => ({ ...f, apgar5min: e.target.value }))} className="input" /></div>
              </div>
              <div><label className="label">Notes / Complications</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">{createMut.isPending ? 'Saving...' : 'Save Delivery'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── INVENTORY PAGE ────────────────────────────────────────────
export function InventoryPage() {
  const qc = useQueryClient()
  const [adjustId, setAdjustId] = useState(null)
  const [adjustment, setAdjustment] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => api.get('/inventory').then(r => r.data.data) })

  const adjustMut = useMutation({
    mutationFn: ({ id, adj }) => api.patch(`/inventory/${id}/adjust`, { adjustment: adj }),
    onSuccess: () => { qc.invalidateQueries(['inventory']); setAdjustId(null); setAdjustment('') },
    onError: (err) => setError(err.response?.data?.message || 'Adjustment failed'),
  })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Inventory</h1><p className="page-sub">Supplies & equipment</p></div>
      {error && <div className="alert-critical mb-4 text-sm"><span>⚠️</span><span>{error}</span></div>}
      <div className="table-container">
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <table className="table">
            <thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Reorder Level</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(data || []).map(item => (
                <tr key={item.id}>
                  <td className="font-medium">{item.item_name}</td>
                  <td className="capitalize text-gray-500">{item.category}</td>
                  <td className="font-mono">{item.quantity} {item.unit}</td>
                  <td className="text-gray-400">{item.reorder_level}</td>
                  <td>
                    <span className={`badge ${item.quantity <= 0 ? 'badge-danger' : item.quantity <= item.reorder_level ? 'badge-warning' : 'badge-success'}`}>
                      {item.quantity <= 0 ? 'Out of stock' : item.quantity <= item.reorder_level ? 'Low stock' : 'In stock'}
                    </span>
                  </td>
                  <td>
                    {adjustId === item.id ? (
                      <div className="flex gap-1 items-center">
                        <input type="number" value={adjustment} onChange={e => setAdjustment(e.target.value)} className="input w-20 py-1" placeholder="±qty" />
                        <button onClick={() => adjustMut.mutate({ id: item.id, adj: parseInt(adjustment) })} className="btn-primary btn-sm">✓</button>
                        <button onClick={() => setAdjustId(null)} className="btn-secondary btn-sm">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setAdjustId(item.id); setError('') }} className="btn-secondary btn-sm">Adjust</button>
                    )}
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

// ── BILLING PAGE ──────────────────────────────────────────────
export function BillingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: () => api.get('/billing').then(r => r.data.data) })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Billing</h1><p className="page-sub">Payment records</p></div>
      <div className="table-container">
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <table className="table">
            <thead><tr><th>Patient</th><th>Date</th><th>Service</th><th>Amount</th><th>PhilHealth</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).map(b => (
                <tr key={b.id}>
                  <td className="font-medium">{b.patient_name}</td>
                  <td>{new Date(b.bill_date).toLocaleDateString('en-PH')}</td>
                  <td>{b.service_type || '—'}</td>
                  <td className="font-mono">₱{parseFloat(b.total_amount).toLocaleString()}</td>
                  <td className="font-mono">{b.philhealth_amount > 0 ? `₱${parseFloat(b.philhealth_amount).toLocaleString()}` : '—'}</td>
                  <td><span className={`badge ${b.payment_status === 'paid' ? 'badge-success' : b.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}>{b.payment_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── REPORTS PAGE ──────────────────────────────────────────────
export function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['births-monthly'], queryFn: () => api.get('/reports/births/monthly').then(r => r.data.data) })
  const chartData = data || []

  const reportSummary = useMemo(() => {
    const nsdTotal = chartData.reduce((sum, item) => sum + Number(item.nsd || 0), 0)
    const csTotal = chartData.reduce((sum, item) => sum + Number(item.cs || 0), 0)
    const total = nsdTotal + csTotal
    const average = chartData.length ? total / chartData.length : 0
    const peakMonth = chartData.reduce((best, item) => {
      const itemTotal = Number(item.nsd || 0) + Number(item.cs || 0)
      if (!best || itemTotal > best.total) {
        return { month: item.month, total: itemTotal }
      }
      return best
    }, null)

    return {
      nsdTotal,
      csTotal,
      total,
      average,
      peakMonth: peakMonth?.month || 'N/A',
      peakTotal: peakMonth?.total || 0,
    }
  }, [chartData])

  const trendData = useMemo(() => chartData.map((item) => ({
    month: item.month,
    total: Number(item.nsd || 0) + Number(item.cs || 0),
    nsd: Number(item.nsd || 0),
    cs: Number(item.cs || 0),
  })), [chartData])

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-6 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700/70 dark:text-cyan-300/80">Clinical analytics</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">Reports</h1>
            <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
              Review delivery mix, monthly volume, and trend direction for the birthing home and clinic.
            </p>
          </div>
          <button className="btn-secondary self-start xl:self-auto">Export summary</button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Total deliveries</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{reportSummary.total}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Combined monthly deliveries</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">NSD count</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{reportSummary.nsdTotal}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Vaginal delivery volume</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">CS count</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{reportSummary.csTotal}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Cesarean delivery volume</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Peak month</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{reportSummary.peakMonth}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{reportSummary.peakTotal} deliveries recorded</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Monthly delivery mix</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">NSD versus cesarean volume across the last 12 months.</p>
              </div>
              <span className="badge badge-gray">{chartData.length} months</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="loading-spinner h-8 w-8" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  <Legend />
                  <Bar dataKey="nsd" fill="#0f766e" radius={[8, 8, 0, 0]} name="NSD" />
                  <Bar dataKey="cs" fill="#e11d48" radius={[8, 8, 0, 0]} name="CS" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Monthly trend line</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A simpler view of the total delivery load by month.</p>
              </div>
              <span className="badge badge-info">Trend</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="loading-spinner h-8 w-8" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  <Area type="monotone" dataKey="total" stroke="#2563eb" fill="#93c5fd" fillOpacity={0.28} />
                  <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Insights</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Operational readout</h3>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Average per month</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                  {reportSummary.average.toFixed(1)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Delivery mix</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  NSD and CS totals are balanced against monthly demand to spot workload shifts early.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Peak month</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{reportSummary.peakMonth}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Data table</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Monthly breakdown</h3>
              </div>
              <span className="badge badge-gray">{chartData.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {chartData.map((item) => (
                <div key={item.month} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <span className="font-medium text-slate-900 dark:text-slate-50">{item.month}</span>
                  <span className="text-slate-500">
                    NSD {item.nsd || 0} - CS {item.cs || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── EDUCATION PAGE ────────────────────────────────────────────
export function EducationPage() {
  const { data, isLoading } = useQuery({ queryKey: ['education'], queryFn: () => api.get('/education').then(r => r.data.data) })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Health Education</h1></div>
      {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data || []).map(e => (
            <div key={e.id} className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-info capitalize">{e.category || 'General'}</span>
                {e.trimester_target !== 'all' && <span className="badge badge-gray">{e.trimester_target}</span>}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{e.title}</h3>
              <p className="text-sm text-gray-600 line-clamp-3">{e.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── USERS PAGE ────────────────────────────────────────────────
export function UsersPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data.data) })

  const toggleMut = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['users']),
  })

  const roleColor = { admin: 'badge-danger', doctor: 'badge-info', midwife: 'badge-success', nurse: 'badge-warning', patient: 'badge-gray' }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">User Management</h1></div>
      <div className="table-container">
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(data || []).map(u => (
                <tr key={u.id}>
                  <td className="font-medium">{u.first_name} {u.last_name}</td>
                  <td className="text-gray-500">{u.email}</td>
                  <td><span className={`badge ${roleColor[u.role] || 'badge-gray'}`}>{u.role}</span></td>
                  <td><span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button onClick={() => toggleMut.mutate(u.id)} disabled={toggleMut.isPending} className={u.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
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

// Named exports only - individual pages re-export these as defaults
