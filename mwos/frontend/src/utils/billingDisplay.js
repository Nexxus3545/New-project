export const philHealthStatusLabels = new Map([
  ['not_recorded', 'Not recorded'],
  ['processing', 'In process'],
  ['paid', 'Paid to clinic'],
])

export function philHealthStatusLabel(status) {
  return philHealthStatusLabels.get(status) ?? philHealthStatusLabels.get('not_recorded')
}

const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const clinicDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

export function formatBillAmount(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : pesos.format(Number(value))
}

export function formatBillDate(value) {
  return value && Number.isFinite(Date.parse(value)) ? clinicDate.format(new Date(value)) : '—'
}
