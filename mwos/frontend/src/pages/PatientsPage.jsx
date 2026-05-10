import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../utils/api'

const EMPTY_FORM = {
  firstName: '', lastName: '', dateOfBirth: '', civilStatus: '', phone: '',
  email: '', address: '', city: '', philhealthId: '', bloodType: '',
  allergies: '', existingConditions: '', emergencyContactName: '',
  emergencyContactPhone: '', riskLevel: 'low',
}

export default function PatientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['patients', search],
    queryFn: () => api.get('/patients', { params: { search, limit: 50 } }).then((r) => r.data),
    keepPreviousData: true,
  })

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/patients', body),
    onSuccess: () => {
      qc.invalidateQueries(['patients'])
      setShowForm(false)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (err) => setFormError(err.response?.data?.message || 'Failed to register patient'),
  })

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.firstName || !form.lastName || !form.dateOfBirth) {
      return setFormError('First name, last name, and date of birth are required')
    }
    createMutation.mutate(form)
  }

  const patients = data?.data || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="page-sub">{data?.pagination?.total ?? 0} registered patients</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Register Patient
        </button>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          placeholder="🔍 Search by name, phone, or PhilHealth ID..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="alert-critical mb-4">
          <span>⚠️</span>
          <span>{error.response?.data?.message || 'Failed to load patients'}</span>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="loading-spinner w-8 h-8" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">👩‍⚕️</p>
            <p>No patients found</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Contact</th>
                <th>PhilHealth</th>
                <th>Risk</th>
                <th>Pregnancy</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>
                      <p className="font-medium text-gray-900">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-gray-400">{new Date(p.date_of_birth).toLocaleDateString('en-PH')}</p>
                    </div>
                  </td>
                  <td>
                    <p>{p.phone || '—'}</p>
                    <p className="text-xs text-gray-400">{p.city || ''}</p>
                  </td>
                  <td>{p.philhealth_id || <span className="text-gray-400">—</span>}</td>
                  <td>
                    <span className={`badge ${
                      p.risk_level === 'high' ? 'badge-danger' :
                      p.risk_level === 'moderate' ? 'badge-warning' : 'badge-success'
                    }`}>
                      {p.risk_level}
                    </span>
                  </td>
                  <td>
                    {p.pregnancy_status === 'active' ? (
                      <span className="badge badge-info">Active</span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td>
                    <Link to={`/patients/${p.id}`} className="btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Registration modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">Register New Patient</h2>
              <button onClick={() => { setShowForm(false); setFormError('') }} className="btn-ghost p-2">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="alert-critical text-sm">
                  <span>⚠️</span><span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">First Name *</label>
                  <input name="firstName" value={form.firstName} onChange={handleChange} className="input" required />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input name="lastName" value={form.lastName} onChange={handleChange} className="input" required />
                </div>
                <div>
                  <label className="label">Date of Birth *</label>
                  <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input" required />
                </div>
                <div>
                  <label className="label">Civil Status</label>
                  <select name="civilStatus" value={form.civilStatus} onChange={handleChange} className="input">
                    <option value="">Select...</option>
                    <option>Single</option><option>Married</option>
                    <option>Widowed</option><option>Separated</option>
                  </select>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input name="phone" value={form.phone} onChange={handleChange} className="input" placeholder="09XXXXXXXXX" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange} className="input" />
                </div>
                <div className="col-span-2">
                  <label className="label">Address</label>
                  <input name="address" value={form.address} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">City</label>
                  <input name="city" value={form.city} onChange={handleChange} className="input" placeholder="Tabaco City" />
                </div>
                <div>
                  <label className="label">PhilHealth ID</label>
                  <input name="philhealthId" value={form.philhealthId} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Blood Type</label>
                  <select name="bloodType" value={form.bloodType} onChange={handleChange} className="input">
                    <option value="">Unknown</option>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bt => <option key={bt}>{bt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Risk Level</label>
                  <select name="riskLevel" value={form.riskLevel} onChange={handleChange} className="input">
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="label">Emergency Contact Name</label>
                  <input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Emergency Contact Phone</label>
                  <input name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange} className="input" />
                </div>
                <div className="col-span-2">
                  <label className="label">Known Allergies</label>
                  <input name="allergies" value={form.allergies} onChange={handleChange} className="input" placeholder="None known" />
                </div>
                <div className="col-span-2">
                  <label className="label">Existing Conditions</label>
                  <textarea name="existingConditions" value={form.existingConditions} onChange={handleChange} className="input" rows={2} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {createMutation.isPending ? 'Registering...' : 'Register Patient'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setFormError('') }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
