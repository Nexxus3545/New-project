import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'

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

export default function PatientNotificationsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-notifications'],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-notifications'] })
    },
  })

  const notifications = data || []

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">Clinic alerts, support updates, and care activity in the same portal styling.</p>
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
          {notifications.map((item) => (
            <div key={item.id} className={`card ${!item.is_read ? 'border-rose-200 bg-rose-50/40' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className={`badge ${badgeTone[item.type] || 'badge-info'}`}>{item.type || 'info'}</span>
                    {!item.is_read ? <span className="badge badge-gray">New</span> : null}
                  </div>
                  <p className="mt-3 text-lg font-semibold text-gray-900">{item.title}</p>
                  <p className="mt-2 text-sm text-gray-600">{item.body}</p>
                  <p className="mt-3 text-xs text-gray-400">{formatDateTime(item.created_at)}</p>
                </div>
                {!item.is_read ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => markReadMutation.mutate(item.id)}>
                    Mark read
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
