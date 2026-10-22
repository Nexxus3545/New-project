import React from 'react'
import { Link } from 'react-router-dom'

export default function TransportRequestReceipt({ request, onNewRequest }) {
  const receivedAt = request.created_at ? new Date(request.created_at) : null
  const status = request.status === 'resolved' ? 'Conversation resolved' : request.status === 'archived' ? 'Conversation archived' : 'Open in clinic inbox'
  return (
    <section role="status" aria-live="polite" aria-atomic="true" className="space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">Submission confirmed</p>
        <h4 className="mt-2 text-xl font-semibold">Your transport request was sent</h4>
        <p className="mt-2 text-sm">The request is saved in the clinic inbox. You do not need to press Send again.</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2"><dt className="font-semibold">Request reference</dt><dd className="mt-1 break-all font-mono">{request.id}</dd></div>
        <div><dt className="font-semibold">Status</dt><dd className="mt-1">{status}</dd></div>
        {receivedAt && !Number.isNaN(receivedAt.getTime()) ? <div><dt className="font-semibold">Submitted</dt><dd className="mt-1">{receivedAt.toLocaleString('en-PH')}</dd></div> : null}
      </dl>
      <p className="rounded-xl bg-white/80 p-3 text-sm">
        This confirms submission only, not an ambulance dispatch or a clinic response. Keep your phone nearby and check Messages for updates. For immediate emergency assistance, call 911.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/my/messages" state={{ threadId: request.id }} className="btn-primary">View request in Messages</Link>
        <a href="tel:911" className="btn-secondary">Call 911</a>
        <button type="button" className="btn-ghost" onClick={onNewRequest}>Start a different request</button>
      </div>
    </section>
  )
}
