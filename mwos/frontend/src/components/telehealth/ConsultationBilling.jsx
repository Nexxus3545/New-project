import React, { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { awaitingConsultationPayment, canAccessConsultationBilling, consultationBillingLink, consultationHasFutureSlot } from '../../utils/consultationBilling'
import { QueryState } from '../common/WorkflowForm'

const feeFormat = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

function BillingCode({ link, id }) {
  const [source, setSource] = useState(null)
  const [failed, setFailed] = useState(false)
  const hostname = globalThis.location?.hostname
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(hostname)

  useEffect(() => {
    let active = true
    const url = new URL(link, window.location.origin)
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url.href, { width: 240, margin: 4, errorCorrectionLevel: 'M' }))
      .then(image => { if (active) setSource(image) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [link])

  return <div id={id} className="mt-4 flex flex-col items-start gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:gap-5 dark:border-slate-700">
    {source ? <img src={source} width={240} height={240} alt="QR code to open this consultation bill in MWOS" className="h-auto max-w-full rounded-lg border bg-white" /> : null}
    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
      {failed ? <p role="alert">Could not generate the code. Use Open bill in MWOS instead.</p> : null}
      {!failed && !source ? <p role="status">Generating billing QR…</p> : null}
      {source ? <>
        <p>Scan to open this bill in MWOS. Sign-in and access to the consultation are required.</p>
        {isLocal ? <p>This local demo is reachable on this computer. Use Open bill in MWOS to try the link here.</p> : null}
        <a className="btn-secondary btn-sm" href={source} download="mwos-consultation-billing-qr.png">Download QR</a>
      </> : null}
    </div>
  </div>
}

function BillingRow({ request, patient }) {
  const [showCode, setShowCode] = useState(false)
  const qrId = useId()
  const link = consultationBillingLink(request.id)
  const date = new Date(request.scheduled_date)
  const paymentStatus = request.status === 'payment_review' ? 'Payment under review' : 'Awaiting payment reference'
  const pastSlot = !consultationHasFutureSlot(request)

  return <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold">{patient ? request.provider_name : request.patient_name}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {Number.isNaN(date.getTime()) ? 'Online consultation' : dateFormat.format(date)} · {String(request.scheduled_time ?? '').slice(0, 5)} PHT
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Consultation fee {feeFormat.format(Number(request.consultation_fee))}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{pastSlot ? 'Scheduled time passed' : paymentStatus}</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Link to={link} className="btn-primary btn-sm">Open bill in MWOS</Link>
      <button type="button" className="btn-secondary btn-sm" aria-expanded={showCode} aria-controls={showCode ? qrId : undefined} onClick={() => setShowCode(open => !open)}>
        {showCode ? 'Hide billing QR' : 'Show billing QR'}
      </button>
    </div>
    {showCode ? <BillingCode link={link} id={qrId} /> : null}
  </article>
}

export default function ConsultationBilling({ role }) {
  const permitted = canAccessConsultationBilling(role)
  const requests = useQuery({
    queryKey: ['schedule-requests'],
    queryFn: async () => (await api.get('/scheduling/requests')).data.data,
    enabled: permitted,
  })
  if (!permitted) return null

  const bills = (requests.data ?? []).filter(awaitingConsultationPayment)
  return <section className="card space-y-3" aria-labelledby="consultation-billing-heading">
    <div>
      <h2 id="consultation-billing-heading" className="section-title">Consultation billing</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Open a bill to submit a payment reference or check its review status. The clinic verifies payment separately.</p>
    </div>
    <QueryState query={requests}>
      {bills.length ? <div className="max-h-[32rem] space-y-3 overflow-y-auto p-1">
        {bills.map(request => <BillingRow key={request.id} request={request} patient={role === 'patient'} />)}
      </div> : <p className="text-sm text-slate-500 dark:text-slate-400">No online consultation bills awaiting payment or review.</p>}
    </QueryState>
  </section>
}
