import React from 'react'
import { Link } from 'react-router-dom'
import AppIcon from '../common/AppIcon'
import { careLabel, formatCareDate, formatCareTime, getOpenCareTasks, getRequirementSummary } from '../../utils/recordedCare'

export default function MaternalCareOverview({ dashboard, patientName, tasks = [], requirements = [], tasksLoading, tasksError, requirementsLoading, requirementsError }) {
  const pregnancy = dashboard.activePregnancy
  const appointment = dashboard.nextAppointment
  const followUps = getOpenCareTasks(tasks)
  const documents = getRequirementSummary(requirements)

  return (
    <section aria-label="Maternal care overview" className="overflow-hidden rounded-[32px] border border-rose-100 bg-gradient-to-br from-[#fff8f4] via-white to-[#f0f9f6] p-5 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">TMC Copino care planner</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Your next steps, in one place.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{patientName ? `Welcome, ${patientName}. ` : ''}Plan your visit, review clinic instructions, and keep your records ready. Details below come from your clinic record.</p>
        </div>
        <Link to="/my/messages" className="btn-secondary btn-sm"><AppIcon name="messages" className="h-4 w-4" />Message the clinic</Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-rose-100 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)] dark:text-rose-300"><AppIcon name="calendar" />Next clinic visit</p>
          <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">{appointment ? formatCareDate(appointment.scheduled_date, 'Date to be confirmed') : 'No visit scheduled'}</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{appointment ? `${formatCareTime(appointment.scheduled_time)} | ${careLabel(appointment.appointment_type, 'Clinic visit')}` : 'Request a schedule or ask the clinic about your next follow-up.'}</p>
          {appointment ? <p className="mt-2 text-xs capitalize text-slate-500 dark:text-slate-400">Appointment status: {careLabel(appointment.status, 'To be confirmed')}</p> : null}
          <Link to="/my/appointments" className="btn-primary btn-sm mt-5">{appointment ? 'Review appointment' : 'Request an appointment'}</Link>
        </article>

        <article className="rounded-3xl border border-teal-100 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-800 dark:text-teal-200"><AppIcon name="prenatal" />Pregnancy care record</p>
          <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">{pregnancy ? 'Estimated due date' : 'Care for every stage'}</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{pregnancy ? formatCareDate(pregnancy.edd) : 'No active pregnancy is recorded. Your general, postnatal, and other clinic services remain available.'}</p>
          {pregnancy ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Clinic-recorded risk: {careLabel(pregnancy.risk_level)}. Not a current health assessment.</p> : null}
          <Link to="/my/records" className="btn-secondary btn-sm mt-5">Review care records</Link>
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><AppIcon name="records" />Before your visit</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {requirementsLoading ? 'Checking your clinic requirements...' : requirementsError ? 'Requirements could not be loaded. Open your records to retry; their status is unknown.' : documents.required === 0 ? 'The clinic has not assigned required documents yet.' : documents.needsAction > 0 ? `${documents.needsAction} required ${documents.needsAction === 1 ? 'document needs' : 'documents need'} your attention. Review missing or returned submissions.` : `${documents.approved} of ${documents.required} required documents approved. Other submissions may still be under review.`}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>Review your appointment details and clinic instructions.</li>
            <li>Keep requested documents and previous results ready.</li>
            <li>Save your current contact number in Settings.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/my/records" className="text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4 dark:text-rose-300">Review requirements</Link>
            <Link to="/my/settings" className="text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4 dark:text-rose-300">Update contact details</Link>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><AppIcon name="compliance" />Clinic follow-ups</h3>
            {!tasksLoading && !tasksError ? <span className="badge badge-gray">{followUps.length} open</span> : null}
          </div>
          {tasksLoading ? <p className="mt-3 text-sm text-slate-500">Loading follow-up instructions...</p> : tasksError ? <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">Follow-ups could not be loaded. Please check Messages or try again.</p> : followUps.length ? (
            <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto pr-1 dark:divide-slate-700" aria-label="Open clinic follow-up tasks" tabIndex={0}>
              {followUps.map((task) => (
                <li key={task.id} className="py-3 first:pt-0">
                  <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{task.title}</p>
                  {task.description ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{task.description}</p> : null}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{careLabel(task.status, 'Open')}{task.due_date ? ` | Due ${formatCareDate(task.due_date)}` : ' | No due date set'}</p>
                  {task.thread_id ? <Link to="/my/messages" state={{ threadId: task.thread_id }} className="mt-1 inline-block text-xs font-semibold text-[var(--accent-strong)] underline dark:text-rose-300">Open related conversation</Link> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">No open follow-up tasks are shared with you. Continue to follow the instructions given by your care team.</p>}
          <Link to="/my/messages" className="btn-secondary btn-sm mt-4">{dashboard.unreadMessages > 0 ? `Read ${dashboard.unreadMessages} unread ${dashboard.unreadMessages === 1 ? 'conversation' : 'conversations'}` : 'Contact your care team'}</Link>
        </article>
      </div>
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><AppIcon name="emergency" className="mt-0.5 h-4 w-4" /><span>This portal is not continuously monitored and is not an emergency response service. For urgent help, contact local emergency services or the nearest appropriate facility. <Link to="/my/emergency" className="font-semibold underline">View urgent contact options</Link>.</span></p>
    </section>
  )
}
