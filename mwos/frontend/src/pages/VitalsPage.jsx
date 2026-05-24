import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../utils/api'

const today = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  visitDate: today,
  gestationalAgeWeeks: '',
  weightKg: '',
  heightCm: '',
  bpSystolic: '',
  bpDiastolic: '',
  pulseRate: '',
  temperature: '',
  respiratoryRate: '',
  fundalHeightCm: '',
  fetalHeartRate: '',
  fetalPresentation: '',
  fetalMovement: 'present',
  edema: 'none',
  notes: '',
}

const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', {
  month: 'short',
  day: 'numeric',
})

const hotSpotTone = (severity) => {
  if (severity === 'high') return 'vitals-node vitals-node-critical'
  if (severity === 'medium') return 'vitals-node vitals-node-warning'
  return 'vitals-node vitals-node-stable'
}

const FigureNode = ({ label, value, severity, style }) => (
  <div className={hotSpotTone(severity)} style={style}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
)

const VitalsFigure = ({ latestVitals }) => {
  const bpSeverity = latestVitals?.bp_systolic >= 140 || latestVitals?.bp_diastolic >= 90 ? 'high' : 'stable'
  const pulseSeverity = latestVitals?.pulse_rate >= 110 || latestVitals?.pulse_rate <= 55 ? 'medium' : 'stable'
  const fetalSeverity = latestVitals?.fetal_heart_rate && (latestVitals.fetal_heart_rate < 110 || latestVitals.fetal_heart_rate > 160) ? 'high' : 'stable'
  const tempSeverity = latestVitals?.temperature >= 37.8 ? 'medium' : 'stable'

  return (
    <div className="vitals-figure-scene">
      <div className="vitals-figure-grid" />
      <div className="vitals-figure-platform" />
      <div className="vitals-figure">
        <div className="vitals-figure-head" />
        <div className="vitals-figure-torso" />
        <div className="vitals-figure-arm vitals-figure-arm-left" />
        <div className="vitals-figure-arm vitals-figure-arm-right" />
        <div className="vitals-figure-leg vitals-figure-leg-left" />
        <div className="vitals-figure-leg vitals-figure-leg-right" />
      </div>
      <FigureNode
        label="Temp"
        value={latestVitals?.temperature ? `${latestVitals.temperature} C` : '--'}
        severity={tempSeverity}
        style={{ top: '12%', right: '6%' }}
      />
      <FigureNode
        label="BP"
        value={latestVitals?.bp_systolic ? `${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}` : '--'}
        severity={bpSeverity}
        style={{ top: '34%', left: '2%' }}
      />
      <FigureNode
        label="Pulse"
        value={latestVitals?.pulse_rate ? `${latestVitals.pulse_rate} bpm` : '--'}
        severity={pulseSeverity}
        style={{ top: '48%', right: '3%' }}
      />
      <FigureNode
        label="FHR"
        value={latestVitals?.fetal_heart_rate ? `${latestVitals.fetal_heart_rate} bpm` : '--'}
        severity={fetalSeverity}
        style={{ top: '62%', left: '1%' }}
      />
    </div>
  )
}

export default function VitalsPage() {
  const queryClient = useQueryClient()
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [notice, setNotice] = useState('')
  const [alerts, setAlerts] = useState([])

  const { data: patientsResponse, isLoading: patientsLoading } = useQuery({
    queryKey: ['vitals-patients'],
    queryFn: () => api.get('/patients', { params: { limit: 150 } }).then((response) => response.data),
  })

  const patients = patientsResponse?.data || []

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].id)
    }
  }, [patients, selectedPatientId])

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['patient-vitals-summary', selectedPatientId],
    queryFn: () => api.get(`/patients/${selectedPatientId}/summary`).then((response) => response.data.data),
    enabled: Boolean(selectedPatientId),
  })

  const { data: vitalsResponse, isLoading: vitalsLoading, refetch: refetchVitals } = useQuery({
    queryKey: ['patient-vitals-stream', selectedPatientId],
    queryFn: () => api.get(`/vitals/patient/${selectedPatientId}`, { params: { limit: 20 } }).then((response) => response.data),
    enabled: Boolean(selectedPatientId),
    refetchInterval: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/vitals', payload).then((response) => response.data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['patient-vitals-summary', selectedPatientId] })
      queryClient.invalidateQueries({ queryKey: ['patient-vitals-stream', selectedPatientId] })
      setNotice('Vitals saved successfully and the monitoring panel has been refreshed.')
      setAlerts(response.alerts || [])
      setForm((current) => ({
        ...EMPTY_FORM,
        visitDate: current.visitDate,
        heightCm: current.heightCm,
        gestationalAgeWeeks: current.gestationalAgeWeeks,
      }))
    },
  })

  const vitals = vitalsResponse?.data || []
  const latestVitals = summary?.recentVitals?.[0] || vitals[0] || null
  const activePregnancy = summary?.activePregnancy || null
  const patient = summary?.patient || null

  const chartData = useMemo(() => (
    [...vitals].reverse().map((item) => ({
      date: formatDate(item.visit_date),
      systolic: item.bp_systolic,
      diastolic: item.bp_diastolic,
      pulse: item.pulse_rate,
      fetalHeartRate: item.fetal_heart_rate,
      weightKg: item.weight_kg,
    }))
  ), [vitals])

  const handleSubmit = (event) => {
    event.preventDefault()
    setNotice('')
    setAlerts([])

    createMutation.mutate({
      patientId: selectedPatientId,
      pregnancyId: activePregnancy?.id,
      visitDate: form.visitDate,
      gestationalAgeWeeks: parseNumber(form.gestationalAgeWeeks),
      weightKg: parseNumber(form.weightKg),
      heightCm: parseNumber(form.heightCm),
      bpSystolic: parseNumber(form.bpSystolic),
      bpDiastolic: parseNumber(form.bpDiastolic),
      pulseRate: parseNumber(form.pulseRate),
      temperature: parseNumber(form.temperature),
      respiratoryRate: parseNumber(form.respiratoryRate),
      fundalHeightCm: parseNumber(form.fundalHeightCm),
      fetalHeartRate: parseNumber(form.fetalHeartRate),
      fetalPresentation: form.fetalPresentation || undefined,
      fetalMovement: form.fetalMovement || undefined,
      edema: form.edema || undefined,
      notes: form.notes || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">3D Vitals Command Center</h1>
          <p className="page-sub">Record maternal vitals, watch trend lines, and review a visual body map for fast clinical interpretation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => { refetchSummary(); refetchVitals() }}>Refresh panel</button>
        </div>
      </div>

      <div className="card">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <label className="label">Select patient</label>
            <select
              className="input"
              value={selectedPatientId}
              onChange={(event) => {
                setSelectedPatientId(event.target.value)
                setNotice('')
                setAlerts([])
              }}
            >
              {patientsLoading ? <option>Loading patients...</option> : null}
              {!patientsLoading && patients.length === 0 ? <option>No patients available</option> : null}
              {patients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.first_name} {item.last_name} | {item.patient_code || 'Patient code pending'}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Current patient summary</p>
            {summaryLoading ? (
              <div className="mt-5 flex justify-center"><div className="loading-spinner h-8 w-8" /></div>
            ) : patient ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{patient.first_name} {patient.last_name}</p>
                  <p className="text-xs text-slate-500">{patient.city || 'City not set'} | {patient.barangay || 'Barangay not set'}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{activePregnancy ? `EDD ${new Date(activePregnancy.edd).toLocaleDateString('en-PH')}` : 'No active pregnancy'}</p>
                  <p className="text-xs text-slate-500">Risk: {patient.risk_level || 'low'}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Choose a patient to load the monitoring workspace.</p>
            )}
          </div>
        </div>
      </div>

      {notice ? <div className="alert-success"><span>{notice}</span></div> : null}
      {createMutation.isError ? <div className="alert-critical"><span>{createMutation.error.response?.data?.message || 'Unable to save vitals.'}</span></div> : null}
      {alerts.length > 0 ? (
        <div className="grid gap-3">
          {alerts.map((alert, index) => (
            <div key={`${alert.type}-${index}`} className={alert.type === 'critical' ? 'alert-critical' : 'alert-warning'}>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="section-title mb-1">3D maternal body view</h3>
                <p className="text-sm text-slate-500">The figure highlights the latest temperature, blood pressure, pulse, and fetal heart rate zones.</p>
              </div>
              <span className={`badge ${patient?.risk_level === 'high' ? 'badge-danger' : patient?.risk_level === 'moderate' ? 'badge-warning' : 'badge-success'}`}>
                {patient?.risk_level || 'low'} risk
              </span>
            </div>
            <VitalsFigure latestVitals={latestVitals} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="card">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Blood pressure</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{latestVitals?.bp_systolic ? `${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}` : '--'}</p>
              <p className="mt-2 text-sm text-slate-500">{latestVitals?.bp_category || 'No BP category yet'}</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Pulse</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{latestVitals?.pulse_rate ? `${latestVitals.pulse_rate} bpm` : '--'}</p>
              <p className="mt-2 text-sm text-slate-500">Latest maternal pulse reading</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Fetal heart</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{latestVitals?.fetal_heart_rate ? `${latestVitals.fetal_heart_rate} bpm` : '--'}</p>
              <p className="mt-2 text-sm text-slate-500">Normal target 110-160 bpm</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Weight</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{latestVitals?.weight_kg ? `${latestVitals.weight_kg} kg` : '--'}</p>
              <p className="mt-2 text-sm text-slate-500">{latestVitals?.visit_date ? `Recorded ${formatDate(latestVitals.visit_date)}` : 'No recent weight entry'}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="section-title mb-4">Blood pressure trend</h3>
              {vitalsLoading ? (
                <div className="flex justify-center py-12"><div className="loading-spinner h-8 w-8" /></div>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-slate-500">No vitals trend recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="systolic" stroke="#b91c1c" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="diastolic" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3 className="section-title mb-4">Maternal and fetal response</h3>
              {vitalsLoading ? (
                <div className="flex justify-center py-12"><div className="loading-spinner h-8 w-8" /></div>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-slate-500">No pulse or fetal trend recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="pulse" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="fetalHeartRate" fill="#0ea5e9" stroke="#0ea5e9" fillOpacity={0.18} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title mb-0">Latest vitals history</h3>
              <span className="badge badge-gray">{vitals.length}</span>
            </div>

            {vitalsLoading ? (
              <div className="flex justify-center py-12"><div className="loading-spinner h-8 w-8" /></div>
            ) : vitals.length === 0 ? (
              <p className="text-sm text-slate-500">No vitals have been recorded for this patient yet.</p>
            ) : (
              <div className="space-y-3">
                {vitals.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[0.9fr_1.4fr_1fr]">
                    <div>
                      <p className="font-medium text-slate-900">{new Date(entry.visit_date).toLocaleDateString('en-PH')}</p>
                      <p className="text-xs text-slate-500">{entry.recorded_by_name || 'MWOS staff'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                      <span className="badge badge-gray">BP {entry.bp_systolic ? `${entry.bp_systolic}/${entry.bp_diastolic}` : '--'}</span>
                      <span className="badge badge-gray">Pulse {entry.pulse_rate || '--'}</span>
                      <span className="badge badge-gray">FHR {entry.fetal_heart_rate || '--'}</span>
                      <span className="badge badge-gray">Weight {entry.weight_kg || '--'}</span>
                    </div>
                    <div className="text-sm text-slate-500">{entry.notes || 'No notes recorded.'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <form className="card space-y-5" onSubmit={handleSubmit}>
            <div>
              <h3 className="section-title mb-1">Record new vitals</h3>
              <p className="text-sm text-slate-500">Capture a complete visit entry in one pass, including maternal and fetal observations.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Visit date</label>
                <input className="input" type="date" value={form.visitDate} onChange={(event) => setForm((current) => ({ ...current, visitDate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Gestational age (weeks)</label>
                <input className="input" type="number" value={form.gestationalAgeWeeks} onChange={(event) => setForm((current) => ({ ...current, gestationalAgeWeeks: event.target.value }))} />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input className="input" type="number" step="0.01" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} />
              </div>
              <div>
                <label className="label">Height (cm)</label>
                <input className="input" type="number" step="0.01" value={form.heightCm} onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))} />
              </div>
              <div>
                <label className="label">BP systolic</label>
                <input className="input" type="number" value={form.bpSystolic} onChange={(event) => setForm((current) => ({ ...current, bpSystolic: event.target.value }))} />
              </div>
              <div>
                <label className="label">BP diastolic</label>
                <input className="input" type="number" value={form.bpDiastolic} onChange={(event) => setForm((current) => ({ ...current, bpDiastolic: event.target.value }))} />
              </div>
              <div>
                <label className="label">Pulse rate</label>
                <input className="input" type="number" value={form.pulseRate} onChange={(event) => setForm((current) => ({ ...current, pulseRate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Temperature (C)</label>
                <input className="input" type="number" step="0.1" value={form.temperature} onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value }))} />
              </div>
              <div>
                <label className="label">Respiratory rate</label>
                <input className="input" type="number" value={form.respiratoryRate} onChange={(event) => setForm((current) => ({ ...current, respiratoryRate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Fundal height (cm)</label>
                <input className="input" type="number" step="0.1" value={form.fundalHeightCm} onChange={(event) => setForm((current) => ({ ...current, fundalHeightCm: event.target.value }))} />
              </div>
              <div>
                <label className="label">Fetal heart rate</label>
                <input className="input" type="number" value={form.fetalHeartRate} onChange={(event) => setForm((current) => ({ ...current, fetalHeartRate: event.target.value }))} />
              </div>
              <div>
                <label className="label">Fetal presentation</label>
                <input className="input" value={form.fetalPresentation} onChange={(event) => setForm((current) => ({ ...current, fetalPresentation: event.target.value }))} placeholder="Cephalic, breech..." />
              </div>
              <div>
                <label className="label">Fetal movement</label>
                <select className="input" value={form.fetalMovement} onChange={(event) => setForm((current) => ({ ...current, fetalMovement: event.target.value }))}>
                  <option value="present">Present</option>
                  <option value="reduced">Reduced</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              <div>
                <label className="label">Edema</label>
                <select className="input" value={form.edema} onChange={(event) => setForm((current) => ({ ...current, edema: event.target.value }))}>
                  <option value="none">None</option>
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-[110px]" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Document symptoms, counseling, medication reminders, or escalation notes." />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Entries with very high blood pressure, absent fetal movement, or abnormal fetal heart rate will trigger an on-screen alert after saving.
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={createMutation.isPending || !selectedPatientId}>
                {createMutation.isPending ? 'Saving vitals...' : 'Save vitals entry'}
              </button>
            </div>
          </form>

          <div className="card">
            <h3 className="section-title mb-4">Latest care flags</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-medium text-slate-900">Movement status</p>
                <p className="mt-1">{latestVitals?.fetal_movement || 'No movement entry yet'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-medium text-slate-900">Edema check</p>
                <p className="mt-1">{latestVitals?.edema || 'No edema entry yet'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-medium text-slate-900">Upcoming appointments</p>
                <p className="mt-1">{summary?.upcomingAppointments?.length || 0} scheduled visit(s)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
