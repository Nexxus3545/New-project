import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

const roleMeta = {
  admin: { label: 'Admin', tone: 'badge-danger' },
  doctor: { label: 'Doctor', tone: 'badge-info' },
  midwife: { label: 'Midwife', tone: 'badge-success' },
  nurse: { label: 'Nurse', tone: 'badge-warning' },
  patient: { label: 'Patient', tone: 'badge-gray' },
}

const activityMeta = {
  online: { label: 'Online now', tone: 'badge-success' },
  recent: { label: 'Recently active', tone: 'badge-info' },
  offline: { label: 'Offline', tone: 'badge-gray' },
  inactive: { label: 'Inactive', tone: 'badge-danger' },
}

const staffLicenseMeta = {
  pending: { label: 'Pending review', tone: 'badge-warning' },
  verified: { label: 'Verified', tone: 'badge-success' },
  suspended: { label: 'Suspended', tone: 'badge-danger' },
  expired: { label: 'Expired', tone: 'badge-gray' },
}

const formatDateTime = (value) => {
  if (!value) return 'No activity recorded'
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatRelative = (value) => {
  if (!value) return 'Never'

  const diffMs = Date.now() - new Date(value).getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const initials = (firstName, lastName) => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()

const StatCard = ({ label, value, detail }) => (
  <div className="card">
    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    <p className="mt-2 text-sm text-slate-500">{detail}</p>
  </div>
)

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: users = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['users-admin', search, roleFilter, statusFilter],
    queryFn: () => api.get('/users', {
      params: {
        search: search.trim() || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      },
    }).then((response) => response.data.data),
    refetchInterval: 10000,
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users-admin'] }),
  })

  const licenseMutation = useMutation({
    mutationFn: ({ userId, status, staffProfile }) => api.patch(`/staff/registry/${userId}/license`, {
      status,
      professionalTitle: staffProfile?.staff_professional_title,
      department: staffProfile?.staff_department,
      licenseNumber: staffProfile?.staff_license_number,
      licenseType: staffProfile?.staff_license_type,
      credentialNotes: staffProfile?.staff_credential_notes,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users-admin'] }),
  })

  const stats = useMemo(() => {
    const total = users.length
    const online = users.filter((item) => item.activity_status === 'online').length
    const recent = users.filter((item) => item.activity_status === 'recent').length
    const inactive = users.filter((item) => !item.is_active).length

    return { total, online, recent, inactive }
  }, [users])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Real-Time User Management</h1>
          <p className="page-sub">Monitor live presence, review sign-in activity, and activate or pause access without leaving the admin workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-success">{isFetching ? 'Refreshing live state...' : 'Live auto-refresh every 10s'}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()}>Refresh now</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={stats.total} detail="All accounts returned by the current filters." />
        <StatCard label="Online now" value={stats.online} detail="Seen in the system within the last 5 minutes." />
        <StatCard label="Recently active" value={stats.recent} detail="Seen within the last hour but not currently online." />
        <StatCard label="Inactive" value={stats.inactive} detail="Accounts currently paused by an admin." />
      </div>

      <div className="card">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_0.7fr_0.7fr]">
          <div>
            <label className="label">Search people</label>
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or phone"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="doctor">Doctor</option>
              <option value="midwife">Midwife</option>
              <option value="nurse">Nurse</option>
              <option value="patient">Patient</option>
            </select>
          </div>
          <div>
            <label className="label">Access status</label>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert-critical">
          <span>{error.response?.data?.message || 'Unable to load user management data.'}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="loading-spinner h-10 w-10" /></div>
      ) : users.length === 0 ? (
        <div className="card text-sm text-slate-500">No users matched the current filters.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {users.map((user) => {
            const role = roleMeta[user.role] || roleMeta.patient
            const activity = activityMeta[user.activity_status] || activityMeta.offline
            const staffLicense = staffLicenseMeta[user.staff_license_status || 'pending'] || staffLicenseMeta.pending
            const isStaff = user.role !== 'patient'

            return (
              <article key={user.id} className="card-hover flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[var(--accent-soft)] text-base font-semibold text-[var(--accent-text)]">
                      {initials(user.first_name, user.last_name)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{user.first_name} {user.last_name}</h3>
                      <p className="text-sm text-slate-500">{user.email}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{user.phone || 'No mobile number recorded'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`badge ${role.tone}`}>{role.label}</span>
                    <span className={`badge ${activity.tone}`}>{activity.label}</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Last seen</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatRelative(user.last_seen_at)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.last_seen_at)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Last login</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatRelative(user.last_login_at)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.last_login_at)}</p>
                  </div>
                </div>

                {isStaff ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Credential status</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`badge ${staffLicense.tone}`}>{staffLicense.label}</span>
                        <span className="text-sm font-semibold text-slate-900">{user.staff_professional_title || 'Unassigned title'}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{user.staff_license_number || 'No license number on file'}</p>
                      <p className="mt-1 text-xs text-slate-500">{user.staff_department || 'No department assigned'}</p>
                    </div>
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Admin action</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">Keep the staff credential in sync with the current license review.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={licenseMutation.isPending}
                          onClick={() => licenseMutation.mutate({
                            userId: user.id,
                            status: user.staff_license_status === 'verified' ? 'suspended' : 'verified',
                            staffProfile: user,
                          })}
                        >
                          {user.staff_license_status === 'verified' ? 'Suspend license' : 'Verify license'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Access control</p>
                    <p className="text-xs text-slate-500">{user.is_active ? 'This account can sign in and use MWOS.' : 'This account is currently blocked from signing in.'}</p>
                  </div>
                  <button
                    type="button"
                    className={user.is_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate(user.id)}
                  >
                    {user.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
