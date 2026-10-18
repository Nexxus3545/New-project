import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const { login, loginWithPasskey, isLoading, error, clearError } = useAuthStore()
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

  const handlePasskeyLogin = async () => {
    if (!form.email) return
    const result = await loginWithPasskey(form.email.trim())
    if (result.success) {
      navigate(result.user.role === 'patient' ? '/my/dashboard' : '/dashboard')
    }
  }

  return (
    <div className="auth-form-stack">
      <div className="auth-form-heading">
        <p className="auth-kicker">Secure clinic access</p>
        <h2>Sign in to MWOS</h2>
        <p>
          Use the account issued by TMC Copino to continue to your care information or clinic workspace.
        </p>
      </div>

      {error ? <div className="alert-critical auth-form-alert" role="alert">{error}</div> : null}

      <form onSubmit={handleSubmit} className="auth-login-form">
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
          ) : 'Sign in securely'}
        </button>

        <div className="auth-form-divider" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs font-medium text-slate-400">or</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <button
          type="button"
          disabled={isLoading || !form.email}
          onClick={handlePasskeyLogin}
          className="btn-secondary w-full justify-center"
        >
          Sign in with passkey
        </button>

        <p className="text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
          New patient? <Link to="/register" className="font-semibold text-[var(--accent)] hover:underline">Create your secure account</Link>
        </p>

        <p className="auth-privacy-note">
          Your health information is protected and available only to authorized clinic personnel.
        </p>
      </form>
    </div>
  )
}
