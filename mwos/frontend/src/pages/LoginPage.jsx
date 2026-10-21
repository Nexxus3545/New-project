import React, { useState } from 'react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../utils/api'
import useSignInProviders from '../hooks/useSignInProviders'
import { GoogleProviderIcon } from '../components/common/AuthProviderIcons'

const oauthErrors = {
  google_unavailable: 'Google sign-in is not available yet. Please use your MWOS email and password.',
  facebook_unavailable: 'This sign-in method is not offered. Please use Google or your MWOS email and password.',
  oauth_service_unavailable: 'The clinic service is temporarily unavailable. Please try again later or contact TMC Copino.',
  oauth_state_invalid: 'Your sign-in session could not be verified. Please try again.',
  oauth_account_exists: 'This email already has an MWOS password account. Sign in with your password first to keep it protected.',
  oauth_email_required: 'Your provider did not share a verified email address. Please use your MWOS password instead.',
  oauth_profile_incomplete: 'Your provider profile needs a first and last name before it can create an account.',
  oauth_role_restricted: 'Google sign-in is available for patient accounts only.',
  oauth_account_inactive: 'This account is not active. Please contact TMC Copino for assistance.',
  oauth_failed: 'We could not complete your provider sign-in. Please try again or use your MWOS password.',
}

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const { login, loginWithPasskey, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [providerError, setProviderError] = useState('')
  const [providerNotice, setProviderNotice] = useState('')
  const { providers: providerStatus, note: providerNote } = useSignInProviders()

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('oauth_error')
    const setupNotice = ['google_unavailable', 'oauth_service_unavailable'].includes(code)
    setProviderError(setupNotice ? '' : oauthErrors[code] || '')
    setProviderNotice(setupNotice
      ? 'Social sign-in could not be started. Please use your MWOS email and password.'
      : '')
  }, [location.search])

  const handleChange = (event) => {
    clearError()
    setProviderNotice('')
    setProviderError('')
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

  const handleGoogleLogin = () => {
    clearError()
    setProviderError('')
    if (!providerStatus?.google) {
      setProviderNotice('Google sign-in is unavailable right now. Please use your MWOS email and password.')
      return
    }
    window.location.assign(`${api.defaults.baseURL}/auth/google`)
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

      {error || providerError ? <div className="alert-critical auth-form-alert" role="alert">{error || providerError}</div> : null}

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

        <div className="auth-provider-section">
          <p>Or continue with</p>
          <div className="auth-provider-actions">
            <button type="button" disabled={isLoading || !providerStatus?.google} onClick={handleGoogleLogin} className="auth-provider-button">
              <GoogleProviderIcon />
              Continue with Google
            </button>
          </div>
          <p className="auth-provider-note" role="status">
            {providerNotice || providerNote}
          </p>
        </div>


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
