import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import CoverCard from '../components/common/CoverCard'

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

const FORM_STEPS = [
  {
    label: 'Identity',
    title: 'Patient identity',
    description: 'Name, birth details, and personal profile.',
  },
  {
    label: 'Contact',
    title: 'Contact and address',
    description: 'Reachability, address, and emergency contact.',
  },
  {
    label: 'Records',
    title: 'Clinic records',
    description: 'Birthing ID, insurance, and supporting references.',
  },
  {
    label: 'Clinical',
    title: 'Clinical profile',
    description: 'Biometrics, risk level, allergies, and care notes.',
  },
]

export default function PatientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formStep, setFormStep] = useState(0)
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
      setFormStep(0)
      setFormError('')
    },
    onError: (err) => setFormError(err.response?.data?.message || 'Failed to register patient'),
  })

  const patients = data?.data || []
  const patientMetrics = useMemo(() => {
    const total = patients.length
    const activePregnancies = patients.filter((patient) => patient.pregnancy_status === 'active').length
    const highRisk = patients.filter((patient) => patient.risk_level === 'high').length
    const reachable = patients.filter((patient) => patient.phone || patient.email).length

    return [
      { label: 'Registered', value: total, helper: 'Patient profiles in the system' },
      { label: 'Active pregnancies', value: activePregnancies, helper: 'Currently monitored cases' },
      { label: 'High risk', value: highRisk, helper: 'Needs closer follow-up' },
      { label: 'Reachable', value: reachable, helper: 'Has phone or email on file' },
    ]
  }, [patients])

  const openForm = () => {
    setShowForm(true)
    setFormStep(0)
    setFormError('')
  }

  const closeForm = () => {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setFormStep(0)
    setFormError('')
  }

  const handleChange = (e) => {
    setFormError('')
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }))
  }

  const validateStep = () => {
    if (formStep === 0 && (!form.firstName || !form.lastName || !form.dateOfBirth)) {
      return 'First name, last name, and date of birth are required'
    }

    if (formStep === 1 && !form.phone && !form.email) {
      return 'Add at least one contact method so the clinic can reach the patient'
    }

    return ''
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')

    const nextError = validateStep()
    if (nextError) {
      setFormError(nextError)
      return
    }

    if (formStep < FORM_STEPS.length - 1) {
      setFormStep((current) => current + 1)
      return
    }

    createMutation.mutate(form)
  }

  const handleBack = () => {
    setFormError('')
    setFormStep((current) => Math.max(0, current - 1))
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-[#fff6fb] via-white to-[#f4efff] p-6 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b44b79]/70 dark:text-[#e8b4d1]/80">Patient operations</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">Patients</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
                Track registrations, review high-risk cases, and open the intake wizard for a cleaner clinic workflow.
              </p>
            </div>
            <button onClick={openForm} className="btn-primary self-start xl:self-auto">
              + Register Patient
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {patientMetrics.map((metric) => (
              <div key={metric.label} className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{metric.value}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.helper}</p>
              </div>
            ))}
          </div>
        </div>

        <CoverCard
          image="/reference/patient-intake.jpg"
          label="Patient intake"
          title="A guided registration flow that feels clear and welcoming."
          description="The intake layout follows the reference style with a calm visual cover and a practical, multi-step form experience."
          chips={['Identity', 'Emergency contact', 'Medical history']}
          tone="rose"
          className="h-full min-h-[22rem]"
        />
      </div>

      <div className="rounded-[28px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          placeholder="Search by name, birthing ID, patient code, phone, or PhilHealth ID..."
        />
      </div>

      {error && (
        <div className="alert-critical">
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-[92vh] w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/60 bg-white/95 shadow-[0_35px_90px_rgba(15,23,42,0.32)] dark:border-slate-800 dark:bg-slate-950/95">
            <aside className="hidden w-[300px] flex-col justify-between bg-gradient-to-br from-[#b44b79] via-[#b47ad8] to-[#7c4ddb] p-6 text-white lg:flex">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Patient registration</p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight">New patient intake</h2>
                <p className="mt-3 text-sm leading-7 text-white/80">
                  Use the guided steps to collect identity, contacts, clinic records, and clinical data in a single flow.
                </p>

                <div className="mt-6 space-y-3">
                  {FORM_STEPS.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setFormStep(index)}
                      className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
                        formStep === index
                          ? 'border-white/70 bg-white/18 shadow-lg'
                          : 'border-white/10 bg-white/8 hover:bg-white/12'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{item.label}</p>
                          <p className="text-xs text-white/70">{item.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Clinic note</p>
                <p className="mt-2 text-sm leading-7 text-white/85">
                  The modal validates each step before moving forward so staff can keep the record complete without the screen feeling crowded.
                </p>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b44b79]/70 dark:text-[#e8b4d1]/80">Patient intake</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{FORM_STEPS[formStep].title}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{FORM_STEPS[formStep].description}</p>
                </div>
                <button onClick={closeForm} className="btn-ghost rounded-full px-3 py-2">
                  Close
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  {formError ? <div className="alert-critical mb-5 text-sm">{formError}</div> : null}

                  <div className="mb-6">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      <span>
                        Step {formStep + 1} of {FORM_STEPS.length}
                      </span>
                      <span>{Math.round(((formStep + 1) / FORM_STEPS.length) * 100)}%</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${((formStep + 1) / FORM_STEPS.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="space-y-5">
                      {formStep === 0 ? (
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="label">First Name *</label>
                              <input name="firstName" value={form.firstName} onChange={handleChange} className="input" required />
                            </div>
                            <div>
                              <label className="label">Middle Name</label>
                              <input name="middleName" value={form.middleName} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Last Name *</label>
                              <input name="lastName" value={form.lastName} onChange={handleChange} className="input" required />
                            </div>
                            <div>
                              <label className="label">Suffix</label>
                              <input name="suffix" value={form.suffix} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Date of Birth *</label>
                              <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input" required />
                            </div>
                            <div>
                              <label className="label">Civil Status</label>
                              <input name="civilStatus" value={form.civilStatus} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Religion</label>
                              <input name="religion" value={form.religion} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Nationality</label>
                              <input name="nationality" value={form.nationality} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Occupation</label>
                              <input name="occupation" value={form.occupation} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Place of Birth</label>
                              <input name="placeOfBirth" value={form.placeOfBirth} onChange={handleChange} className="input" />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {formStep === 1 ? (
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="label">Phone</label>
                              <input name="phone" value={form.phone} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Email</label>
                              <input name="email" type="email" value={form.email} onChange={handleChange} className="input" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Address</label>
                              <input name="address" value={form.address} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Barangay</label>
                              <input name="barangay" value={form.barangay} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">City / Municipality</label>
                              <input name="city" value={form.city} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Province</label>
                              <input name="province" value={form.province} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Postal Code</label>
                              <input name="postalCode" value={form.postalCode} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Emergency Contact Name</label>
                              <input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Emergency Contact Phone</label>
                              <input name="emergencyContactPhone" value={form.emergencyContactPhone} onChange={handleChange} className="input" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Emergency Contact Relationship</label>
                              <input name="emergencyContactRelation" value={form.emergencyContactRelation} onChange={handleChange} className="input" />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {formStep === 2 ? (
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="label">Birthing ID</label>
                              <input name="birthingId" value={form.birthingId} onChange={handleChange} className="input" placeholder="Leave blank to auto-generate" />
                            </div>
                            <div>
                              <label className="label">PhilHealth ID</label>
                              <input name="philhealthId" value={form.philhealthId} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">PhilHealth Type</label>
                              <input name="philhealthType" value={form.philhealthType} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Valid ID Type</label>
                              <input name="validIdType" value={form.validIdType} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Valid ID Number</label>
                              <input name="validIdNumber" value={form.validIdNumber} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Pregnancy Booklet Number</label>
                              <input name="pregnancyBookletNumber" value={form.pregnancyBookletNumber} onChange={handleChange} className="input" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Credential Notes</label>
                              <textarea name="credentialNotes" value={form.credentialNotes} onChange={handleChange} className="input" rows={3} />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {formStep === 3 ? (
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="label">Blood Type</label>
                              <input name="bloodType" value={form.bloodType} onChange={handleChange} className="input" />
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
                              <label className="label">Height (cm)</label>
                              <input name="biometricHeightCm" type="number" step="0.01" value={form.biometricHeightCm} onChange={handleChange} className="input" />
                            </div>
                            <div>
                              <label className="label">Weight (kg)</label>
                              <input name="biometricWeightKg" type="number" step="0.01" value={form.biometricWeightKg} onChange={handleChange} className="input" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Known Allergies</label>
                              <input name="allergies" value={form.allergies} onChange={handleChange} className="input" placeholder="None known" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Existing Conditions</label>
                              <textarea name="existingConditions" value={form.existingConditions} onChange={handleChange} className="input" rows={2} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="label">Current Medications</label>
                              <textarea name="currentMedications" value={form.currentMedications} onChange={handleChange} className="input" rows={2} />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <aside className="space-y-4">
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Current snapshot</p>
                        <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/80">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Identity</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">
                              {form.firstName || 'First name'} {form.lastName || 'Last name'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{form.dateOfBirth || 'Date of birth pending'}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/80">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Contact</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{form.phone || form.email || 'Contact not set'}</p>
                            <p className="mt-1 text-xs text-slate-500">{form.city || form.barangay || 'Address pending'}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/80">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Records</p>
                            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{form.birthingId || 'Birthing ID pending'}</p>
                            <p className="mt-1 text-xs text-slate-500">{form.philhealthId || 'PhilHealth not set'}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/80">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Clinical</p>
                            <p className="mt-1 font-semibold capitalize text-slate-900 dark:text-slate-50">{form.riskLevel} risk</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {form.bloodType ? `Blood type ${form.bloodType}` : 'Blood type pending'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-100">
                        <p className="font-semibold">Why this flow</p>
                        <p className="mt-2 leading-7">
                          The guided layout mirrors the patient intake reference and keeps the registration usable on smaller screens.
                        </p>
                      </div>
                    </aside>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 px-5 py-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleBack}
                      disabled={formStep === 0}
                      className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Back
                    </button>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={closeForm} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                        {createMutation.isPending ? 'Saving...' : formStep === FORM_STEPS.length - 1 ? 'Register Patient' : 'Continue'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
