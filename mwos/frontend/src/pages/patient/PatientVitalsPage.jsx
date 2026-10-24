import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import RecordedVitalsCard from '../../components/patient/RecordedVitalsCard'
import { careLabel, formatCareDate, getRecordedVitals } from '../../utils/recordedCare'

export default function PatientVitalsPage() {
  const patientQuery = useQuery({
    queryKey: ['patient-me-vitals'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })
  const vitalsQuery = useQuery({
    queryKey: ['patient-visit-vitals', patientQuery.data?.id],
    queryFn: () => api.get(`/vitals/patient/${patientQuery.data.id}`).then((response) => response.data.data),
    enabled: !!patientQuery.data?.id,
  })
  if (patientQuery.isLoading || vitalsQuery.isLoading) return <div role="status" className="py-16 text-center text-sm text-slate-500">Loading saved clinic readings...</div>
  if (patientQuery.isError || vitalsQuery.isError) return <div role="alert" className="card"><h1 className="section-title">Visit history could not be loaded</h1><p className="text-sm text-slate-500">Saved readings are unavailable, not zero. Please try again.</p><button className="btn-secondary mt-4" type="button" onClick={() => patientQuery.refetch().then(() => vitalsQuery.refetch())}>Try again</button></div>
  const vitals = vitalsQuery.data || []
  return (
    <div className="space-y-6">
      <div className="page-header"><div><h1 className="page-title">My clinic readings</h1><p className="page-sub">Measurements saved by your care team during clinic visits. No body sensor is connected.</p></div></div>
      <RecordedVitalsCard latestVitals={vitals[0]} showHistoryLink={false} />
      <section className="card" aria-label="Recorded visit history">
        <h2 className="section-title">Recorded visit history</h2>
        {vitals.length === 0 ? <p className="text-sm text-slate-500">No vital signs have been recorded yet. Your care team will add readings after a clinic visit.</p> : (
          <ol className="divide-y divide-slate-200 dark:divide-slate-700">
            {vitals.map((visit) => (
              <li key={visit.id} className="py-5 first:pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{formatCareDate(visit.visit_date)}</h3><span className="badge badge-gray">Recorded BP classification: {careLabel(visit.bp_category, 'Not classified')}</span></div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{getRecordedVitals(visit).map((metric) => <div key={metric.key}><dt className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{metric.value}{metric.value !== 'Not recorded' && metric.key !== 'movement' ? ` ${metric.unit}` : ''}</dd></div>)}</dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
