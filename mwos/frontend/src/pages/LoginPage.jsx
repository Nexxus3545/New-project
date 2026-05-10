import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const { login, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

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

  const fillDemo = (email, password) => {
    clearError()
    setForm({ email, password })
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">Secure Access</p>
        <h2 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-slate-100">Welcome back</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          Sign in to continue with your personalized dashboard, account settings, and shared clinic workspace.
        </p>
      </div>

      {error ? <div className="alert-critical text-sm">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="label">Password</label>
          <div className="relative">
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
      </form>

      <div className="text-center text-sm">
        <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">Forgot password?</Link>
        <span className="px-2 text-gray-300 dark:text-slate-600">|</span>
        <Link to="/register" className="text-[var(--accent)] hover:underline">Create account</Link>
      </div>

      <div className="rounded-[28px] border border-gray-200/80 bg-gray-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Quick demo access</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Use a sample role to preview the experience.</p>
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
