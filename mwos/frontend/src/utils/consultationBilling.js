const appointmentIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export const canAccessConsultationBilling = role => ['patient', 'admin', 'doctor'].includes(role)

export function getConsultationBillId(search) {
  const id = new URLSearchParams(search).get('consultationBill')
  return appointmentIdPattern.test(id ?? '') ? id.toLowerCase() : null
}

export function consultationBillingLink(id) {
  return typeof id === 'string' && appointmentIdPattern.test(id)
    ? `/portal?consultationBill=${id.toLowerCase()}`
    : null
}

export function isOnlineConsultationBill(request) {
  return request?.consultation_mode === 'online' && Boolean(request.billing_id && consultationBillingLink(request.id))
}

export const awaitingConsultationPayment = request => (
  isOnlineConsultationBill(request) && ['awaiting_payment', 'payment_review'].includes(request.status)
)

const clinicDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })

export function consultationHasFutureSlot(request, now = Date.now()) {
  if (!request?.scheduled_date) return false
  const date = new Date(request.scheduled_date)
  const time = String(request.scheduled_time ?? '').slice(0, 5)
  if (Number.isNaN(date.getTime()) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return false
  return Date.parse(`${clinicDay.format(date)}T${time}:00+08:00`) > now
}
