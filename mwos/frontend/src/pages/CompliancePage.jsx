import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../utils/api'

const DEFAULT_FILTERS = {
  days: '30',
  search: '',
  actionPerformed: '',
  entityType: '',
  authMethod: '',
  credentialStrength: '',
}

const AUTH_METHOD_OPTIONS = [
  ['', 'All methods'],
  ['Password', 'Password'],
  ['Biometric', 'Biometric'],
  ['SMS_OTP', 'SMS OTP'],
  ['WebAuthn', 'WebAuthn'],
  ['Passkey', 'Passkey'],
]

const STRENGTH_OPTIONS = [
  ['', 'All strengths'],
  ['Base', 'Base'],
  ['Step_Up', 'Step up'],
  ['Clinical_Signature', 'Clinical signature'],
]

const formatLabel = (value) => {
  if (!value) return 'Unknown'
  return String(value)
    .replace(/[:_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const formatDateTime = (value) => {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const formatId = (value) => {
  if (!value) return '—'
  const text = String(value)
  return text.length > 12 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const downloadCsv = (filename, rows) => {
  const header = [
    'timestamp',
    'staff_name',
    'role',
    'action',
    'entity_type',
    'entity_id',
    'auth_method',
    'credential_strength',
    'notes',
    'request_id',
  ]

  const lines = [
    header.join(','),
    ...rows.map((row) => [
      csvCell(formatDateTime(row.created_at)),
      csvCell(row.staff_name || 'System'),
      csvCell(row.professional_title || row.role || 'Unknown'),
      csvCell(row.action_performed || ''),
      csvCell(row.entity_type || ''),
      csvCell(row.entity_id || ''),
      csvCell(formatLabel(row.auth_method)),
      csvCell(formatLabel(row.credential_strength)),
      csvCell(row.notes || ''),
      csvCell(row.request_id || ''),
    ].join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

const StatCard = ({ label, value, hint }) => (
  <div className="card-hover">
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-slate-400">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-slate-50">{value}</p>
    <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{hint}</p>
  </div>
)

export default function CompliancePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const limit = 25

  const summaryParams = useMemo(() => ({
    days: Number(filters.days || 30),
    search: filters.search.trim() || undefined,
    actionPerformed: filters.actionPerformed || undefined,
    entityType: filters.entityType.trim() || undefined,
    authMethod: filters.authMethod || undefined,
    credentialStrength: filters.credentialStrength || undefined,
  }), [filters])

  const auditParams = useMemo(() => ({
    ...summaryParams,
    page,
    limit,
  }), [summaryParams, page])

  const summaryQuery = useQuery({
    queryKey: ['security-audit-summary', summaryParams],
    queryFn: () => api.get('/security/audit/summary', { params: summaryParams }).then((response) => response.data.data),
  })

  const auditQuery = useQuery({
    queryKey: ['security-audit', auditParams],
    queryFn: () => api.get('/security/audit', { params: auditParams }).then((response) => response.data),
    keepPreviousData: true,
  })

  useEffect(() => {
    setPage(1)
  }, [filters.days, filters.search, filters.actionPerformed, filters.entityType, filters.authMethod, filters.credentialStrength])

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const auditRows = auditQuery.data?.data || []
  const pagination = auditQuery.data?.pagination || { page: 1, pages: 1, total: 0 }
  const summary = summaryQuery.data || {}

  const actionsChartData = (summary.byAction || []).slice(0, 6).map((item) => ({
    name: formatLabel(item.action_performed),
    count: Number(item.count || 0),
  }))

  const authChartData = (summary.byAuthMethod || []).map((item) => ({
    name: formatLabel(item.auth_method),
    count: Number(item.count || 0),
  }))

  const strengthChartData = (summary.byCredentialStrength || []).map((item) => ({
    name: formatLabel(item.credential_strength),
    count: Number(item.count || 0),
  }))

  const handleExport = () => {
    downloadCsv(
      `mwos-security-audit-page-${pagination.page || 1}.csv`,
      auditRows
    )
  }

  const topActionOptions = (summary.byAction || []).map((item) => item.action_performed)

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Compliance</h1>
          <p className="page-sub max-w-3xl">
            Review step-up events, clinical signatures, and sensitive access traces from one admin surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/users" className="btn-secondary">License review</Link>
          <button type="button" onClick={handleExport} className="btn-primary" disabled={!auditRows.length}>
            Export current page
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total events"
          value={(summary.total_events || 0).toLocaleString()}
          hint={`Last ${summaryParams.days} days`}
        />
        <StatCard
          label="Step-up events"
          value={(summary.step_up_events || 0).toLocaleString()}
          hint="OTP and step-up protected actions"
        />
        <StatCard
          label="Clinical signatures"
          value={(summary.clinical_signature_events || 0).toLocaleString()}
          hint="Signed record entries"
        />
        <StatCard
          label="Unique staff"
          value={(summary.unique_staff || 0).toLocaleString()}
          hint="Staff accounts represented in the window"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Top actions</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">Most frequent security and signature events.</p>
            </div>
            <span className="badge badge-gray">{actionsChartData.length || 0} actions</span>
          </div>
          <div className="mt-4 h-72">
            {actionsChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actionsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)' }} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-400">
                No security activity in the selected window.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="section-title">Authentication methods</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">How sensitive actions were approved.</p>
              </div>
              <span className="badge badge-gray">{summary.failed_events || 0} flagged</span>
            </div>
            <div className="mt-4 h-40">
              {authChartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={authChartData} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)' }} />
                    <Bar dataKey="count" fill="var(--accent-strong)" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-400">
                  No authentication data available.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="section-title">Credential strength</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Base, step-up, and clinical signature usage.</p>
              </div>
              <span className="badge badge-gray">{summary.signed_actions || 0} signatures</span>
            </div>
            <div className="mt-4 h-40">
              {strengthChartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={strengthChartData} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)' }} />
                    <Bar dataKey="count" fill="var(--brand-copper)" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-400">
                  No credential data available.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="label">Window</label>
            <select
              value={filters.days}
              onChange={(event) => updateFilter('days', event.target.value)}
              className="input"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 180 days</option>
            </select>
          </div>
          <div>
            <label className="label">Search</label>
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="input"
              placeholder="Action, staff name, notes, request ID"
            />
          </div>
          <div>
            <label className="label">Action</label>
            <select
              value={filters.actionPerformed}
              onChange={(event) => updateFilter('actionPerformed', event.target.value)}
              className="input"
            >
              <option value="">All actions</option>
              {topActionOptions.map((action) => (
                <option key={action} value={action}>{formatLabel(action)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Entity</label>
            <input
              value={filters.entityType}
              onChange={(event) => updateFilter('entityType', event.target.value)}
              className="input"
              placeholder="vitals, prescriptions, tele_consult"
            />
          </div>
          <div>
            <label className="label">Auth method</label>
            <select
              value={filters.authMethod}
              onChange={(event) => updateFilter('authMethod', event.target.value)}
              className="input"
            >
              {AUTH_METHOD_OPTIONS.map(([value, label]) => (
                <option key={value || 'all'} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Strength</label>
            <select
              value={filters.credentialStrength}
              onChange={(event) => updateFilter('credentialStrength', event.target.value)}
              className="input"
            >
              {STRENGTH_OPTIONS.map(([value, label]) => (
                <option key={value || 'all'} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-container">
          {auditQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="loading-spinner h-8 w-8" />
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Auth</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length ? auditRows.map((row) => (
                  <tr key={`${row.id}-${row.created_at}`}>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(row.created_at)}</td>
                    <td>
                      <div className="font-medium text-gray-900 dark:text-slate-100">{row.staff_name || 'System'}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">{row.professional_title || 'No title on file'}</div>
                    </td>
                    <td>
                      <span className="badge badge-info">{formatLabel(row.action_performed)}</span>
                    </td>
                    <td>
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{formatLabel(row.entity_type || 'security')}</div>
                      <div className="text-xs font-mono text-gray-500 dark:text-slate-400">{formatId(row.entity_id)}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-gray">{formatLabel(row.auth_method)}</span>
                        <span className="badge badge-gray">{formatLabel(row.credential_strength)}</span>
                      </div>
                    </td>
                    <td className="max-w-[24rem]">
                      <div className="text-sm text-gray-700 dark:text-slate-200">{row.notes || 'No note captured'}</div>
                      {row.request_id ? <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">Request {row.request_id}</div> : null}
                      {row.details && Object.keys(row.details || {}).length ? (
                        <details className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                          <summary className="cursor-pointer select-none">View details</summary>
                          <pre className="mt-2 overflow-auto rounded-2xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                            {JSON.stringify(row.details, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-sm text-gray-500 dark:text-slate-400">
                      No audit entries match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-slate-400">
          <p>
            Showing page {pagination.page || 1} of {pagination.pages || 1} • {Number(pagination.total || 0).toLocaleString()} total events
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pagination.page <= 1 || auditQuery.isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pagination.page >= pagination.pages || auditQuery.isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="section-title text-white">Access review shortcut</h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              License changes, account activation, and sensitive exports are handled in the staff registry and account center flows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/users" className="btn-secondary">Open staff registry</Link>
            <Link to="/account" className="btn-primary">Open my security profile</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
