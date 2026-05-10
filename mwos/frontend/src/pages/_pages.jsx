import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>
      <div className="card">
        <h3 className="section-title mb-4">Monthly Deliveries (12 months)</h3>
        {isLoading ? <div className="flex justify-center py-12"><div className="loading-spinner w-8 h-8" /></div> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data || []} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="nsd" fill="#0d9488" radius={[3,3,0,0]} name="NSD" />
              <Bar dataKey="cs" fill="#e11d48" radius={[3,3,0,0]} name="CS" />
            </BarChart>
          </ResponsiveContainer>
        )}
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
