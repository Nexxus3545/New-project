import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import AccountCredentials from '../components/credentials/AccountCredentials'
import { credentialRequirement, effectiveCredentialStatus, userMatchesCredentialGroup } from '../utils/accountCredentials'

const roleMeta = {
  admin: { label: 'Administrator', tone: 'badge-danger' }, doctor: { label: 'Doctor', tone: 'badge-info' },
  midwife: { label: 'Midwife', tone: 'badge-success' }, nurse: { label: 'Nurse', tone: 'badge-warning' }, patient: { label: 'Patient', tone: 'badge-gray' },
}
const activityMeta = {
  online: { label: 'Online now', tone: 'badge-success' }, recent: { label: 'Recently active', tone: 'badge-info' },
  offline: { label: 'Offline', tone: 'badge-gray' }, inactive: { label: 'Inactive', tone: 'badge-danger' },
}
const groups = [['all', 'All users'], ['patients', 'Patients'], ['clinical', 'Clinical staff'], ['administrators', 'Administrators']]
const credentialStatuses = { missing: 'Not submitted', pending: 'Awaiting review', verified: 'Verified by clinic', rejected: 'Replacement needed', expired: 'Expired' }
const formatDateTime = (value) => !value || !Number.isFinite(Date.parse(value)) ? 'No activity recorded' : new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const initials = (firstName, lastName) => `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
const StatCard = ({ label, value, detail }) => <div className="card min-w-0"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>
const userCredentialStatus = (user) => user.credential_status ? effectiveCredentialStatus({ status: user.credential_status, kind: credentialRequirement(user.role), expiresAt: user.credential_expires_at }) : 'missing'

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const { data: users = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['users-admin', search, roleFilter, statusFilter],
    queryFn: () => api.get('/users', { params: { search: search.trim() || undefined, role: roleFilter === 'all' ? undefined : roleFilter, status: statusFilter === 'all' ? undefined : statusFilter } }).then((response) => {
      if (!Array.isArray(response.data.data)) throw new Error('Invalid user list')
      return response.data.data
    }), refetchInterval: 10000,
  })
  const visibleUsers = useMemo(() => users.filter((user) => userMatchesCredentialGroup(user, group)), [users, group])
  const stats = useMemo(() => ({
    total: visibleUsers.length, online: visibleUsers.filter((user) => user.activity_status === 'online').length,
    pending: visibleUsers.filter((user) => credentialRequirement(user.role) !== 'none' && userCredentialStatus(user) !== 'verified').length,
    inactive: visibleUsers.filter((user) => !user.is_active).length,
  }), [visibleUsers])
  const toggleMutation = useMutation({ mutationFn: (id) => api.patch(`/users/${id}/toggle`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users-admin'] }) })
  const changeGroup = (value) => { setGroup(value); setRoleFilter('all'); setSelectedUser(null) }
  const roles = Object.entries(roleMeta).filter(([role]) => userMatchesCredentialGroup({ role }, group))

  return <div className="min-w-0 space-y-6">
    <div className="page-header"><div><h1 className="page-title">Users & credentials</h1><p className="page-sub">Manage patient identity separately from professional licenses and administrator access.</p></div><button type="button" className="btn-secondary" disabled={isFetching} onClick={() => refetch()}>{isFetching ? 'Refreshing…' : 'Refresh users'}</button></div>
    <div className="card min-w-0 space-y-4">
      <div role="group" aria-label="User groups" className="flex flex-wrap gap-2">{groups.map(([key, label]) => <button key={key} type="button" aria-pressed={group === key} className={group === key ? 'btn-primary' : 'btn-secondary'} onClick={() => changeGroup(key)}>{label}</button>)}</div>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30"><p className="font-semibold">Patients</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">One government-issued ID, reviewed by the clinic.</p></div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="font-semibold">Doctors, nurses & midwives</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Current professional ID, license number, and expiry date.</p></div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="font-semibold">Administrators</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Administrative account access; no professional license required.</p></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard label="Matching users" value={stats.total} detail="In the selected group and filters." /><StatCard label="Online now" value={stats.online} detail="Activity recorded within 5 minutes." /><StatCard label="Needs credential review" value={stats.pending} detail="Missing, pending, rejected, or expired credentials." /><StatCard label="Inactive accounts" value={stats.inactive} detail="Access paused by an administrator." /></div>
    <div className="card grid min-w-0 gap-4 lg:grid-cols-[1.5fr_0.7fr_0.7fr]">
      <div className="min-w-0"><label className="label" htmlFor="users-search">Search people</label><input id="users-search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or phone" /></div>
      <div><label className="label" htmlFor="users-role">Role</label><select id="users-role" className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles in group</option>{roles.map(([value, role]) => <option key={value} value={value}>{role.label}</option>)}</select></div>
      <div><label className="label" htmlFor="users-status">Access status</label><select id="users-status" className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></div>
    </div>
    {toggleMutation.isError ? <p role="alert" className="alert-warning">Access could not be changed. Check your account verification in Settings, then retry.</p> : null}
    {selectedUser ? <div id="user-credential-review" className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words text-lg font-semibold">Credentials: {selectedUser.first_name} {selectedUser.last_name}</h2><button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedUser(null)}>Close credential review</button></div><AccountCredentials key={selectedUser.id} targetUser={selectedUser} adminMode onChanged={() => queryClient.invalidateQueries({ queryKey: ['users-admin'] })} /></div> : null}
    {error ? <div role="alert" className="alert-critical">Users could not be loaded. Refresh to try again.</div> : isLoading ? <p role="status" className="card">Loading users…</p> : !visibleUsers.length ? <p className="card text-sm text-slate-500">No users match this group and the current filters.</p> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">{visibleUsers.map((user) => {
      const role = roleMeta[user.role] || roleMeta.patient
      const activity = activityMeta[user.activity_status] || activityMeta.offline
      const requirement = credentialRequirement(user.role)
      const status = userCredentialStatus(user)
      return <article key={user.id} className="card-hover flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]">{initials(user.first_name, user.last_name)}</div><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{user.first_name} {user.last_name}</h3><p className="break-all text-sm text-slate-500">{user.email}</p><p className="mt-1 text-xs text-slate-500">{user.phone || 'No phone recorded'}</p></div></div><div className="flex flex-wrap gap-2"><span className={`badge ${role.tone}`}>{role.label}</span><span className={`badge ${activity.tone}`}>{activity.label}</span></div></div>
        <dl className="grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-slate-500">Last seen · Manila time</dt><dd className="mt-1">{formatDateTime(user.last_seen_at)}</dd></div><div><dt className="text-slate-500">Last sign-in · Manila time</dt><dd className="mt-1">{formatDateTime(user.last_login_at)}</dd></div></dl>
        {requirement !== 'none' ? <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{requirement === 'patient_id' ? 'Patient identity' : 'Professional license'}</h4><span className={`badge ${status === 'verified' ? 'badge-success' : status === 'rejected' || status === 'expired' ? 'badge-danger' : 'badge-warning'}`}>{credentialStatuses[status] || 'Awaiting review'}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{requirement === 'patient_id' ? 'One valid government-issued ID. Review identity independently from professional credentials.' : 'Review professional ID, license number, and expiry before approving clinical access.'}</p><button type="button" className="btn-secondary mt-3" onClick={() => { setSelectedUser(user); requestAnimationFrame(() => document.getElementById('user-credential-review')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }}>Review credentials</button></div> : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Administrator account. Professional license verification does not apply.</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><div><p className="text-sm font-semibold">Account access</p><p className="mt-1 text-xs text-slate-500">{user.is_active ? 'Active account. Credential requirements still apply.' : 'Sign-in is paused.'}</p></div><button type="button" className={user.is_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(user.id)}>{user.is_active ? 'Deactivate' : 'Reactivate'}</button></div>
      </article>
    })}</div>}
  </div>
}
