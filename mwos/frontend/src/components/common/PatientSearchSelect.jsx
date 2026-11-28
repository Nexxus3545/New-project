import React, { useEffect, useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'

function patientLabel(patient) {
  const name = [patient.first_name, patient.middle_name, patient.last_name, patient.suffix].filter(Boolean).join(' ')
  const identifiers = [patient.patient_code, patient.birthing_id].filter(Boolean)
  return [name || 'Patient record', ...identifiers, patient.is_active === false ? 'Archived' : null].filter(Boolean).join(' · ')
}

export default function PatientSearchSelect({ id, value = '', onChange, selectedPatient, label = 'Select patient', disabled = false, required = false, status }) {
  const generatedId = useId()
  const fieldId = id || `patient-picker-${generatedId}`
  const searchId = `${fieldId}-search`
  const resultId = `${fieldId}-results`
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [chosen, setChosen] = useState(null)
  const normalizedSearch = search.trim().replace(/\s+/g, ' ')

  useEffect(() => {
    const timer = setTimeout(() => setTerm(normalizedSearch), 250)
    return () => clearTimeout(timer)
  }, [normalizedSearch])

  const query = useQuery({
    queryKey: ['patients', 'selection', status ?? 'all', term],
    queryFn: ({ signal }) => api.get('/patients', {
      params: { search: term || undefined, limit: 40, sort: 'name', direction: 'asc', status },
      signal,
    }).then(response => response.data),
  })

  const updating = term !== normalizedSearch || query.isPending
  const patients = updating || query.isError ? [] : query.data?.data ?? []
  const selectedInList = patients.some(patient => patient.id === value)
  const retained = chosen?.id === value ? chosen : selectedPatient?.id === value ? selectedPatient : null
  const total = Number(query.data?.pagination?.total ?? patients.length)

  const selectPatient = event => {
    const nextId = event.target.value
    const row = patients.find(patient => patient.id === nextId) ?? (retained?.id === nextId ? retained : undefined)
    setChosen(row ?? null)
    onChange(nextId, row)
  }

  return <div className="min-w-0 space-y-3">
    <div>
      <label className="label" htmlFor={searchId}>Search patient</label>
      <input id={searchId} className="input" type="search" value={search} disabled={disabled} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Birthing ID, Patient ID, or name" autoComplete="off" />
    </div>
    <div>
      <label className="label" htmlFor={fieldId}>{label}</label>
      <select id={fieldId} className="input" value={value} onChange={selectPatient} disabled={disabled || (updating && !value)} required={required} aria-describedby={resultId}>
        <option value="">Choose a patient…</option>
        {value && !selectedInList && <option value={value}>{retained ? patientLabel(retained) : 'Selected patient'}</option>}
        {patients.map(patient => <option key={patient.id} value={patient.id}>{patientLabel(patient)}</option>)}
      </select>
    </div>
    <div id={resultId} className="text-xs text-slate-500 dark:text-slate-400" role="status">
      {updating ? 'Searching patient records…' : query.isError ? (
        <>Patient search is unavailable. <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>Try again</button></>
      ) : !patients.length ? 'No matching patient records.' : total > patients.length ? (
        `Showing ${patients.length} of ${total} patients. Refine your search to narrow the list.`
      ) : null}
    </div>
  </div>
}
