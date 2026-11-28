import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import PhilHealthStatus from '../components/billing/PhilHealthStatus'
import { QueryState, WorkflowForm, required } from '../components/common/WorkflowForm'
import api from '../utils/api'
import { formatBillAmount, formatBillDate, philHealthStatusLabel, philHealthStatusLabels } from '../utils/billingDisplay'
import { csvText, downloadText } from '../utils/exportRecords'

const editForms = {
  reconcile: {
    title: 'Reconcile historical payment',
    fields: [
      required(['openingPaidAmount', 'Confirmed historical paid amount (PHP)', 'number']),
      required(['note', 'Evidence / reconciliation note', 'textarea']),
    ],
  },
  payment: {
    title: 'Record payment received',
    fields: [
      required(['amount', 'Amount received (PHP)', 'number']),
      required(['paymentMethod', 'Payment method', 'select', ['cash', 'bank_transfer', 'gcash', 'card', 'other']]),
      ['reference', 'Receipt / transaction reference'],
      ['notes', 'Notes', 'textarea'],
    ],
  },
  philhealth: {
    title: 'Update PhilHealth payment status',
    fields: [required(['status', 'PhilHealth payment status', 'select', Array.from(philHealthStatusLabels)])],
  },
}

function downloadStatement({ bill, payments }) {
  const text = [
    'TMC Copino — Billing statement',
    `Reference: ${bill.id}`,
    `Patient: ${bill.patient_name}`,
    `Service: ${bill.service_type}`,
    `Total: ${formatBillAmount(bill.total_amount)}`,
    `Paid: ${formatBillAmount(bill.paid_amount)}`,
    `Balance: ${formatBillAmount(bill.balance)}`,
    `Status: ${bill.payment_status}`,
    `PhilHealth payment status: ${philHealthStatusLabel(bill.philhealth_payment_status)}`,
    `PhilHealth status last updated: ${formatBillDate(bill.philhealth_status_updated_at)}`,
    '',
    ...payments.map((payment) => `${new Date(payment.created_at).toLocaleString('en-PH')} | ${formatBillAmount(payment.amount)} | ${payment.payment_method} | ${payment.reference || payment.id}`),
    '',
    'Clinic-recorded payment statement.',
  ].join('\n')
  downloadText(`MWOS-bill-${bill.id}.txt`, text, 'text/plain;charset=utf-8')
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState(null)
  const [selected, setSelected] = useState(null)
  const [requestId, setRequestId] = useState('')
  const [notice, setNotice] = useState('')
  const billing = useQuery({ queryKey: ['billing'], queryFn: () => api.get('/billing').then((response) => response.data.data) })
  const patients = useQuery({
    queryKey: ['workflow-patients'],
    queryFn: () => api.get('/patients?limit=200').then((response) => response.data.data),
    enabled: mode === 'bill',
  })
  const detail = useQuery({
    queryKey: ['billing-detail', selected?.id],
    queryFn: () => api.get(`/billing/${selected.id}`).then((response) => response.data.data),
    enabled: Boolean(selected),
  })
  const save = useMutation({
    mutationFn: (form) => {
      if (mode === 'bill') return api.post('/billing', form)
      const billPath = `/billing/${selected.id}`
      if (mode === 'philhealth') return api.patch(`${billPath}/philhealth-status`, { status: form.status })
      if (mode === 'reconcile') return api.patch(`${billPath}/reconcile`, form)
      return api.patch(`${billPath}/pay`, { ...form, requestId })
    },
    onSuccess: async () => {
      await Promise.all(['billing', 'billing-detail', 'billing-patient', 'own-billing']
        .map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      if (mode === 'philhealth') setNotice('PhilHealth payment status updated.')
      setMode(null)
    },
  })

  const start = (kind, bill = null) => {
    setSelected(bill)
    setMode(kind)
    setNotice('')
    if (kind === 'payment') setRequestId(crypto.randomUUID())
    save.reset()
  }
  const form = mode === 'bill' ? {
    title: 'New bill',
    fields: [
      required(['patientId', 'Patient', 'select', (patients.data || []).map((patient) => [patient.id, `${patient.first_name} ${patient.last_name}`])]),
      required(['serviceType', 'Service']),
      required(['amount', 'Service amount (PHP)', 'number']),
      ['discount', 'Discount (PHP)', 'number'],
      ['notes', 'Notes', 'textarea'],
    ],
  } : editForms[mode]
  const exportBilling = () => downloadText('MWOS-billing.csv', csvText(
    ['Patient', 'Service', 'Total', 'Paid', 'Balance', 'Status', 'PhilHealth payment status', 'PhilHealth status updated'],
    billing.data.map((bill) => [
      bill.patient_name, bill.service_type, bill.total_amount, bill.paid_amount, bill.balance, bill.payment_status,
      philHealthStatusLabel(bill.philhealth_payment_status), formatBillDate(bill.philhealth_status_updated_at),
    ]),
  ))

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing &amp; Payments</h1>
          <p className="page-sub">Create bills, record payments received, and update the status of PhilHealth payments.</p>
        </div>
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => start('bill')}>Create bill</button>
      </div>
      {form && (
        <div className="space-y-3">
          {mode === 'philhealth' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Update {selected.patient_name}’s bill for {selected.service_type}. The balance reflects payments recorded on this bill.
            </p>
          )}
          <WorkflowForm
            key={`${mode}-${selected?.id || 'new'}`}
            {...form}
            initial={mode === 'philhealth' ? {
              status: philHealthStatusLabels.has(selected?.philhealth_payment_status) ? selected.philhealth_payment_status : 'not_recorded',
            } : mode === 'bill' ? { discount: 0 } : mode === 'payment' ? { paymentMethod: 'cash' } : {}}
            onSave={save.mutate}
            pending={save.isPending}
            error={save.error}
            onCancel={() => setMode(null)}
          />
        </div>
      )}
      {notice && <p role="status" className="text-sm text-slate-700 dark:text-slate-200">{notice}</p>}
      <QueryState query={billing}>
        <button type="button" className="btn-secondary" disabled={!billing.data?.length} onClick={exportBilling}>Export billing</button>
        <div className="table-container">
          <table className="table">
            <thead><tr>{['Patient', 'Service', 'Total', 'Paid', 'Balance', 'Bill status', 'PhilHealth payment', 'Actions'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {(billing.data || []).map((bill) => (
                <tr key={bill.id}>
                  <td>{bill.patient_name}</td>
                  <td>{bill.service_type}</td>
                  <td>{formatBillAmount(bill.total_amount)}</td>
                  <td>{formatBillAmount(bill.paid_amount)}</td>
                  <td>{formatBillAmount(bill.balance)}</td>
                  <td>{bill.needs_reconciliation ? 'Reconciliation required' : bill.payment_status}</td>
                  <td><PhilHealthStatus bill={bill} /></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => start(null, bill)}>View statement</button>
                      <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => start('philhealth', bill)}>Update PhilHealth status</button>
                      {bill.needs_reconciliation
                        ? <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => start('reconcile', bill)}>Reconcile</button>
                        : Number(bill.balance) > 0 && bill.payment_status !== 'waived' && (
                          <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => start('payment', bill)}>Record payment</button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!billing.data?.length && <p className="p-4">No bills yet.</p>}
        </div>
      </QueryState>
      {selected && (
        <QueryState query={detail}>
          {detail.data && (
            <section className="card">
              <h2 className="section-title">Payment history · {detail.data.bill.patient_name}</h2>
              <p className="my-3">Balance {formatBillAmount(detail.data.bill.balance)}</p>
              <div className="mb-3">
                <p className="mb-1 text-sm">PhilHealth payment</p>
                <PhilHealthStatus bill={detail.data.bill} />
              </div>
              {detail.data.payments.map((payment) => (
                <p className="border-t py-3 text-sm" key={payment.id}>
                  {formatBillDate(payment.created_at)} · {formatBillAmount(payment.amount)} · {payment.payment_method} · {payment.reference}
                </p>
              ))}
              {!detail.data.payments.length && <p className="mb-3">No new payment entries.</p>}
              <button type="button" className="btn-secondary" onClick={() => downloadStatement(detail.data)}>Download statement</button>
            </section>
          )}
        </QueryState>
      )}
    </div>
  )
}
