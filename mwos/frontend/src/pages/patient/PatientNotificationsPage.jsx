import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { Link } from 'react-router-dom'

const emailStatus = {
  accepted: 'Email accepted by sender; inbox delivery is not guaranteed.',
  pending: 'Email is pending.', sending: 'Email delivery is being attempted.',
  failed: 'Email could not be sent. This MWOS notification is still saved.',
  unconfigured: 'Email was not sent: the clinic email service is not connected.',
  no_verified_recipient: 'Email was not sent: no Google-verified recipient is linked to this account. Your MWOS notification is still saved.',
}

const badgeTone = {
  critical: 'badge-danger',
  warning: 'badge-warning',
  success: 'badge-success',
  info: 'badge-info',
}

const formatDateTime = (value) => new Date(value).toLocaleString('en-PH', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const patientLinks = new Map([
  ['/my/settings', 'Review security settings'],
  ['/my/appointments', 'Review appointment'],
  ['/my/health-records', 'Open health records'],
  ['/my/scheduling', 'Review consultation schedule'],
])
const staffLinks = new Map([
  ['/scheduling', 'Review consultation schedule'],
])

export default function PatientNotificationsPage({ patient = true }) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-notifications'],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = data || []

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">Review clinic alerts, reminders, and schedule changes.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
      ) : error ? (
        <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load notifications.'}</span></div>
      ) : !notifications.length ? (
        <div className="card text-sm text-gray-500">No notifications yet.</div>
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => {
            const route = item.metadata?.route
            const linkLabel = (patient ? patientLinks : staffLinks).get(route)
            return (
              <div key={item.id} className={`card ${!item.is_read ? 'border-rose-200 bg-rose-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${badgeTone[item.type] || 'badge-info'}`}>{item.type || 'info'}</span>
                      {!item.is_read ? <span className="badge badge-gray">New</span> : null}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-2 text-sm text-gray-600">{item.body}</p>
                    {emailStatus[item.email_status] ? <p className="mt-2 text-xs text-slate-500">{emailStatus[item.email_status]}</p> : null}
                    {linkLabel ? <Link className="mt-3 inline-block text-sm font-semibold text-[var(--accent)] underline" to={route}>{linkLabel}</Link> : null}
                    <p className="mt-3 text-xs text-gray-400">{formatDateTime(item.created_at)}</p>
                  </div>
                  {!item.is_read ? (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => markReadMutation.mutate(item.id)}>
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
