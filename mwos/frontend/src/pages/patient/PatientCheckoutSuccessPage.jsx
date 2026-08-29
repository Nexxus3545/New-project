import React from 'react'
import { Link } from 'react-router-dom'

export default function PatientCheckoutSuccessPage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pickup Request Sent</h1>
          <p className="page-sub">The clinic support team can now review your pharmacy request in MWOS.</p>
        </div>
      </div>

      <div className="card text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-rose-100 text-xl font-semibold text-rose-700">
          OK
        </div>
        <h3 className="section-title mt-5">Your request is on its way</h3>
        <p className="mt-3 text-sm text-gray-600">
          Staff can follow up through notifications and the care team workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/my/pharmacy" className="btn-primary">Back to pharmacy</Link>
          <Link to="/my/notifications" className="btn-secondary">Open notifications</Link>
        </div>
      </div>
    </div>
  )
}
