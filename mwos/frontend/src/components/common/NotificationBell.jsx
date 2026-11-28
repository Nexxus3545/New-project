import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import AppIcon from './AppIcon'

const formatMoment = (value) => value ? new Date(value).toLocaleString('en-PH', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : 'Recently'

const safeRoute = (value, fallback, patient) => {
  if (typeof value !== 'string' || !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/i.test(value)) return fallback
  return value.startsWith('/my/') === patient ? value : fallback
}

export default function NotificationBell({ patient = false, userId, onNavigate }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [openAt, setOpenAt] = useState(null)
  const open = openAt === location.key
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()
  const enabled = Boolean(userId) && typeof window !== 'undefined'
  const notificationRoute = patient ? '/my/notifications' : '/notifications'
  const messageRoute = patient ? '/my/messages' : '/messages'

  const notificationsQuery = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
    enabled,
    refetchInterval: 60000,
  })
  const messagesQuery = useQuery({
    queryKey: ['message-threads', 'bell', userId],
    queryFn: () => api.get('/interactions/threads').then((response) => response.data.data),
    enabled,
    refetchInterval: 60000,
  })
  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['patient-notifications'] })
    },
  })

  useEffect(() => {
    setOpenAt(null)
  }, [location.key])

  useEffect(() => {
    if (!open) return

    const closeOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpenAt(null)
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenAt(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const items = useMemo(() => {
    const notices = (notificationsQuery.data || []).filter((item) => !item.is_read).map((item) => ({
      key: `notification-${item.id}`,
      kind: 'notice',
      id: item.id,
      title: item.title || 'Clinic update',
      body: item.body || 'There is an important MWOS update.',
      createdAt: item.created_at,
      route: safeRoute(item.metadata?.route, notificationRoute, patient),
      unread: 1,
    }))
    const messages = (messagesQuery.data || []).filter((thread) => Number(thread.unread_count) > 0).map((thread) => ({
      key: `message-${thread.id}`,
      kind: 'message',
      id: thread.id,
      title: thread.title || 'New care-team message',
      body: thread.latest_message || `New message from ${thread.latest_sender_name || 'your care team'}.`,
      createdAt: thread.last_message_at || thread.updated_at,
      route: thread.thread_type === 'tele_consult' ? (patient ? '/my/telehealth' : '/telehealth') : messageRoute,
      unread: Number(thread.unread_count) || 1,
    }))
    return [...messages, ...notices].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  }, [messagesQuery.data, notificationRoute, notificationsQuery.data, messageRoute, patient])
  const unreadTotal = items.reduce((total, item) => total + item.unread, 0)
  const openItem = (item) => {
    if (item.kind === 'notice') markRead.mutate(item.id)
    setOpenAt(null)
    onNavigate?.()
    navigate(item.route, item.kind === 'message' ? { state: { threadId: item.id } } : undefined)
  }

  return <div ref={containerRef} className="relative">
    <button ref={triggerRef} type="button" className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-[var(--accent-strong)] transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:border-slate-700 dark:bg-slate-800 dark:text-rose-200" aria-label={`Notifications${unreadTotal ? `, ${unreadTotal} unread` : ''}`} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog" onClick={() => setOpenAt(open ? null : location.key)}>
      <AppIcon name="notifications" className="h-5 w-5" />
      {unreadTotal > 0 ? <span aria-label={`${unreadTotal} unread updates`} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] px-1 text-[10px] font-bold text-white">{unreadTotal > 99 ? '99+' : unreadTotal}</span> : null}
    </button>
    {open ? <div id={panelId} role="dialog" aria-label="Notifications and messages" className="absolute right-0 mt-2 flex max-h-[calc(100dvh-9rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-xl lg:left-0 lg:right-auto dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800"><div><p className="font-semibold text-slate-900 dark:text-white">Notifications</p><p className="text-xs text-slate-500">Messages and important clinic updates</p></div><span className="badge badge-gray">{unreadTotal} new</span></div>
      <div className="min-h-0 max-h-96 overflow-y-auto overscroll-contain p-2">
        {(notificationsQuery.isError || messagesQuery.isError) && (
          <p role="alert" className="p-3 text-sm text-slate-500">Some updates could not load. Please try again shortly.</p>
        )}
        {!items.length && !notificationsQuery.isError && !messagesQuery.isError && (
          <p className="p-3 text-sm text-slate-500">
            {notificationsQuery.isLoading || messagesQuery.isLoading ? 'Loading updates…' : 'You are all caught up.'}
          </p>
        )}
        {items.slice(0, 8).map((item) => (
          <button type="button" key={item.key} onClick={() => openItem(item)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-rose-50 dark:hover:bg-slate-800">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.kind === 'message' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200' : 'bg-rose-50 text-[var(--accent-strong)] dark:bg-rose-950 dark:text-rose-200'}`}>
              <AppIcon name={item.kind === 'message' ? 'messages' : 'notifications'} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.title}</span>
                <span className="text-[11px] text-slate-400">{formatMoment(item.createdAt)}</span>
              </span>
              <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.body}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-800">
        <button type="button" className="btn-secondary btn-sm w-full justify-center" onClick={() => { setOpenAt(null); onNavigate?.(); navigate(notificationRoute) }}>View all clinic updates</button>
      </div>
    </div> : null}
  </div>
}
