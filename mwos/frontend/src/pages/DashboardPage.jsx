import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../utils/api'
import { uploadResumableFile } from '../utils/chunkedUpload'
import { useAuthStore } from '../store/authStore'
import ClinicControlBoard from '../components/dashboard/ClinicControlBoard'

const mediaCategories = ['health-tip', 'nutrition', 'postpartum', 'safety', 'announcement', 'breastfeeding']

const metricTone = {
  sky: 'from-[#eef6ff] to-white',
  lavender: 'from-[#f5f0ff] to-white',
  amber: 'from-[#fff7ea] to-white',
  rose: 'from-[#fff0f6] to-white',
}

const reportTone = {
  high: 'border-rose-200 bg-rose-50 text-rose-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-900',
  low: 'border-violet-200 bg-violet-50 text-violet-900',
  info: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
}

const statusTone = {
  verified: 'badge-success',
  rejected: 'badge-danger',
  pending: 'badge-warning',
}

const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const formatAge = (dateOfBirth) => {
  if (!dateOfBirth) return '--'
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return '--'
  const diff = Date.now() - dob.getTime()
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)))
}

const StatCard = ({ label, value, helper, tone = 'sky' }) => (
  <div className={`rounded-[24px] border border-white/80 bg-gradient-to-br ${metricTone[tone] || metricTone.sky} p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80`}>
    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
  </div>
)

const EMPTY_UPLOAD_FORM = {
  title: '',
  description: '',
  category: 'health-tip',
  mediaType: 'video',
  isPublished: true,
  file: null,
  mediaUrl: '',
  posterUrl: '',
}

export default function DashboardPage() {
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [showUpload, setShowUpload] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM)
  const [uploadError, setUploadError] = useState('')
  const [uploadTransfer, setUploadTransfer] = useState({ progress: 0, status: '' })
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    if (uploadForm.file) {
      const objectUrl = URL.createObjectURL(uploadForm.file)
      setUploadPreviewUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }

    setUploadPreviewUrl(uploadForm.mediaUrl || '')
    return undefined
  }, [uploadForm.file, uploadForm.mediaUrl])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard').then((response) => response.data.data),
    refetchInterval: 60000,
  })

  const { data: recentPatients = [] } = useQuery({
    queryKey: ['dashboard-recent-patients'],
    queryFn: () => api.get('/patients', { params: { limit: 12 } }).then((response) => response.data.data),
  })

  const { data: upcomingAppointments = [] } = useQuery({
    queryKey: ['dashboard-upcoming-appointments'],
    queryFn: () => api.get('/appointments', { params: { limit: 5 } }).then((response) => response.data.data),
  })

  const { data: reviewSummary } = useQuery({
    queryKey: ['review-summary'],
    queryFn: () => api.get('/reviews/summary').then((response) => response.data.data),
  })

  const { data: pendingDocuments = [] } = useQuery({
    queryKey: ['pending-documents'],
    queryFn: () => api.get('/documents', { params: { status: 'pending' } }).then((response) => response.data.data),
  })

  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ['dashboard-search', debouncedSearch],
    queryFn: () => api.get('/ai/search', { params: { q: debouncedSearch } }).then((response) => response.data.data),
    enabled: debouncedSearch.length >= 2,
  })

  const uploadMutation = useMutation({
    onMutate: () => {
      setUploadTransfer({ progress: 0, status: 'Preparing upload session...' })
      setUploadError('')
    },
    mutationFn: async () => {
      if (uploadForm.file) {
        return uploadResumableFile({
          targetType: 'media_feed',
          file: uploadForm.file,
          fields: {
            title: uploadForm.title,
            description: uploadForm.description,
            category: uploadForm.category,
            mediaType: uploadForm.mediaType,
            isPublished: uploadForm.isPublished,
            posterUrl: uploadForm.posterUrl,
            thumbnailUrl: uploadForm.posterUrl,
          },
          onProgress: ({ progress }) => setUploadTransfer((current) => ({ ...current, progress })),
          onStatus: (status) => setUploadTransfer((current) => ({ ...current, status })),
        })
      }

      return api.post('/media-feed/posts', {
        title: uploadForm.title,
        description: uploadForm.description,
        category: uploadForm.category,
        mediaType: uploadForm.mediaType,
        isPublished: uploadForm.isPublished,
        mediaUrl: uploadForm.mediaUrl,
        posterUrl: uploadForm.posterUrl,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setShowUpload(false)
      setUploadTransfer({ progress: 0, status: '' })
      setUploadForm(EMPTY_UPLOAD_FORM)
    },
    onError: (err) => {
      setUploadTransfer((current) => ({
        ...current,
        status: current.status || 'Upload paused. Re-try with the same file to continue from the last saved chunk.',
      }))
      setUploadError(err.response?.data?.message || err.message || 'Unable to upload media')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/documents/${id}/verify`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-documents'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const stats = data?.stats || {}
  const backupStatus = data?.backupStatus
  const canUploadMedia = ['admin', 'doctor', 'midwife'].includes(user?.role)

  const trendData = useMemo(() => {
    const source = data?.usageTrend || []
    return source.map((entry, index) => {
      const visits = Number(entry.events || 0)
      return {
        label: entry.day || `Day ${index + 1}`,
        patients: visits,
        followUps: Math.max(0, Math.round(visits * 0.72)),
      }
    })
  }, [data])

  const flowData = useMemo(() => {
    return trendData.map((item, index) => ({
      label: item.label,
      admissions: item.patients,
      discharge: Math.max(0, item.followUps - (index % 2)),
    }))
  }, [trendData])

  const reportItems = useMemo(() => {
    const items = []
    if (stats.highRiskPatients) {
      items.push({
        title: 'High-risk patients',
        description: `${stats.highRiskPatients} patient(s) flagged for closer review.`,
        tone: 'high',
      })
    }
    if (pendingDocuments.length) {
      items.push({
        title: 'Pending document verification',
        description: `${pendingDocuments.length} upload(s) waiting for review.`,
        tone: 'medium',
      })
    }
    items.push({
      title: 'Today\'s appointments',
      description: `${stats.todayAppointments || 0} visit(s) scheduled for the clinic day.`,
      tone: 'info',
    })
    items.push({
      title: 'Clinic rating',
      description: `${reviewSummary?.averageRating?.toFixed?.(2) || '0.00'} average from ${reviewSummary?.totalReviews || 0} review(s).`,
      tone: 'low',
    })
    return items.slice(0, 4)
  }, [pendingDocuments.length, reviewSummary, stats.highRiskPatients, stats.todayAppointments])

  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return recentPatients
    return recentPatients.filter((patient) => {
      const haystack = [
        patient.first_name,
        patient.last_name,
        patient.patient_code,
        patient.birthing_id,
        patient.phone,
        patient.city,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [recentPatients, searchTerm])

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="loading-spinner h-8 w-8" /></div>
  }

  if (error) {
    return (
      <div className="alert-critical">
        <p className="font-medium">Failed to load dashboard</p>
        <p className="mt-1 text-sm">{error.response?.data?.message || error.message}</p>
        <button onClick={refetch} className="btn-danger btn-sm mt-3">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-[#fff6fb] via-white to-[#f4efff] p-6 shadow-[0_24px_60px_rgba(214,92,138,0.10)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="section-kicker">Maternal control center</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">Dashboard</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
                A calm workspace for patient load, appointments, documents, medication media, and follow-up.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canUploadMedia ? <button onClick={() => setShowUpload(true)} className="btn-primary btn-sm">Upload Media</button> : null}
              <button onClick={refetch} className="btn-secondary btn-sm">Refresh</button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Patients" value={stats.totalPatients ?? filteredPatients.length ?? 0} helper="Registered patient records" tone="lavender" />
            <StatCard label="High-risk" value={stats.highRiskPatients ?? 0} helper="Currently flagged for review" tone="rose" />
            <StatCard label="Today's appointments" value={stats.todayAppointments ?? upcomingAppointments.length ?? 0} helper="Scheduled clinic visits" tone="lavender" />
            <StatCard label="Open tasks" value={stats.openCareTasks ?? 0} helper="Pending clinical actions" tone="amber" />
          </div>
        </div>

        <ClinicControlBoard appointments={upcomingAppointments} patients={recentPatients} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Hospital report</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Average Patients Visits</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Weekly trend for patient load and follow-up activity.</p>
              </div>
              <span className="badge badge-gray">{trendData.length} points</span>
            </div>

            <div className="mt-5">
              {trendData.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 text-sm text-slate-400 dark:border-slate-800">
                  No usage data available yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3d7e8" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                    <Line type="monotone" dataKey="patients" stroke="#d9468b" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="followUps" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Recent patients</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Recent Patients</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className="input w-full sm:w-72"
                  placeholder="Search patient, birthing ID, or phone..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <Link to="/patients" className="btn-primary whitespace-nowrap">Add Patient</Link>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Age</th>
                    <th>Risk</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No patients matched your search.</td>
                    </tr>
                  ) : (
                    filteredPatients.map((patient) => (
                      <tr key={patient.id}>
                        <td>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-50">
                              {patient.first_name} {patient.last_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {patient.patient_code || 'Patient code pending'} · {patient.birthing_id || 'Birthing ID pending'}
                            </p>
                          </div>
                        </td>
                        <td>{formatAge(patient.date_of_birth)}</td>
                        <td>
                          <span className={`badge ${
                            patient.risk_level === 'high' ? 'badge-danger'
                              : patient.risk_level === 'moderate' ? 'badge-warning'
                                : 'badge-success'
                          }`}
                          >
                            {patient.risk_level || 'low'}
                          </span>
                        </td>
                        <td>
                          <p>{patient.phone || '-'}</p>
                          <p className="text-xs text-slate-400">{patient.city || ''}</p>
                        </td>
                        <td>
                          {patient.pregnancy_status === 'active' ? (
                            <span className="badge badge-info">Active</span>
                          ) : (
                            <span className="badge badge-gray">Profile</span>
                          )}
                        </td>
                        <td>
                          <Link to={`/patients/${patient.id}`} className="btn-secondary btn-sm">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Reports</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Reports</h3>
              </div>
              <span className="badge badge-gray">{reportItems.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {reportItems.map((item) => (
                <div key={item.title} className={`rounded-[22px] border px-4 py-4 ${reportTone[item.tone] || reportTone.info}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-70">{item.title}</p>
                  <p className="mt-2 text-sm leading-6">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Schedule</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Upcoming Appointments</h3>
              </div>
              <span className="badge badge-info">{upcomingAppointments.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming appointments found.</p>
              ) : (
                upcomingAppointments.map((appointment) => (
                  <div key={appointment.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{appointment.patient_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(appointment.scheduled_date)} · {appointment.scheduled_time?.slice(0, 5)}
                        </p>
                      </div>
                      <span className="badge badge-gray capitalize">{appointment.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Clinic flow</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Admissions vs Follow-ups</h3>
              </div>
              <span className="badge badge-gray">Trend</span>
            </div>
            <div className="mt-4">
              {flowData.length === 0 ? (
                <p className="text-sm text-slate-400">No flow data available yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={flowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                    <Area type="monotone" dataKey="admissions" stroke="#0f766e" fill="#99f6e4" fillOpacity={0.35} />
                    <Area type="monotone" dataKey="discharge" stroke="#2563eb" fill="#bfdbfe" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Verification</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">Pending Document Verification</h3>
              </div>
              <span className="badge badge-gray">{pendingDocuments.length}</span>
            </div>

            <div className="mt-4 space-y-3">
              {pendingDocuments.length === 0 ? (
                <p className="text-sm text-slate-400">No pending uploads right now.</p>
              ) : (
                pendingDocuments.slice(0, 3).map((document) => (
                  <div key={document.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-50">{document.document_type}</p>
                        <p className="text-sm text-slate-500">{document.patient_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">OCR: {document.ocr_status || 'not processed'}</p>
                        <a href={document.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-[var(--accent)]">
                          Open uploaded file
                        </a>
                      </div>
                      <span className={`badge ${statusTone[document.verification_status] || 'badge-gray'}`}>{document.verification_status}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => verifyMutation.mutate({ id: document.id, status: 'verified' })} className="btn-primary btn-sm">
                        Verify
                      </button>
                      <button onClick={() => verifyMutation.mutate({ id: document.id, status: 'rejected' })} className="btn-secondary btn-sm">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Backup & Recovery</h3>
            {backupStatus ? (
              <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <p>Latest backup status: <span className="font-semibold capitalize text-slate-900 dark:text-slate-50">{backupStatus.status}</span></p>
                <p>Last backup: {new Date(backupStatus.created_at).toLocaleString('en-PH')}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No backup log found yet.</p>
            )}
          </div>
        </div>
      </div>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Upload Media</h3>
                <p className="text-sm text-slate-500">Publish educational videos, images, and announcements with a clean upload workflow.</p>
              </div>
              <button className="btn-ghost" onClick={() => { setShowUpload(false); setUploadTransfer({ progress: 0, status: '' }); setUploadError('') }}>
                Close
              </button>
            </div>
            {uploadError ? <div className="alert-critical mb-4 text-sm">{uploadError}</div> : null}
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="aspect-[4/5] overflow-hidden">
                    {uploadPreviewUrl ? (
                      uploadForm.mediaType === 'image' ? (
                        <img src={uploadPreviewUrl} alt="Upload preview" className="h-full w-full object-cover" />
                      ) : (
                        <video src={uploadPreviewUrl} className="h-full w-full object-cover" controls muted playsInline />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                        Select a video or image to preview it before publishing to the patient-facing media library.
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                  <p className="font-medium text-slate-900 dark:text-slate-50">Upload guidance</p>
                  <p className="mt-2">Large files upload in resumable chunks, so the clinic can continue after a connection drop instead of starting over.</p>
                  {uploadForm.file ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{uploadForm.file.name}</p>
                      <p className="mt-1">{(uploadForm.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="label">Title</label>
                  <input className="input" value={uploadForm.title} onChange={(e) => setUploadForm((current) => ({ ...current, title: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={uploadForm.category} onChange={(e) => setUploadForm((current) => ({ ...current, category: e.target.value }))}>
                    {mediaCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Media Type</label>
                  <select className="input" value={uploadForm.mediaType} onChange={(e) => setUploadForm((current) => ({ ...current, mediaType: e.target.value, file: null }))}>
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Caption</label>
                  <textarea className="input" rows={3} value={uploadForm.description} onChange={(e) => setUploadForm((current) => ({ ...current, description: e.target.value }))} placeholder="Short patient-friendly caption for the media post." />
                </div>
                <div>
                  <label className="label">{uploadForm.mediaType === 'image' ? 'Image File' : 'Video File'}</label>
                  <input className="input" type="file" accept={uploadForm.mediaType === 'image' ? 'image/*' : 'video/*'} onChange={(e) => setUploadForm((current) => ({ ...current, file: e.target.files?.[0] || null }))} />
                </div>
                <div>
                  <label className="label">Remote Media URL</label>
                  <input className="input" placeholder="Optional if you are not uploading a file" value={uploadForm.mediaUrl} onChange={(e) => setUploadForm((current) => ({ ...current, mediaUrl: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Poster / Thumbnail URL</label>
                  <input className="input" placeholder="Optional poster image for videos or hero image cards" value={uploadForm.posterUrl} onChange={(e) => setUploadForm((current) => ({ ...current, posterUrl: e.target.value }))} />
                </div>
                <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                  <input type="checkbox" checked={uploadForm.isPublished} onChange={(e) => setUploadForm((current) => ({ ...current, isPublished: e.target.checked }))} />
                  Publish immediately to the patient-facing media library
                </label>
              </div>
            </div>
            {(uploadMutation.isPending || uploadTransfer.status) ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                    {uploadTransfer.status || 'Preparing upload...'}
                  </p>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {uploadTransfer.progress}%
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)] transition-all duration-300"
                    style={{ width: `${uploadTransfer.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Large uploads pause and resume safely in chunks if the clinic connection drops.
                </p>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowUpload(false)
                  setUploadTransfer({ progress: 0, status: '' })
                  setUploadError('')
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
                {uploadMutation.isPending ? 'Publishing...' : 'Publish Media'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
