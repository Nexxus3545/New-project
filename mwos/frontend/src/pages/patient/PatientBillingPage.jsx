import React from 'react'
import { useQuery } from '@tanstack/react-query'
import PhilHealthStatus from '../../components/billing/PhilHealthStatus'
import { QueryState } from '../../components/common/WorkflowForm'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import { formatBillAmount, formatBillDate } from '../../utils/billingDisplay'

export default function PatientBillingPage() {
  const userId = useAuthStore((state) => state.user?.id)
  const billing = useQuery({
    queryKey: ['own-billing', userId],
    queryFn: () => api.get('/billing/mine').then((response) => response.data.data),
    enabled: Boolean(userId),
  })

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div>
          <h1 className="page-title">My Billing</h1>
          <p className="page-sub">Review the clinic’s records of your bills, payments, and PhilHealth status.</p>
        </div>
      </header>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        The clinic updates your PhilHealth status. Your balance reflects payments recorded on each bill.
      </p>
      <QueryState query={billing}>
        <div className="grid gap-4 xl:grid-cols-2">
          {(billing.data || []).map((bill) => (
            <article key={bill.id} className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="section-title">{bill.service_type}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{formatBillDate(bill.bill_date || bill.created_at)}</p>
                </div>
                <span className="badge badge-gray capitalize">{bill.needs_reconciliation ? 'Clinic review pending' : bill.payment_status}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div><dt className="text-sm">Bill total</dt><dd className="font-semibold">{formatBillAmount(bill.total_amount)}</dd></div>
                <div><dt className="text-sm">Recorded payments</dt><dd className="font-semibold">{formatBillAmount(bill.paid_amount)}</dd></div>
                <div><dt className="text-sm">Recorded balance</dt><dd className="font-semibold">{formatBillAmount(bill.balance)}</dd></div>
              </dl>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <p className="mb-1 text-sm font-medium">PhilHealth payment</p>
                <PhilHealthStatus bill={bill} />
              </div>
            </article>
          ))}
        </div>
        {!billing.data?.length && <p className="card">The clinic has no bills on file for your account.</p>}
      </QueryState>
    </div>
  )
}
