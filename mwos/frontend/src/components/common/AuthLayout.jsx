import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import BrandMark from './BrandMark'

const dashboardFacts = [
  { label: 'Today', value: '24 visits' },
  { label: 'Records', value: '1.2k' },
  { label: 'Emergency', value: 'Ready' },
]

const scheduleRows = [
  { name: 'Alyssa Cruz', time: '08:30', note: 'Prenatal check-up', tone: 'rose' },
  { name: 'Mika Santos', time: '10:00', note: 'Ultrasound review', tone: 'lavender' },
  { name: 'Nina Lopez', time: '01:15', note: 'Postnatal follow-up', tone: 'blush' },
]

const supportPoints = [
  'Appointments, records, and medicine flow stay on one screen',
  'Staff can open barangay support and ambulance pathways quickly',
  'The layout is built for a calm, clinical first impression',
]

export default function AuthLayout() {
  const user = useAuthStore((state) => state.user)
  const isHydrating = useAuthStore((state) => state.isHydrating)
  if (user) return <Navigate to="/" replace />
  if (isHydrating) {
    return <div className="flex min-h-screen items-center justify-center"><div className="loading-spinner h-10 w-10" /></div>
  }

  return (
    <div className="auth-scene min-h-screen px-4 py-6 lg:px-8">
      <div className="auth-scene-grid" />
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/75 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#fff3f8] via-[#fdf8fc] to-[#f4efff] px-8 py-10 text-slate-900 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -left-10 top-10 h-56 w-56 rounded-full bg-[#f7d7e6]/70 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#d7c8ff]/50 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.9),transparent_28%),radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.6),transparent_24%)]" />

          <div className="relative space-y-6">
            <BrandMark sublabel="Birthing home & medical clinic" />
            <div className="max-w-xl space-y-4">
              <p className="text-sm uppercase tracking-[0.35em] text-[var(--accent)]">Maternal access</p>
              <h1 className="text-5xl font-semibold leading-tight text-slate-900">
                A calmer workspace for birthing-home care and patient coordination.
              </h1>
              <p className="max-w-lg text-base leading-7 text-slate-600">
                One login unlocks appointments, prenatal monitoring, medicines, emergency support, and follow-up in a calmer interface.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[32px] border border-white/80 bg-white/84 p-5 shadow-[0_20px_48px_rgba(214,92,138,0.12)] backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Clinic today</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">Live schedule</h3>
                </div>
                <span className="badge badge-success">Online</span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {dashboardFacts.map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3 text-center dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {scheduleRows.map((row) => (
                  <div key={row.name} className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${
                      row.tone === 'lavender' ? 'from-[#ece3ff] to-[#f9f5ff]' : row.tone === 'blush' ? 'from-[#fde8f0] to-[#fff8fb]' : 'from-[#fbe2ea] to-[#fff7fa]'
                    } text-xs font-semibold text-[#8b2154]`}>
                      {row.name.split(' ').map((part) => part[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{row.time}</p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">PH time</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[32px] border border-white/80 bg-white/84 p-5 shadow-[0_20px_48px_rgba(214,92,138,0.12)] backdrop-blur">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Emergency support</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">Barangay and ambulance ready</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Map, transport, and escalation details stay visible so staff can move quickly during urgent care.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  {['Map route', 'Call barangay', 'Dispatch ambulance'].map((item) => (
                    <div key={item} className="rounded-2xl border border-rose-100 bg-rose-50/80 px-3 py-3 text-xs font-semibold text-[#8b2154] dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/80 bg-white/84 p-5 shadow-[0_20px_48px_rgba(214,92,138,0.12)] backdrop-blur">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Why this screen works</p>
                <div className="mt-4 space-y-3">
                  {supportPoints.map((point) => (
                    <div key={point} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-[#fff3f8] via-[#fdf8fc] to-[#f4efff] p-5 shadow-[0_20px_48px_rgba(214,92,138,0.12)] backdrop-blur">
                <BrandMark sublabel="Birthing home access" />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {dashboardFacts.map((item) => (
                    <div key={item.label} className="rounded-[18px] border border-white/80 bg-white/80 px-3 py-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {scheduleRows.slice(0, 2).map((row) => (
                    <div key={row.name} className="rounded-[18px] border border-white/80 bg-white/80 px-3 py-3">
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.note} - {row.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card border-0 bg-white/92 shadow-none">
              <Outlet />
            </div>

            <p className="mt-6 text-center text-xs text-gray-400 dark:text-slate-500">
              TMC Copino Birthing Home and Medical Clinic - Gajo Tiwi, Albay
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
