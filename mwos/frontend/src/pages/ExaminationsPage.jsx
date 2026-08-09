import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import CoverCard from '../components/common/CoverCard'

const STATUS_BADGES = {
  normal: 'badge-success',
  abnormal: 'badge-warning',
  critical: 'badge-danger',
  pending: 'badge-info',
}

const LAB_FORM = {
  testName: '',
  testDate: new Date().toISOString().slice(0, 10),
  resultValue: '',
  unit: '',
  referenceRange: '',
  status: 'normal',
  notes: '',
}

const ULTRASOUND_FORM = {
  scanDate: new Date().toISOString().slice(0, 10),
  gestationalAgeWeeks: '',
  findings: '',
  placentaLocation: '',
  amnioticFluid: '',
  notes: '',
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--')

export default function ExaminationsPage() {
  const qc = useQueryClient()
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [labForm, setLabForm] = useState(LAB_FORM)
  const [ultrasoundForm, setUltrasoundForm] = useState(ULTRASOUND_FORM)
  const [labError, setLabError] = useState('')
  const [ultrasoundError, setUltrasoundError] = useState('')

  const { data: patientsResponse } = useQuery({
    queryKey: ['examination-patients'],
    queryFn: () => api.get('/patients', { params: { limit: 200 } }).then((response) => response.data),
  })

  const patients = patientsResponse?.data || []

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].id)
    }
  }, [patients, selectedPatientId])

  const selectedPatient = patients.find((patient) => String(patient.id) === String(selectedPatientId))

  const { data: labs = [], isLoading: labsLoading } = useQuery({
    queryKey: ['examination-labs', selectedPatientId],
    queryFn: () => api.get(`/emr/labs/${selectedPatientId}`).then((response) => response.data.data),
    enabled: Boolean(selectedPatientId),
  })

  const { data: ultrasounds = [], isLoading: ultrasoundsLoading } = useQuery({
    queryKey: ['examination-ultrasounds', selectedPatientId],
    queryFn: () => api.get(`/emr/ultrasounds/${selectedPatientId}`).then((response) => response.data.data),
    enabled: Boolean(selectedPatientId),
  })

  const labMutation = useMutation({
    mutationFn: (body) => api.post('/emr/labs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination-labs', selectedPatientId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setLabForm(LAB_FORM)
      setLabError('')
    },
    onError: (error) => setLabError(error.response?.data?.message || 'Unable to save lab result'),
  })

  const ultrasoundMutation = useMutation({
    mutationFn: (body) => api.post('/emr/ultrasounds', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['examination-ultrasounds', selectedPatientId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setUltrasoundForm(ULTRASOUND_FORM)
      setUltrasoundError('')
    },
    onError: (error) => setUltrasoundError(error.response?.data?.message || 'Unable to save ultrasound record'),
  })

  const summary = useMemo(() => {
    const totalLabs = labs.length
    const abnormalLabs = labs.filter((item) => ['abnormal', 'critical'].includes(item.status)).length
    const totalScans = ultrasounds.length
    const latestScan = ultrasounds[0]

    return [
      { label: 'Lab results', value: totalLabs, helper: 'Recent blood and chemistry entries' },
      { label: 'Flagged labs', value: abnormalLabs, helper: 'Requires clinical review' },
      { label: 'Ultrasounds', value: totalScans, helper: 'Pregnancy scan history' },
      { label: 'Latest scan', value: latestScan ? formatDate(latestScan.scan_date) : '--', helper: 'Most recent imaging date' },
    ]
  }, [labs, ultrasounds])

  const handleLabSubmit = (event) => {
    event.preventDefault()
    if (!selectedPatientId || !labForm.testName || !labForm.testDate) {
      setLabError('Patient, test name, and test date are required.')
      return
    }

    labMutation.mutate({
      patientId: selectedPatientId,
      testName: labForm.testName,
      testDate: labForm.testDate,
      resultValue: labForm.resultValue || undefined,
      unit: labForm.unit || undefined,
      referenceRange: labForm.referenceRange || undefined,
      status: labForm.status,
      notes: labForm.notes || undefined,
    })
  }

  const handleUltrasoundSubmit = (event) => {
    event.preventDefault()
    if (!selectedPatientId || !ultrasoundForm.scanDate) {
      setUltrasoundError('Patient and scan date are required.')
      return
    }

    ultrasoundMutation.mutate({
      patientId: selectedPatientId,
      scanDate: ultrasoundForm.scanDate,
      gestationalAgeWeeks: ultrasoundForm.gestationalAgeWeeks || undefined,
      findings: ultrasoundForm.findings || undefined,
      placentaLocation: ultrasoundForm.placentaLocation || undefined,
      amnioticFluid: ultrasoundForm.amnioticFluid || undefined,
      notes: ultrasoundForm.notes || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="page-header mb-0">
            <div className="max-w-3xl">
              <p className="section-kicker">Clinical examinations</p>
              <h1 className="page-title">Examinations</h1>
              <p className="page-sub">
                Review lab results and ultrasound findings for one selected patient, then add new findings in a clean maternal workflow.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summary.map((item) => (
              <div key={item.label} className="card">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{item.value}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.helper}</p>
              </div>
            ))}
          </div>
        </div>

        <CoverCard
          image="/reference/reports-hero.jpg"
          label="Image-led review"
          title="Labs, scans, and maternal follow-up in one place."
          description="Keep every examination readable for staff while the patient history stays simple to scan."
          chips={['Labs', 'Ultrasound', 'Follow-up']}
          tone="lavender"
          className="min-h-[28rem]"
        />
      </div>

      <div className="card">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <label className="label">Select patient</label>
            <select
              className="input"
              value={selectedPatientId}
              onChange={(event) => setSelectedPatientId(event.target.value)}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} | {patient.patient_code || 'Patient code pending'}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-[28px] border border-white/80 bg-[#fff7fb] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-400">Patient summary</p>
            {selectedPatient ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedPatient.city || 'City not set'} · {selectedPatient.barangay || 'Barangay not set'}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Choose a patient to review examinations.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Laboratory results</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Lab results</h2>
              </div>
              <span className="badge badge-gray">{labs.length}</span>
            </div>

            {labsLoading ? (
              <div className="mt-5 flex justify-center py-10"><div className="loading-spinner h-8 w-8" /></div>
            ) : labs.length === 0 ? (
              <p className="mt-5 text-sm text-slate-400">No lab entries found for this patient yet.</p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Date</th>
                      <th>Result</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labs.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <p className="font-medium text-slate-900 dark:text-slate-50">{item.test_name}</p>
                          <p className="text-xs text-slate-400">{item.reference_range || 'No reference range'}</p>
                        </td>
                        <td>{formatDate(item.test_date)}</td>
                        <td>
                          <p className="font-semibold text-slate-900 dark:text-slate-50">
                            {item.result_value || 'Pending'} {item.unit || ''}
                          </p>
                          <p className="text-xs text-slate-400">{item.notes || ''}</p>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGES[item.status] || 'badge-gray'}`}>{item.status || 'normal'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form onSubmit={handleLabSubmit} className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Add lab result</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">New laboratory entry</h3>
              </div>
              <span className="badge badge-info">Lab</span>
            </div>

            {labError ? <div className="alert-critical text-sm">{labError}</div> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label">Test name</label>
                <input className="input" value={labForm.testName} onChange={(event) => setLabForm((current) => ({ ...current, testName: event.target.value }))} placeholder="CBC / Hemoglobin / Urinalysis" />
              </div>
              <div>
                <label className="label">Test date</label>
                <input className="input" type="date" value={labForm.testDate} onChange={(event) => setLabForm((current) => ({ ...current, testDate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={labForm.status} onChange={(event) => setLabForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="normal">Normal</option>
                  <option value="abnormal">Abnormal</option>
                  <option value="critical">Critical</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="label">Result value</label>
                <input className="input" value={labForm.resultValue} onChange={(event) => setLabForm((current) => ({ ...current, resultValue: event.target.value }))} placeholder="12.4" />
              </div>
              <div>
                <label className="label">Unit</label>
                <input className="input" value={labForm.unit} onChange={(event) => setLabForm((current) => ({ ...current, unit: event.target.value }))} placeholder="g/dL" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Reference range</label>
                <input className="input" value={labForm.referenceRange} onChange={(event) => setLabForm((current) => ({ ...current, referenceRange: event.target.value }))} placeholder="11.0 - 15.0 g/dL" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-[96px]" value={labForm.notes} onChange={(event) => setLabForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Clinical interpretation or follow-up reminders." />
              </div>
            </div>

            <div className="flex justify-end">
              <button className="btn-primary" type="submit" disabled={labMutation.isPending}>
                {labMutation.isPending ? 'Saving lab...' : 'Save lab result'}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Ultrasound findings</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Ultrasounds</h2>
              </div>
              <span className="badge badge-gray">{ultrasounds.length}</span>
            </div>

            {ultrasoundsLoading ? (
              <div className="mt-5 flex justify-center py-10"><div className="loading-spinner h-8 w-8" /></div>
            ) : ultrasounds.length === 0 ? (
              <p className="mt-5 text-sm text-slate-400">No ultrasound scans recorded yet.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {ultrasounds.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-slate-200 bg-[#fff8fc] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{formatDate(item.scan_date)}</p>
                      <span className="badge badge-info">{item.gestational_age_weeks ? `${item.gestational_age_weeks} wks` : 'Scan'}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.findings || 'No findings recorded.'}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      Placenta: {item.placenta_location || '--'} · Fluid: {item.amniotic_fluid || '--'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleUltrasoundSubmit} className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Add ultrasound</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">New scan entry</h3>
              </div>
              <span className="badge badge-info">Scan</span>
            </div>

            {ultrasoundError ? <div className="alert-critical text-sm">{ultrasoundError}</div> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Scan date</label>
                <input className="input" type="date" value={ultrasoundForm.scanDate} onChange={(event) => setUltrasoundForm((current) => ({ ...current, scanDate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Gestational age</label>
                <input className="input" value={ultrasoundForm.gestationalAgeWeeks} onChange={(event) => setUltrasoundForm((current) => ({ ...current, gestationalAgeWeeks: event.target.value }))} placeholder="24 weeks" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Findings</label>
                <textarea className="input min-h-[96px]" value={ultrasoundForm.findings} onChange={(event) => setUltrasoundForm((current) => ({ ...current, findings: event.target.value }))} placeholder="Fetal position, growth notes, and other scan findings." />
              </div>
              <div>
                <label className="label">Placenta location</label>
                <input className="input" value={ultrasoundForm.placentaLocation} onChange={(event) => setUltrasoundForm((current) => ({ ...current, placentaLocation: event.target.value }))} placeholder="Anterior" />
              </div>
              <div>
                <label className="label">Amniotic fluid</label>
                <input className="input" value={ultrasoundForm.amnioticFluid} onChange={(event) => setUltrasoundForm((current) => ({ ...current, amnioticFluid: event.target.value }))} placeholder="Normal" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-[96px]" value={ultrasoundForm.notes} onChange={(event) => setUltrasoundForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Clinical notes, due follow-up, or referral details." />
              </div>
            </div>

            <div className="flex justify-end">
              <button className="btn-primary" type="submit" disabled={ultrasoundMutation.isPending}>
                {ultrasoundMutation.isPending ? 'Saving scan...' : 'Save ultrasound'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
