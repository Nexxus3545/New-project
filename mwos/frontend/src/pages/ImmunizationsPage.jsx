import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import CoverCard from '../components/common/CoverCard'

const IMMUNIZATION_FORM = {
  vaccineName: '',
  doseNumber: 1,
  dateGiven: new Date().toISOString().slice(0, 10),
  dueDate: '',
  deliveryId: '',
  notes: '',
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--')

export default function ImmunizationsPage() {
  const qc = useQueryClient()
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [form, setForm] = useState(IMMUNIZATION_FORM)
  const [formError, setFormError] = useState('')

  const { data: patientsResponse } = useQuery({
    queryKey: ['immunization-patients'],
    queryFn: () => api.get('/patients', { params: { limit: 200 } }).then((response) => response.data),
  })

  const patients = patientsResponse?.data || []

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].id)
    }
  }, [patients, selectedPatientId])

  const selectedPatient = patients.find((patient) => String(patient.id) === String(selectedPatientId))

  const { data: immunizations = [], isLoading } = useQuery({
    queryKey: ['immunizations', selectedPatientId],
    queryFn: () => api.get(`/immunizations/${selectedPatientId}`).then((response) => response.data.data),
    enabled: Boolean(selectedPatientId),
  })

  const saveMutation = useMutation({
    mutationFn: (body) => api.post('/immunizations', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['immunizations', selectedPatientId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setForm(IMMUNIZATION_FORM)
      setFormError('')
    },
    onError: (error) => setFormError(error.response?.data?.message || 'Unable to save immunization record'),
  })

  const summary = useMemo(() => {
    const total = immunizations.length
    const dueSoon = immunizations.filter((item) => {
      if (!item.due_date) return false
      const diff = new Date(item.due_date).getTime() - Date.now()
      return diff <= 14 * 24 * 60 * 60 * 1000 && diff >= 0
    }).length
    const doseCount = immunizations.reduce((sum, item) => sum + Number(item.dose_number || 0), 0)
    const latest = immunizations[0]

    return [
      { label: 'Records', value: total, helper: 'Immunization entries tracked' },
      { label: 'Due soon', value: dueSoon, helper: 'Needs reminder or follow-up' },
      { label: 'Total doses', value: doseCount, helper: 'Combined recorded doses' },
      { label: 'Latest vaccine', value: latest?.vaccine_name || '--', helper: latest ? formatDate(latest.date_given) : 'No vaccine yet' },
    ]
  }, [immunizations])

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!selectedPatientId || !form.vaccineName || !form.dateGiven) {
      setFormError('Patient, vaccine name, and date given are required.')
      return
    }

    saveMutation.mutate({
      patientId: selectedPatientId,
      deliveryId: form.deliveryId || undefined,
      vaccineName: form.vaccineName,
      doseNumber: Number(form.doseNumber || 1),
      dateGiven: form.dateGiven,
      dueDate: form.dueDate || undefined,
      notes: form.notes || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="page-header mb-0">
            <div className="max-w-3xl">
              <p className="section-kicker">Maternal immunization</p>
              <h1 className="page-title">Immunizations</h1>
              <p className="page-sub">
                Track vaccine dates, dose numbers, and due reminders for mothers and babies in one clean screen.
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
          image="/reference/patient-intake.jpg"
          label="Vaccination tracker"
          title="A simple record for every dose and follow-up date."
          description="Keep immunizations visible alongside the rest of the maternal timeline without extra clicks."
          chips={['Vaccines', 'Dose tracking', 'Reminders']}
          tone="rose"
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
                <p className="mt-1 text-xs text-slate-500">{selectedPatient.risk_level || 'low'} risk · {selectedPatient.city || 'City not set'}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Choose a patient to open their immunization record.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">History</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Immunization records</h2>
            </div>
            <span className="badge badge-gray">{immunizations.length}</span>
          </div>

          {isLoading ? (
            <div className="mt-5 flex justify-center py-10"><div className="loading-spinner h-8 w-8" /></div>
          ) : immunizations.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">No immunizations recorded for this patient yet.</p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vaccine</th>
                    <th>Dose</th>
                    <th>Date given</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {immunizations.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <p className="font-medium text-slate-900 dark:text-slate-50">{item.vaccine_name}</p>
                        <p className="text-xs text-slate-400">{item.notes || 'No notes recorded.'}</p>
                      </td>
                      <td>
                        <span className="badge badge-info">Dose {item.dose_number || 1}</span>
                      </td>
                      <td>{formatDate(item.date_given)}</td>
                      <td>{formatDate(item.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Add immunization</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">New vaccine record</h3>
            </div>
            <span className="badge badge-info">Record</span>
          </div>

          {formError ? <div className="alert-critical text-sm">{formError}</div> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Vaccine name</label>
              <input
                className="input"
                value={form.vaccineName}
                onChange={(event) => setForm((current) => ({ ...current, vaccineName: event.target.value }))}
                placeholder="BCG / Hepatitis B / Tetanus toxoid"
              />
            </div>
            <div>
              <label className="label">Dose number</label>
              <input
                className="input"
                type="number"
                min="1"
                value={form.doseNumber}
                onChange={(event) => setForm((current) => ({ ...current, doseNumber: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">Date given</label>
              <input
                className="input"
                type="date"
                value={form.dateGiven}
                onChange={(event) => setForm((current) => ({ ...current, dateGiven: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">Due date</label>
              <input
                className="input"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">Delivery ID</label>
              <input
                className="input"
                value={form.deliveryId}
                onChange={(event) => setForm((current) => ({ ...current, deliveryId: event.target.value }))}
                placeholder="Optional link to delivery"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea
                className="input min-h-[96px]"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Reminder, clinic note, or follow-up guidance."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving immunization...' : 'Save immunization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
