import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../utils/api'

const EMPTY_FORM = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  dateOfBirth: '',
  civilStatus: '',
  religion: '',
  nationality: 'Filipino',
  occupation: '',
  placeOfBirth: '',
  phone: '',
  email: '',
  address: '',
  barangay: '',
  city: '',
  province: '',
  postalCode: '',
  birthingId: '',
  philhealthId: '',
  philhealthType: '',
  validIdType: '',
  validIdNumber: '',
  pregnancyBookletNumber: '',
  bloodType: '',
  biometricHeightCm: '',
  biometricWeightKg: '',
  allergies: '',
  existingConditions: '',
  currentMedications: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  credentialNotes: '',
  riskLevel: 'low',
}

const SectionTitle = ({ title, description }) => (
  <div className="col-span-2 mt-2 border-t border-slate-200/80 pt-4 first:mt-0 first:border-t-0 first:pt-0">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <p className="mt-1 text-xs text-slate-500">{description}</p>
  </div>
)

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

  const handleChange = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }))

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

      <div className="card mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          placeholder="Search by name, birthing ID, patient code, phone, or PhilHealth ID..."
        />
      </div>

      {error && (
        <div className="alert-critical mb-4">
          <span>Failed to load patients</span>
        </div>
      )}

      <div className="table-container">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="loading-spinner w-8 h-8" />
          </div>
        ) : patients.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
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
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <div>
                      <p className="font-medium text-gray-900">{patient.first_name} {patient.last_name}</p>
                      <p className="text-xs text-gray-400">{new Date(patient.date_of_birth).toLocaleDateString('en-PH')}</p>
                      <p className="text-xs text-gray-400">{patient.patient_code || 'Patient code pending'} · {patient.birthing_id || 'Birthing ID pending'}</p>
                    </div>
                  </td>
                  <td>
                    <p>{patient.phone || '-'}</p>
                    <p className="text-xs text-gray-400">{patient.city || ''}</p>
                  </td>
                  <td>{patient.philhealth_id || <span className="text-gray-400">-</span>}</td>
                  <td>
                    <span className={`badge ${
                      patient.risk_level === 'high' ? 'badge-danger'
                        : patient.risk_level === 'moderate' ? 'badge-warning'
                          : 'badge-success'
                    }`}
                    >
                      {patient.risk_level}
                    </span>
                  </td>
                  <td>
                    {patient.pregnancy_status === 'active' ? (
                      <span className="badge badge-info">Active</span>
                    ) : <span className="text-xs text-gray-400">-</span>}
                  </td>
                  <td>
                    <Link to={`/patients/${patient.id}`} className="btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Register New Patient</h2>
                <p className="text-sm text-slate-500">Create a complete identity, biometrics, and credentials record for the clinic.</p>
              </div>
              <button onClick={() => { setShowForm(false); setFormError('') }} className="btn-ghost p-2">Close</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {formError ? <div className="alert-critical text-sm">{formError}</div> : null}

              <div className="grid grid-cols-2 gap-4">
                <SectionTitle title="Identity" description="Required identity and demographic details." />
                <div><label className="label">First Name *</label><input name="firstName" value={form.firstName} onChange={handleChange} className="input" required /></div>
                <div><label className="label">Middle Name</label><input name="middleName" value={form.middleName} onChange={handleChange} className="input" /></div>
                <div><label className="label">Last Name *</label><input name="lastName" value={form.lastName} onChange={handleChange} className="input" required /></div>
                <div><label className="label">Suffix</label><input name="suffix" value={form.suffix} onChange={handleChange} className="input" /></div>
                <div><label className="label">Date of Birth *</label><input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input" required /></div>
                <div><label className="label">Civil Status</label><input name="civilStatus" value={form.civilStatus} onChange={handleChange} className="input" /></div>
                <div><label className="label">Religion</label><input name="religion" value={form.religion} onChange={handleChange} className="input" /></div>
                <div><label className="label">Nationality</label><input name="nationality" value={form.nationality} onChange={handleChange} className="input" /></div>
                <div><label className="label">Occupation</label><input name="occupation" value={form.occupation} onChange={handleChange} className="input" /></div>
                <div><label className="label">Place of Birth</label><input name="placeOfBirth" value={form.placeOfBirth} onChange={handleChange} className="input" /></div>

                <SectionTitle title="Contact & Address" description="Home and emergency communication details." />
                <div><label className="label">Phone</label><input name="phone" value={form.phone} onChange={handleChange} className="input" /></div>
                <div><label className="label">Email</label><input name="email" type="email" value={form.email} onChange={handleChange} className="input" /></div>
                <div className="col-span-2"><label className="label">Address</label><input name="address" value={form.address} onChange={handleChange} className="input" /></div>
                <div><label className="label">Barangay</label><input name="barangay" value={form.barangay} onChange={handleChange} className="input" /></div>
                <div><label className="label">City / Municipality</label><input name="city" value={form.city} onChange={handleChange} className="input" /></div>
                <div><label className="label">Province</label><input name="province" value={form.province} onChange={handleChange} className="input" /></div>
                <div><label className="label">Postal Code</label><input name="postalCode" value={form.postalCode} onChange={handleChange} className="input" /></div>
                <div><label className="label">Emergency Contact Name</label><input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} className="input" /></div>
                <div><label className="label">Emergency Contact Phone</label><input name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange} className="input" /></div>
                <div className="col-span-2"><label className="label">Emergency Contact Relationship</label><input name="emergencyContactRelation" value={form.emergencyContactRelation} onChange={handleChange} className="input" /></div>

                <SectionTitle title="Credentials" description="Birthing, insurance, and supporting identity references." />
                <div><label className="label">Birthing ID</label><input name="birthingId" value={form.birthingId} onChange={handleChange} className="input" placeholder="Leave blank to auto-generate" /></div>
                <div><label className="label">PhilHealth ID</label><input name="philhealthId" value={form.philhealthId} onChange={handleChange} className="input" /></div>
                <div><label className="label">PhilHealth Type</label><input name="philhealthType" value={form.philhealthType} onChange={handleChange} className="input" /></div>
                <div><label className="label">Valid ID Type</label><input name="validIdType" value={form.validIdType} onChange={handleChange} className="input" /></div>
                <div><label className="label">Valid ID Number</label><input name="validIdNumber" value={form.validIdNumber} onChange={handleChange} className="input" /></div>
                <div><label className="label">Pregnancy Booklet Number</label><input name="pregnancyBookletNumber" value={form.pregnancyBookletNumber} onChange={handleChange} className="input" /></div>
                <div className="col-span-2"><label className="label">Credential Notes</label><textarea name="credentialNotes" value={form.credentialNotes} onChange={handleChange} className="input" rows={2} /></div>

                <SectionTitle title="Biometrics & Clinical Profile" description="Care-relevant measurements and baseline health context." />
                <div><label className="label">Blood Type</label><input name="bloodType" value={form.bloodType} onChange={handleChange} className="input" /></div>
                <div><label className="label">Risk Level</label><select name="riskLevel" value={form.riskLevel} onChange={handleChange} className="input"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></div>
                <div><label className="label">Height (cm)</label><input name="biometricHeightCm" type="number" step="0.01" value={form.biometricHeightCm} onChange={handleChange} className="input" /></div>
                <div><label className="label">Weight (kg)</label><input name="biometricWeightKg" type="number" step="0.01" value={form.biometricWeightKg} onChange={handleChange} className="input" /></div>
                <div className="col-span-2"><label className="label">Known Allergies</label><input name="allergies" value={form.allergies} onChange={handleChange} className="input" placeholder="None known" /></div>
                <div className="col-span-2"><label className="label">Existing Conditions</label><textarea name="existingConditions" value={form.existingConditions} onChange={handleChange} className="input" rows={2} /></div>
                <div className="col-span-2"><label className="label">Current Medications</label><textarea name="currentMedications" value={form.currentMedications} onChange={handleChange} className="input" rows={2} /></div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 justify-center">
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
