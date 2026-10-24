import React from 'react'
import { Link } from 'react-router-dom'
import AppIcon from '../common/AppIcon'
import { formatCareDate, getRecordedVitals } from '../../utils/recordedCare'

export default function RecordedVitalsCard({ latestVitals, title = 'Last clinic measurements', showHistoryLink = true }) {
  return (
    <section aria-label={title} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Saved visit record</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            {latestVitals ? `Visit date: ${formatCareDate(latestVitals.visit_date)}.` : 'No clinic measurements have been saved yet.'}
            {' '}These are saved readings, not live measurements.
          </p>
        </div>
        {showHistoryLink ? <Link to="/my/vitals" className="btn-secondary btn-sm"><AppIcon name="records" className="h-4 w-4" />View visit history</Link> : null}
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {getRecordedVitals(latestVitals).map((metric) => (
          <div key={metric.key} className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300"><AppIcon name={metric.icon} className="h-4 w-4" />{metric.label}</dt>
            <dd className="mt-3 break-words text-xl font-semibold text-slate-900 dark:text-white">{metric.value}</dd>
            <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.unit}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">Readings are entered during clinic care. Contact your care team to discuss or correct a record; this screen does not assess your current condition.</p>
    </section>
  )
}
