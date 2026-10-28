import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'
import PhilHealthPreparation from '../components/billing/PhilHealthPreparation'

const pesos = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)

export default function BillingPage() {
  const [tab, setTab] = useState('payments')
  const billing = useQuery({ queryKey: ['billing'], queryFn: () => api.get('/billing').then((response) => response.data.data) })
  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="page-title">Billing & PhilHealth</h1><p className="page-sub">Review recorded payments and prepare member details for clinic claims review.</p></div></div>
    <div className="flex flex-wrap gap-2" aria-label="Billing workspace">
      {[['payments', 'Payment records'], ['philhealth', 'PhilHealth preparation']].map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} className={tab === key ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {tab === 'philhealth' ? <PhilHealthPreparation billing={billing} /> : <section aria-label="Payment records">
      {billing.isPending ? <p role="status" className="card">Loading payment records...</p> : billing.isError ? <div role="alert" className="card"><p>Payment records could not be loaded.</p><button type="button" className="btn-secondary mt-3" onClick={() => billing.refetch()}>Try again</button></div> : <div className="table-container">
        <table className="table"><thead><tr><th>Patient</th><th>Date</th><th>Service</th><th>Bill total</th><th>Recorded PhilHealth amount</th><th>Claim reference</th><th>Payment status</th></tr></thead><tbody>
          {(billing.data || []).map((bill) => <tr key={bill.id}><td className="font-medium">{bill.patient_name}</td><td>{new Date(bill.bill_date).toLocaleDateString('en-PH')}</td><td>{bill.service_type || '—'}</td><td>{pesos(bill.total_amount)}</td><td>{Number(bill.philhealth_amount) > 0 ? pesos(bill.philhealth_amount) : '—'}</td><td>{bill.philhealth_claim_no || 'Not recorded'}</td><td>{bill.payment_status}</td></tr>)}
          {!billing.data?.length ? <tr><td colSpan={7} className="text-center">No billing records found.</td></tr> : null}
        </tbody></table>
      </div>}
      <p className="mt-3 text-xs text-slate-500">PhilHealth amounts and references are clinic records. They are not confirmation of an approved claim or reimbursement.</p>
    </section>}
  </div>
}
