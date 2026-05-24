import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'

export default function PatientDashboardPage() {
  const user = useAuthStore((state) => state.user)

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-dashboard'],
    queryFn: () => api.get('/reports/patient-dashboard').then((response) => response.data.data),
  })

  const { data: recommendations } = useQuery({
    queryKey: ['patient-care-checklist'],
    queryFn: () => api.get('/ai/recommendations').then((response) => response.data.data),
  })

  const { data: mediaFeed = [] } = useQuery({
    queryKey: ['patient-media-feed'],
    queryFn: () => api.get('/media-feed/posts').then((response) => response.data.data),
  })

  const { data: directory } = useQuery({
    queryKey: ['patient-dashboard-directory'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const { data: notifications = [] } = useQuery({
    queryKey: ['patient-dashboard-notifications'],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
  })

  if (isLoading) return <div className="flex justify-center py-20"><div className="loading-spinner h-8 w-8" /></div>
  if (error) return <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load dashboard'}</span></div>

  const dashboard = data || {}
  const suggestionList = recommendations?.suggestions || []
  const documentSummary = dashboard.documentSummary || {}
  const featuredMedia = (recommendations?.featuredMedia || mediaFeed).slice(0, 3)
  const featuredDoctors = (directory?.staff || []).filter((member) => ['doctor', 'midwife'].includes(member.role)).slice(0, 3)
  const unreadNotifications = notifications.filter((item) => !item.is_read).length

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {user?.firstName}!</h1>
          <p className="page-sub">Your maternal care dashboard now includes medicine guidance, emergency transport support, and cleaner clinic coordination.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card border-rose-100 bg-rose-50">
          <p className="mb-1 text-xs font-medium text-rose-600">Next Appointment</p>
          <p className="text-sm font-bold text-gray-900">{dashboard.nextAppointment ? new Date(dashboard.nextAppointment.scheduled_date).toLocaleDateString('en-PH') : 'None scheduled'}</p>
          {dashboard.nextAppointment ? <p className="mt-0.5 text-xs capitalize text-gray-500">{dashboard.nextAppointment.appointment_type} | {dashboard.nextAppointment.scheduled_time?.slice(0, 5)}</p> : null}
        </div>
        <div className="card border-sky-100 bg-sky-50">
          <p className="mb-1 text-xs font-medium text-sky-600">Active Pregnancy</p>
          <p className="text-sm font-bold text-gray-900">{dashboard.activePregnancy ? `EDD: ${new Date(dashboard.activePregnancy.edd).toLocaleDateString('en-PH')}` : 'None active'}</p>
          {dashboard.activePregnancy ? <p className="mt-0.5 text-xs text-gray-500">{dashboard.activePregnancy.risk_level} risk</p> : null}
        </div>
        <div className="card">
          <p className="mb-1 text-xs font-medium text-gray-500">Latest BP</p>
          <p className="font-mono text-sm font-bold text-gray-900">{dashboard.latestVitals?.bp_systolic ? `${dashboard.latestVitals.bp_systolic}/${dashboard.latestVitals.bp_diastolic}` : '--'}</p>
          {dashboard.latestVitals ? <p className="mt-0.5 text-xs text-gray-500">{new Date(dashboard.latestVitals.visit_date).toLocaleDateString('en-PH')}</p> : null}
        </div>
        <div className={`card ${dashboard.unpaidAmount > 0 ? 'border-amber-100 bg-amber-50' : ''}`}>
          <p className="mb-1 text-xs font-medium text-amber-600">Unpaid Balance</p>
          <p className="text-sm font-bold text-gray-900">{dashboard.unpaidAmount > 0 ? `PHP ${dashboard.unpaidAmount.toLocaleString()}` : 'None'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Link to="/my/doctors" className="card-hover">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Doctors</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">{featuredDoctors.length || '--'}</p>
          <p className="mt-2 text-sm text-gray-500">Browse the clinic care team.</p>
        </Link>
        <Link to="/my/pharmacy" className="card-hover">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pharmacy</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">Request</p>
          <p className="mt-2 text-sm text-gray-500">Browse medicines and send a pickup request.</p>
        </Link>
        <Link to="/my/notifications" className="card-hover">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Notifications</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">{unreadNotifications}</p>
          <p className="mt-2 text-sm text-gray-500">Unread clinic updates and alerts.</p>
        </Link>
        <Link to="/my/reports" className="card-hover">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Reports</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">Vitals</p>
          <p className="mt-2 text-sm text-gray-500">View trends, summaries, and document status.</p>
        </Link>
        <Link to="/my/emergency" className="card-hover">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Emergency</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">Urgent</p>
          <p className="mt-2 text-sm text-gray-500">Open emergency support and quick call actions.</p>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="section-title mb-1">Your Personalized Care Guide</h3>
                <p className="text-sm text-gray-500">Your care checklist adapts to profile details, uploaded documents, medication activity, and clinic follow-up needs.</p>
              </div>
              <span className="badge badge-gray">{suggestionList.length}</span>
            </div>

            {suggestionList.length === 0 ? (
              <p className="text-sm text-gray-400">Checklist items will appear here as your record grows.</p>
            ) : (
              <div className="space-y-3">
                {suggestionList.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">{item.type}</p>
                      <span className="badge badge-gray">{item.priority || 'info'}</span>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                    {item.route ? <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">Suggested screen: {item.route}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="section-title mb-1">Health Feed For You</h3>
                <p className="text-sm text-gray-500">Educational videos and posters from the clinic team, selected for your maternal care journey.</p>
              </div>
              <span className="badge badge-gray">{featuredMedia.length}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {featuredMedia.length === 0 ? (
                <p className="text-sm text-gray-400 md:col-span-3">No educational posts are available yet.</p>
              ) : featuredMedia.map((post) => (
                <div key={post.id} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-[4/5] overflow-hidden bg-slate-100">
                    {post.media_type === 'image' ? (
                      <img src={post.media_url} alt={post.title} className="h-full w-full object-cover" />
                    ) : (
                      <video src={post.media_url || post.video_url} poster={post.poster_url || undefined} className="h-full w-full object-cover" muted playsInline controls />
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{post.category || 'General'}</p>
                    <p className="font-semibold text-slate-900">{post.title}</p>
                    <p className="text-sm text-slate-500">{post.description || 'Clinic educational media.'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="section-title mb-1">Featured Care Team</h3>
                <p className="text-sm text-gray-500">Quick access to doctors and midwives from the patient portal.</p>
              </div>
              <Link to="/my/doctors" className="btn-secondary btn-sm">Open doctors</Link>
            </div>

            {featuredDoctors.length === 0 ? (
              <p className="text-sm text-gray-400">No care team profiles available yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {featuredDoctors.map((member) => (
                  <div key={member.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="font-semibold text-slate-900">{member.first_name} {member.last_name}</p>
                    <p className="mt-1 text-sm text-slate-500 capitalize">{member.role}</p>
                    <Link to={`/my/doctors/${member.id}`} className="mt-4 inline-flex text-sm font-medium text-teal-600 hover:underline">View profile</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="section-title mb-1">Care Team Messages</h3>
              <p className="text-sm text-gray-500">Stay in touch with the clinic and review the latest follow-up instructions.</p>
              <p className="mt-1 text-xs text-gray-400">{dashboard.unreadMessages ?? 0} unread message threads and {dashboard.openCareTasks ?? 0} active care tasks.</p>
            </div>
            <Link to="/my/interactions" className="btn-primary">Open Care Team</Link>
          </div>

          <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="section-title mb-1">Emergency Transport & Maps</h3>
              <p className="text-sm text-gray-500">Request ambulance support, review barangay and clinic routes, and open Google Maps guidance from one screen.</p>
            </div>
            <Link to="/my/emergency" className="btn-secondary">Open Emergency</Link>
          </div>

          <div className="card">
            <h3 className="section-title mb-4">Secure Document Status</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Uploaded</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{documentSummary.total || 0}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-500">Verified</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{documentSummary.verified || 0}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-500">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">{documentSummary.pending || 0}</p>
              </div>
            </div>
            <Link to="/my/profile" className="btn-secondary btn-sm mt-4 inline-flex">Manage My Documents</Link>
          </div>

          <div className="card">
            <h3 className="section-title mb-4">Community Rating</h3>
            <p className="text-4xl font-semibold text-slate-900">{Number(dashboard.reviewSummary?.average_rating || 0).toFixed(2)}</p>
            <p className="mt-2 text-sm text-slate-500">{dashboard.reviewSummary?.total_reviews || 0} published reviews across the system.</p>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title mb-0">Notifications</h3>
              <Link to="/my/notifications" className="btn-secondary btn-sm">View all</Link>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400">No notifications yet.</p>
            ) : (
              <div className="space-y-3">
                {notifications.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      {!item.is_read ? <span className="badge badge-warning">New</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{item.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="section-title mb-1">Health Tips Library</h3>
          <p className="text-sm text-gray-500">Browse structured articles and guides alongside the new media feed.</p>
        </div>
        <Link to="/my/education" className="btn-primary">Open Health Tips</Link>
      </div>
    </div>
  )
}
