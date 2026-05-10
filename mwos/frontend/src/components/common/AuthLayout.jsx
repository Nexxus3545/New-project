import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const trustPoints = [
  'Unified web, mobile, and desktop experience',
  'Profile, security, and appearance settings in one place',
  'Shared backend with audit logging and role-based access',
]

export default function AuthLayout() {
  const user = useAuthStore((state) => state.user)
  const isHydrating = useAuthStore((state) => state.isHydrating)
  if (user) return <Navigate to="/" replace />
  if (isHydrating) {
    return <div className="flex min-h-screen items-center justify-center"><div className="loading-spinner h-10 w-10" /></div>
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/75 lg:grid-cols-[1.1fr_0.9fr]">
        <section
          className="relative hidden overflow-hidden px-8 py-10 text-white lg:flex lg:flex-col lg:justify-between"
          style={{ background: 'linear-gradient(145deg, var(--hero-start), var(--hero-end))' }}
        >
          <div className="absolute -left-8 top-8 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-60 w-60 rounded-full bg-slate-950/20 blur-3xl" />

          <div className="relative space-y-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-white/20 text-lg font-semibold backdrop-blur">
              MW
            </div>
            <div className="max-w-xl">
              <p className="text-sm uppercase tracking-[0.35em] text-white/70">TMC Copino</p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight">
                Maternal care operations that feel modern, calm, and dependable.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/80">
                One login unlocks a shared workspace for staff, patients, mobile teams, and desktop operations.
              </p>
            </div>
          </div>

          <div className="relative space-y-4">
            {trustPoints.map((point) => (
              <div key={point} className="rounded-3xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur">
                <p className="text-sm font-medium text-white/90">{point}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div
                className="rounded-[28px] px-6 py-7 text-white shadow-lg"
                style={{ background: 'linear-gradient(145deg, var(--hero-start), var(--hero-end))' }}
              >
                <p className="text-xs uppercase tracking-[0.32em] text-white/70">MWOS</p>
                <h1 className="mt-3 text-3xl font-semibold">TMC Copino</h1>
                <p className="mt-2 text-sm text-white/80">Sign in to manage care, records, and your workspace preferences.</p>
              </div>
            </div>

            <div className="card border-0 shadow-none">
              <Outlet />
            </div>

            <p className="mt-6 text-center text-xs text-gray-400 dark:text-slate-500">
              TMC Copino Birthing Home and Medical Clinic - Tabaco City, Albay
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
