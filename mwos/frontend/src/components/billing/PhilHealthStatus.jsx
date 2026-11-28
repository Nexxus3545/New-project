import React from 'react'
import { formatBillDate, philHealthStatusLabel } from '../../utils/billingDisplay'

export default function PhilHealthStatus({ bill }) {
  const status = bill.philhealth_payment_status
  const badge = status === 'paid' ? 'badge-success' : status === 'processing' ? 'badge-warning' : 'badge-gray'

  return (
    <div>
      <span className={`badge ${badge}`}>{philHealthStatusLabel(status)}</span>
      {bill.philhealth_status_updated_at && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Updated {formatBillDate(bill.philhealth_status_updated_at)}
        </p>
      )}
    </div>
  )
}
