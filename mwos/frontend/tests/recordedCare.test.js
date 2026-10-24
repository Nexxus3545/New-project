import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { access, readFile } from 'node:fs/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { createServer } from 'vite'
import { careLabel, formatCareDate, formatCareTime, getOpenCareTasks, getRecordedTrend, getRecordedVitals, getRequirementSummary, recordedNumber } from '../src/utils/recordedCare.js'

let server
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, watch: null, hmr: { port: 30000 + process.pid % 20000 } } })
})
after(async () => { await server?.close() })

test('the obsolete simulated monitor cannot be imported or bundled by a patient page', async () => {
  await assert.rejects(access(new URL('../src/components/patient/RealtimeVitalsPanel.jsx', import.meta.url)), { code: 'ENOENT' })
  for (const file of ['PatientDashboardPage', 'PatientReportsPage', 'PatientVitalsPage']) {
    const source = await readFile(new URL(`../src/pages/patient/${file}.jsx`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /RealtimeVitalsPanel|Live maternal telemetry|simulated live swing|Routine live watch/)
    assert.match(source, /RecordedVitalsCard/)
  }
})

test('missing, invalid, and partial measurements never become invented normal readings', () => {
  for (const value of [null, undefined, '', ' ', false, true, 0, -1, 'NaN', Infinity]) assert.equal(recordedNumber(value), null)
  assert.equal(recordedNumber('118'), 118)
  assert.equal(recordedNumber('62.5'), 62.5)
  assert.deepEqual(getRecordedVitals(null).map((item) => item.value), Array(4).fill('Not recorded'))
  assert.equal(getRecordedVitals({ bp_systolic: 118 })[0].value, 'Not recorded')
  assert.deepEqual(getRecordedVitals({ bp_systolic: '118', bp_diastolic: '76', fetal_heart_rate: 145, weight_kg: '62.5', fetal_movement: 'reduced' }, { includeMaternal: true }).map((item) => item.value), ['118/76', 145, 62.5, 'reduced'])
  assert.equal(careLabel(null), 'Not recorded')
})

test('calendar labels handle missing dates and appointment times explicitly', () => {
  assert.equal(formatCareDate('not-a-date'), 'Not recorded')
  assert.equal(formatCareDate(null), 'Not recorded')
  assert.match(formatCareDate('2026-10-25'), /Oct 25, 2026/)
  assert.equal(formatCareTime('00:15:00'), '12:15 AM')
  assert.equal(formatCareTime('13:30:00'), '1:30 PM')
  for (const value of [null, '', '25:00', '12:60']) assert.equal(formatCareTime(value), 'Time to be confirmed')
})

test('history is chronological, immutable, and uses gaps instead of zero for missing readings', () => {
  const input = [{ visit_date: '2026-10-23', bp_systolic: 120 }, { visit_date: '2026-10-21', bp_systolic: '118', bp_diastolic: '76' }, { visit_date: 'invalid', bp_systolic: 999 }]
  const snapshot = JSON.stringify(input)
  assert.deepEqual(getRecordedTrend(input).map(({ systolic, diastolic }) => [systolic, diastolic]), [[118, 76], [120, null]])
  assert.equal(JSON.stringify(input), snapshot)
  assert.equal(getRecordedTrend(Array.from({ length: 10 }, (_, i) => ({ visit_date: `2026-10-${String(i + 1).padStart(2, '0')}` }))).length, 5)
})

test('follow-ups exclude closed work and document counts distinguish missing, submitted, and approved', () => {
  assert.deepEqual(getOpenCareTasks([{ id: 1, status: 'completed' }, { id: 2, status: 'cancelled' }, { id: 3, status: 'open' }]).map((task) => task.id), [3])
  const requirements = [undefined, 'rejected', 'approved', 'submitted', 'pending_review'].map((status) => ({ isRequired: true, submission: { status } }))
  requirements.push({ isRequired: false })
  assert.deepEqual(getRequirementSummary(requirements), { required: 5, approved: 1, needsAction: 2 })
})

async function renderComponent(file, props) {
  const { default: Component } = await server.ssrLoadModule(`/src/components/patient/${file}.jsx`)
  return renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(Component, props)))
}

test('recorded card has exact saved values, provenance, and no synthetic waveform or live status', async () => {
  const empty = await renderComponent('RecordedVitalsCard', {})
  assert.equal((empty.match(/>Not recorded</g) || []).length, 4)
  assert.match(empty, /not live measurements/)
  assert.doesNotMatch(empty, /Active|watch|telemetry|wave|<line |<linearGradient|<animate/i)
  const saved = await renderComponent('RecordedVitalsCard', { includeMaternal: true, latestVitals: { visit_date: '2026-10-22', bp_systolic: 121, bp_diastolic: 79, fetal_movement: 'reduced' } })
  assert.match(saved, /121\/79/)
  assert.match(saved, /Oct 22, 2026/)
  assert.match(saved, /reduced/)
  assert.match(saved, /href="\/my\/vitals"/)
})

test('care planner is useful without an active pregnancy and never invents a risk classification', async () => {
  const html = await renderComponent('MaternalCareOverview', { dashboard: {} })
  assert.match(html, /No visit scheduled/)
  assert.match(html, /General clinic care/)
  assert.doesNotMatch(html, /Pregnancy care record|Estimated due date/)
  assert.match(html, /No open follow-up tasks/)
  assert.doesNotMatch(html, /low risk|Routine live|Normal|Requirements complete/i)
  for (const route of ['appointments', 'records', 'messages', 'settings', 'emergency']) assert.match(html, new RegExp(`href="/my/${route}"`))
})

test('care planner shows real clinic tasks and requirements without displaying failures as empty success', async () => {
  const html = await renderComponent('MaternalCareOverview', {
    dashboard: { nextAppointment: { scheduled_date: '2026-10-25', scheduled_time: '13:30:00', appointment_type: 'prenatal', status: 'scheduled' }, activePregnancy: { edd: '2027-02-01' } },
    tasks: [{ id: 'open', title: 'Bring previous results', due_date: '2026-10-24', status: 'open', thread_id: 'test-thread' }, { id: 'closed', title: 'Should not appear', status: 'cancelled' }],
    requirements: [{ isRequired: true }],
  })
  assert.match(html, /1:30 PM/)
  assert.match(html, /Bring previous results/)
  assert.match(html, /1 required document/)
  assert.doesNotMatch(html, /Should not appear/)
  const failed = await renderComponent('MaternalCareOverview', { dashboard: {}, tasksError: true, requirementsError: true })
  assert.match(failed, /Follow-ups could not be loaded/)
  assert.match(failed, /status is unknown/)
  assert.doesNotMatch(failed, /No open follow-up|not assigned required documents/)
})
