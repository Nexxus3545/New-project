import React, { useState } from 'react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api, { socialAuthAvailable } from '../utils/api'
import { FacebookProviderIcon, GoogleProviderIcon, SmsProviderIcon } from '../components/common/AuthProviderIcons'

const oauthErrors = {
  google_unavailable: 'Google sign-in is not available yet. Please use your MWOS email and password.',
  facebook_unavailable: 'Facebook sign-in is not available yet. Please use your MWOS email and password.',
  oauth_service_unavailable: 'The clinic service is temporarily unavailable. Please try again later or contact TMC Copino.',
  oauth_state_invalid: 'Your sign-in session could not be verified. Please try again.',
  oauth_account_exists: 'This email already has an MWOS password account. Sign in with your password first to keep it protected.',
  oauth_email_required: 'Your provider did not share a verified email address. Please use your MWOS password instead.',
  oauth_profile_incomplete: 'Your provider profile needs a first and last name before it can create an account.',
  oauth_role_restricted: 'Google and Facebook sign-in are available for patient accounts only.',
  oauth_account_inactive: 'This account is not active. Please contact TMC Copino for assistance.',
  oauth_failed: 'We could not complete your provider sign-in. Please try again or use your MWOS password.',
}

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [smsStage, setSmsStage] = useState('idle')
  const [smsPhone, setSmsPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsNotice, setSmsNotice] = useState('')
  const { login, loginWithPasskey, requestSmsLogin, verifySmsLogin, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [providerError, setProviderError] = useState('')
  const [providerStatus, setProviderStatus] = useState(null)

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    setProviderError(oauthErrors[query.get('oauth_error')] || '')
    if (query.get('sms') === '1') setSmsStage('request')
  }, [location.search])

  useEffect(() => {
    if (!socialAuthAvailable) {
      setProviderStatus({ google: false, facebook: false })
      return undefined
    }

    let active = true
    api.get('/auth/providers', { timeout: 6000 })
      .then((response) => {
        if (active) setProviderStatus(response.data?.data || { google: false, facebook: false })
      })
      .catch(() => {
        if (active) setProviderStatus({ google: false, facebook: false })
      })

    return () => { active = false }
  }, [])

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

  const handleProviderLogin = (provider) => {
    clearError()
    setProviderError('')
    if (!socialAuthAvailable || !providerStatus?.[provider]) {
      setProviderError(`${provider === 'google' ? 'Google' : 'Facebook'} sign-in is not ready yet. Please use your MWOS email and password.`)
      return
    }
    window.location.assign(`${api.defaults.baseURL}/auth/${provider}`)
  }

  const openSmsLogin = () => {
    clearError()
    setProviderError('')
    setSmsNotice('')
    setSmsStage('request')
  }

  const requestSmsCode = async () => {
    if (!smsPhone.trim()) return
    const result = await requestSmsLogin(smsPhone.trim())
    if (result.success) {
      setSmsStage('verify')
      setSmsNotice(result.message)
    }
  }

  const submitSmsCode = async () => {
    if (!smsPhone.trim() || smsCode.length !== 6) return
    const result = await verifySmsLogin(smsPhone.trim(), smsCode)
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
            <button type="button" disabled={isLoading || !providerStatus?.google} onClick={() => handleProviderLogin('google')} className="auth-provider-button">
              <GoogleProviderIcon />
              Continue with Google
            </button>
            <button type="button" disabled={isLoading || !providerStatus?.facebook} onClick={() => handleProviderLogin('facebook')} className="auth-provider-button">
              <FacebookProviderIcon />
              Continue with Facebook
            </button>
            <button type="button" disabled={isLoading} onClick={openSmsLogin} className="auth-provider-button">
              <SmsProviderIcon />
              Continue with SMS
            </button>
          </div>
          <p className="auth-provider-note" role="status">
            {!providerStatus
              ? 'Checking clinic sign-in methods...'
              : !providerStatus.google && !providerStatus.facebook
                ? 'Google and Facebook sign-in are awaiting clinic setup. Use your MWOS email and password for now.'
                : 'Google and Facebook are for patient accounts. SMS is available only for a mobile number already linked to an MWOS account.'}
          </p>
        </div>

        {smsStage !== 'idle' ? (
          <section className="auth-sms-panel" aria-live="polite">
            <div className="auth-sms-panel-heading">
              <div>
                <p className="auth-sms-eyebrow">Mobile sign-in</p>
                <h3>{smsStage === 'verify' ? 'Enter your verification code' : 'Sign in with SMS'}</h3>
              </div>
              <button type="button" className="auth-sms-close" onClick={() => setSmsStage('idle')} aria-label="Close SMS sign-in">
                Close
              </button>
            </div>

            {smsStage === 'request' ? (
              <>
                <label className="label" htmlFor="sms-phone">Mobile number</label>
                <input
                  id="sms-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={smsPhone}
                  onChange={(event) => {
                    clearError()
                    setSmsPhone(event.target.value)
                  }}
                  className="input"
                  placeholder="0917 123 4567"
                />
                <button type="button" disabled={isLoading || !smsPhone.trim()} onClick={requestSmsCode} className="btn-primary w-full justify-center">
                  {isLoading ? 'Sending code...' : 'Send verification code'}
                </button>
              </>
            ) : (
              <>
                <p className="auth-sms-summary">{smsNotice || 'Enter the six-digit code sent to your mobile number.'}</p>
                <label className="label" htmlFor="sms-code">Six-digit code</label>
                <input
                  id="sms-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={smsCode}
                  onChange={(event) => {
                    clearError()
                    setSmsCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }}
                  className="input auth-sms-code-input"
                  placeholder="000000"
                  maxLength={6}
                />
                <div className="auth-sms-actions">
                  <button type="button" disabled={isLoading || smsCode.length !== 6} onClick={submitSmsCode} className="btn-primary flex-1 justify-center">
                    {isLoading ? 'Verifying...' : 'Verify and sign in'}
                  </button>
                  <button type="button" disabled={isLoading} onClick={() => { setSmsCode(''); setSmsStage('request') }} className="btn-secondary">
                    Use another number
                  </button>
                </div>
              </>
            )}
            <p className="auth-provider-note">For your privacy, we do not confirm whether a mobile number has an MWOS account.</p>
          </section>
        ) : null}

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
