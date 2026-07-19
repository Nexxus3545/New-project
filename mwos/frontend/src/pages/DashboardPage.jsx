import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '../utils/api'
import { uploadResumableFile } from '../utils/chunkedUpload'
import { useAuthStore } from '../store/authStore'

const statsMeta = [
  ['Patients', 'totalPatients'],
  ['Active Pregnancies', 'activePregnancies'],
  ['Weekly Active Users', 'weeklyActiveUsers'],
  ['Uploaded Media', 'mediaUploads'],
  ['Uploaded Documents', 'documentsUploaded'],
  ['Medicine Entries', 'medicineUploads'],
  ['Unread Threads', 'unreadThreads'],
  ['Open Care Tasks', 'openCareTasks'],
]

const statusTone = {
  verified: 'badge-success',
  rejected: 'badge-danger',
  pending: 'badge-warning',
}

const resultTypeMeta = {
  media: { label: 'Media feed', tone: 'badge-info' },
  medicine: { label: 'Medicine', tone: 'badge-success' },
  inventory: { label: 'Inventory', tone: 'badge-warning' },
  patient: { label: 'Patient', tone: 'badge-danger' },
  record: { label: 'Patient record', tone: 'badge-gray' },
}

const recommendationTone = {
  high: 'from-rose-100 to-white text-rose-900 border-rose-200',
  medium: 'from-amber-100 to-white text-amber-900 border-amber-200',
  low: 'from-sky-100 to-white text-sky-900 border-sky-200',
}

const mediaCategories = [
  'health-tip',
  'nutrition',
  'postpartum',
  'safety',
  'announcement',
  'breastfeeding',
]

const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const FeedCard = ({ post, onSeen }) => {
  const isImage = post.media_type === 'image'
  const fallbackPoster = post.poster_url || post.thumbnail_url || post.media_url

  return (
    <article className="snap-start overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[9/14] overflow-hidden bg-slate-950">
        {isImage ? (
          <img
            src={post.media_url}
            alt={post.title}
            className="h-full w-full object-cover"
            loading="lazy"
            onLoad={() => onSeen(post.id)}
          />
        ) : (
          <video
            src={post.media_url || post.video_url}
            poster={fallbackPoster || undefined}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls
            onPlay={() => onSeen(post.id)}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent px-5 pb-5 pt-16 text-white">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/70">
            <span>{post.category || 'General'}</span>
            <span>{isImage ? 'Image' : 'Video'}</span>
            <span>{formatDate(post.created_at)}</span>
          </div>
          <h4 className="text-xl font-semibold">{post.title}</h4>
          <div className="mt-3 flex items-center justify-between text-xs text-white/70">
            <span>{post.created_by_name || 'MWOS Team'}</span>
            <span>{post.engagement_views || 0} views</span>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function DashboardPage() {
  const qc = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const seenPostsRef = useRef(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: 'health-tip',
    mediaType: 'video',
    isPublished: true,
    file: null,
    mediaUrl: '',
    posterUrl: '',
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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

  const { data: feedPosts = [] } = useQuery({
    queryKey: ['media-feed-posts'],
    queryFn: () => api.get('/media-feed/posts').then((response) => response.data.data),
  })

  const { data: reviewSummary } = useQuery({
    queryKey: ['review-summary'],
    queryFn: () => api.get('/reviews/summary').then((response) => response.data.data),
  })

  const { data: pendingDocuments = [] } = useQuery({
    queryKey: ['pending-documents'],
    queryFn: () => api.get('/documents', { params: { status: 'pending' } }).then((response) => response.data.data),
  })

  const { data: aiData } = useQuery({
    queryKey: ['ai-recommendations'],
    queryFn: () => api.get('/ai/recommendations').then((response) => response.data.data),
  })

  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ['ai-search', debouncedSearch],
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
      qc.invalidateQueries({ queryKey: ['media-feed-posts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setShowUpload(false)
      setUploadTransfer({ progress: 0, status: '' })
      setUploadForm({
        title: '',
        description: '',
        category: 'health-tip',
        mediaType: 'video',
        isPublished: true,
        file: null,
        mediaUrl: '',
        posterUrl: '',
      })
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

  const trackViewMutation = useMutation({
    mutationFn: (id) => api.post(`/media-feed/posts/${id}/view`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-feed-posts'] }),
  })

  const spotlight = useMemo(() => aiData?.suggestions || [], [aiData])
  const featuredMedia = useMemo(() => aiData?.featuredMedia || [], [aiData])
  const stats = data?.stats || {}
  const backupStatus = data?.backupStatus
  const canUploadMedia = ['admin', 'doctor', 'midwife'].includes(user?.role)

  const acknowledgeView = (id) => {
    if (seenPostsRef.current.has(id)) return
    seenPostsRef.current.add(id)
    trackViewMutation.mutate(id)
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><div className="loading-spinner h-8 w-8" /></div>

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">A clearer operations dashboard for care search, media publishing, document review, and clinic-wide priorities.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUploadMedia ? <button onClick={() => setShowUpload(true)} className="btn-primary btn-sm">Upload Feed Media</button> : null}
          <button onClick={refetch} className="btn-secondary btn-sm">Refresh</button>
        </div>
      </div>

      <div className="clinic-hero rounded-[34px] p-6 md:p-8 mb-6">
        <div className="clinic-hero-grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <p className="section-kicker text-white/70">Modern birthing home control room</p>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
              A calmer, premium workspace for maternal care, medicines, and emergency response.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-white/80">
              Unified search, media publishing, document review, and emergency tracking live in one polished interface for the clinic team.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="hero-chip">Birthing home</span>
              <span className="hero-chip">Emergency transport</span>
              <span className="hero-chip">Medication safety</span>
              <span className="hero-chip">Patient support</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="clinic-metric">
              <p className="clinic-metric-label">High-risk patients</p>
              <p className="clinic-metric-value">{stats.highRiskPatients ?? 0}</p>
              <p className="clinic-metric-meta">Currently flagged for closer review.</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Open care tasks</p>
              <p className="clinic-metric-value">{stats.openCareTasks ?? 0}</p>
              <p className="clinic-metric-meta">Priority items waiting in the workflow.</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Today&apos;s appointments</p>
              <p className="clinic-metric-value">{stats.todayAppointments ?? 0}</p>
              <p className="clinic-metric-meta">Scheduled visits for the clinic day.</p>
            </div>
            <div className="clinic-metric">
              <p className="clinic-metric-label">Clinic rating</p>
              <p className="clinic-metric-value">{reviewSummary?.averageRating?.toFixed?.(2) || '0.00'}</p>
              <p className="clinic-metric-meta">{reviewSummary?.totalReviews || 0} published reviews.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Unified Care Search</p>
            <h3 className="section-title mt-2">Search medicines, feed posts, patients, and records</h3>
            <p className="mt-1 text-sm text-slate-500">A single lookup flow for daily operations with guided actions.</p>
            <input
              className="input mt-4"
              placeholder="Try: ferrous sulfate, PhilHealth, high risk, prenatal guide"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Search results</p>
              {isSearching ? <span className="text-xs text-slate-400">Searching...</span> : null}
            </div>
            {debouncedSearch.length < 2 ? (
              <p className="text-sm text-slate-400">Enter at least 2 characters to start the unified search.</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-slate-400">No matches found for "{debouncedSearch}".</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((result) => {
                  const meta = resultTypeMeta[result.result_type] || resultTypeMeta.record
                  return (
                    <div key={`${result.result_type}-${result.id}`} className="rounded-2xl border border-white bg-white/80 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{result.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-400">{result.category || meta.label}</p>
                        </div>
                        <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsMeta.map(([label, key]) => (
          <div key={key} className="card">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{stats[key] ?? '--'}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="section-title mb-1">TikTok-Style Health Feed</h3>
                <p className="text-sm text-slate-500">Admin-posted health tips, guides, posters, and announcements. Profile edits stay private and never appear in this feed.</p>
              </div>
              <span className="badge badge-gray">{feedPosts.length} posts</span>
            </div>

            {feedPosts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                No educational media uploaded yet.
              </div>
            ) : (
              <div className="max-h-[820px] space-y-4 overflow-y-auto pr-2 snap-y snap-mandatory">
                {feedPosts.map((post) => (
                  <FeedCard key={post.id} post={post} onSeen={acknowledgeView} />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="section-title mb-4">System Usage Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data?.usageTrend || []} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="events" fill="#d46b8a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="section-title mb-4">Maternal Monitoring Snapshot</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <p>{stats.highRiskPatients || 0} high-risk patients currently flagged.</p>
                  <p>{stats.recentAlerts || 0} vital alerts detected in the last 24 hours.</p>
                  <p>{stats.deliveriesThisMonth || 0} deliveries recorded this month.</p>
                  <p>{stats.todayAppointments || 0} appointments scheduled for today.</p>
              </div>
              {featuredMedia.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Media spotlight</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{featuredMedia[0].title}</p>
                  <p className="mt-1 text-sm text-slate-500">{featuredMedia[0].description || 'Recommended educational media for current care activity.'}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title mb-0">Priority Actions</h3>
              <span className="badge badge-gray">{spotlight.length}</span>
            </div>

            {spotlight.length === 0 ? (
              <p className="text-sm text-slate-400">Priority actions will appear here as patient, inventory, and document activity changes.</p>
            ) : (
              <div className="space-y-3">
                {spotlight.map((item) => (
                  <div key={item.id} className={`rounded-[26px] border bg-gradient-to-br p-4 ${recommendationTone[item.priority] || recommendationTone.low}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em]">{item.type}</p>
                      <span className="badge badge-gray">{item.priority || 'info'}</span>
                    </div>
                    <p className="mt-3 text-lg font-semibold">{item.title}</p>
                    <p className="mt-2 text-sm opacity-80">{item.description}</p>
                    {item.route ? <p className="mt-3 text-xs uppercase tracking-[0.22em] opacity-70">Suggested route: {item.route}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title mb-4">Ratings & Reviews</h3>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-4xl font-semibold text-slate-900">{reviewSummary?.averageRating?.toFixed?.(2) || '0.00'}</p>
                <p className="text-sm text-slate-500">Average rating</p>
              </div>
              <div className="text-sm text-slate-500">
                {reviewSummary?.totalReviews || 0} published review{reviewSummary?.totalReviews === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title mb-0">Pending Document Verification</h3>
              <span className="badge badge-gray">{pendingDocuments.length}</span>
            </div>

            {pendingDocuments.length === 0 ? (
              <p className="text-sm text-slate-400">No pending uploads right now.</p>
            ) : (
              <div className="space-y-3">
                {pendingDocuments.slice(0, 6).map((document) => (
                  <div key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{document.document_type}</p>
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
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title mb-4">Backup & Recovery</h3>
            {backupStatus ? (
              <div className="space-y-2 text-sm text-slate-600">
                <p>Latest backup status: <span className="font-semibold capitalize text-slate-900">{backupStatus.status}</span></p>
                <p>Last backup: {new Date(backupStatus.created_at).toLocaleString('en-PH')}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No backup log found yet.</p>
            )}
          </div>
        </div>
      </div>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Upload Feed Media</h3>
                <p className="text-sm text-slate-500">Publish official educational videos, posters, and announcements with a cleaner upload workflow.</p>
              </div>
              <button className="btn-ghost" onClick={() => { setShowUpload(false); setUploadTransfer({ progress: 0, status: '' }); setUploadError('') }}>Close</button>
            </div>
            {uploadError ? <div className="alert-critical mb-4 text-sm">{uploadError}</div> : null}
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                  <div className="aspect-[4/5] overflow-hidden">
                    {uploadPreviewUrl ? (
                      uploadForm.mediaType === 'image' ? (
                        <img src={uploadPreviewUrl} alt="Upload preview" className="h-full w-full object-cover" />
                      ) : (
                        <video src={uploadPreviewUrl} className="h-full w-full object-cover" controls muted playsInline />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                        Select a video or image to preview it before publishing to the health feed.
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Upload guidance</p>
                  <p className="mt-2">Large files upload in resumable chunks, so the clinic can continue after a connection drop instead of starting over.</p>
                  {uploadForm.file ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                      <p className="font-semibold text-slate-900">{uploadForm.file.name}</p>
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
              <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={uploadForm.isPublished} onChange={(e) => setUploadForm((current) => ({ ...current, isPublished: e.target.checked }))} />
                Publish immediately to the patient-facing media feed
              </label>
              </div>
            </div>
            {(uploadMutation.isPending || uploadTransfer.status) ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-900">
                    {uploadTransfer.status || 'Preparing upload...'}
                  </p>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {uploadTransfer.progress}%
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)] transition-all duration-300"
                    style={{ width: `${uploadTransfer.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Large uploads pause and resume safely in chunks if the clinic connection drops.
                </p>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setShowUpload(false); setUploadTransfer({ progress: 0, status: '' }); setUploadError('') }}>Cancel</button>
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
