export function recordedNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function formatCareDate(value, fallback = 'Not recorded') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

export function formatCareTime(value) {
  const match = typeof value === 'string' && value.match(/^(\d{2}):(\d{2})/)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return 'Time to be confirmed'
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

export function careLabel(value, fallback = 'Not recorded') {
  return typeof value === 'string' && value.trim() ? value.replace(/_/g, ' ').trim() : fallback
}

export function getRecordedVitals(vitals) {
  const systolic = recordedNumber(vitals?.bp_systolic)
  const diastolic = recordedNumber(vitals?.bp_diastolic)
  return [
    { key: 'bp', label: 'Blood pressure', value: systolic !== null && diastolic !== null ? `${systolic}/${diastolic}` : 'Not recorded', unit: 'mmHg', icon: 'health' },
    { key: 'fhr', label: 'Fetal heart rate', value: recordedNumber(vitals?.fetal_heart_rate) ?? 'Not recorded', unit: 'bpm', icon: 'prenatal' },
    { key: 'weight', label: 'Weight', value: recordedNumber(vitals?.weight_kg) ?? 'Not recorded', unit: 'kg', icon: 'records' },
    { key: 'movement', label: 'Fetal movement', value: careLabel(vitals?.fetal_movement), unit: 'Recorded observation', icon: 'baby' },
  ]
}

export function getRecordedTrend(vitals = []) {
  return vitals
    .filter((item) => item.visit_date && !Number.isNaN(new Date(item.visit_date).getTime()))
    .slice().sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))
    .slice(0, 5).reverse()
    .map((item) => ({ date: formatCareDate(item.visit_date), systolic: recordedNumber(item.bp_systolic), diastolic: recordedNumber(item.bp_diastolic) }))
}

export function getOpenCareTasks(tasks = []) {
  return tasks.filter((task) => !['completed', 'cancelled'].includes(task.status))
}

export function getRequirementSummary(requirements = []) {
  const required = requirements.filter((item) => item.isRequired)
  return {
    required: required.length,
    approved: required.filter((item) => item.submission?.status === 'approved').length,
    needsAction: required.filter((item) => !['approved', 'submitted', 'pending_review'].includes(item.submission?.status)).length,
  }
}
