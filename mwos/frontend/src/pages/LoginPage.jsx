import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const { login, loginWithPasskey, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const featureCards = [
    ['Appointments', 'Calendar booking and visit tracking'],
    ['Records', 'Prenatal, postnatal, and pediatric EMR'],
    ['Emergency', 'Barangay support and ambulance workflow'],
  ]

  const handleChange = (event) => {
    clearError()
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.email || !form.password) return

    const result = await login(form.email.trim(), form.password)
    if (result.success) {
      navigate(result.user.role === 'patient' ? '/my/dashboard' : '/dashboard')
    }
  }

  const handlePasskeyLogin = async () => {
    if (!form.email) return
    const result = await loginWithPasskey(form.email.trim())
    if (result.success) {
      navigate(result.user.role === 'patient' ? '/my/dashboard' : '/dashboard')
    }
  }

  const fillDemo = (email, password) => {
    clearError()
    setForm({ email, password })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/80 bg-white/85 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-info">Secure Access</span>
          <span className="badge badge-gray">TMC Copino</span>
          <span className="badge badge-success">Live care</span>
        </div>
        <h2 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-50">Welcome back</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          Sign in to manage appointments, maternal records, medicines, emergency response, and staff coordination from one place.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {featureCards.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
            </div>
          ))}
        </div>
      </div>

      {error ? <div className="alert-critical text-sm">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[32px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,118,110,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div>
          <label className="label">Email address</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            className="input"
            placeholder="you@tmccopino.com"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="label mb-0">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1">
            <input
              name="password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className="input pr-16"
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !form.email || !form.password}
          className="btn-primary w-full justify-center"
        >
          {isLoading ? (
            <>
              <span className="loading-spinner h-4 w-4" />
              Signing in...
            </>
          ) : 'Sign in'}
        </button>

        <button
          type="button"
          disabled={isLoading || !form.email}
          onClick={handlePasskeyLogin}
          className="btn-secondary w-full justify-center"
        >
          Sign in with passkey
        </button>

        <div className="text-center text-sm text-slate-500 dark:text-slate-400">
          Need an account? <Link to="/register" className="font-semibold text-[var(--accent)] hover:underline">Create one</Link>
        </div>
      </form>

      <div className="rounded-[28px] border border-white/80 bg-white/75 p-4 shadow-[0_20px_42px_rgba(15,118,110,0.08)] dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Quick demo access</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Use a sample role to preview the experience.</p>
          </div>
          <span className="badge badge-gray">Demo</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Admin', email: 'admin@tmccopino.com', pass: 'admin1234' },
            { label: 'Doctor', email: 'doctor@tmccopino.com', pass: 'password123' },
            { label: 'Midwife', email: 'midwife@tmccopino.com', pass: 'password123' },
            { label: 'Patient', email: 'patient@example.com', pass: 'patient123' },
          ].map((demo) => (
            <button
              key={demo.label}
              type="button"
              onClick={() => fillDemo(demo.email, demo.pass)}
              className="btn-secondary justify-center text-xs"
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
