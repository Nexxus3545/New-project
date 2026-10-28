import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import PatientCareFields from '../components/patient/PatientCareFields'

const callbackErrors = {
  google_unavailable: 'Google sign-in is not available yet. Please use your MWOS email and password.',
  facebook_unavailable: 'This sign-in method is not offered. Please use Google or your MWOS email and password.',
  oauth_service_unavailable: 'The clinic service is temporarily unavailable. Please try again later or contact TMC Copino.',
  oauth_state_invalid: 'Your sign-in session could not be verified. Please try again from the login page.',
  oauth_account_exists: 'This email already has an MWOS password account. Sign in with your password first to keep it protected.',
  oauth_email_required: 'Your provider did not share a verified email address. Use your MWOS email and password instead.',
  oauth_profile_incomplete: 'Your provider profile needs a first and last name before it can create an MWOS account.',
  oauth_role_restricted: 'Google sign-in is available for patient accounts only.',
  oauth_account_inactive: 'This account is not active. Please contact TMC Copino for assistance.',
  oauth_failed: 'We could not complete your provider sign-in. Please try again or use your MWOS password.',
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const completeOAuthLogin = useAuthStore((state) => state.completeOAuthLogin)
  const completeOAuthPatientProfile = useAuthStore((state) => state.completeOAuthPatientProfile)
  const isLoading = useAuthStore((state) => state.isLoading)
  const storeError = useAuthStore((state) => state.error)
  const handled = useRef(false)
  const originalCode = useRef(searchParams.get('code'))
  const [verification, setVerification] = useState(null)
  const [emailCode, setEmailCode] = useState('')
  const [needsProfile, setNeedsProfile] = useState(false)
  const [form, setForm] = useState({ dateOfBirth: '', phone: '', city: '', gender: '', careType: 'general' })
  const [notice, setNotice] = useState('')

  const code = searchParams.get('code')
  const callbackError = searchParams.get('oauth_error')

  useEffect(() => {
    if (handled.current || callbackError || !code) return
    handled.current = true

    const exchange = async () => {
      const result = await completeOAuthLogin(code)
      if (!result.success) return
      // Keep the pending proof only in memory, not in browser history or storage.
      navigate('/oauth-callback', { replace: true })
      if (result.verificationRequired) {
        setVerification(result)
        return
      }
      if (result.user.role !== 'patient') {
        navigate('/dashboard', { replace: true })
        return
      }
      if (result.user.patientId) {
        navigate('/my/dashboard', { replace: true })
        return
      }
      setNeedsProfile(true)
      setNotice('One last step: complete the required patient details before opening your care portal.')
    }

    exchange()
  }, [callbackError, code, completeOAuthLogin, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const result = await completeOAuthPatientProfile(form)
    if (result.success) navigate('/my/dashboard', { replace: true })
  }

  const verifyEmail = async (event) => {
    event.preventDefault()
    const result = await completeOAuthLogin(originalCode.current, emailCode)
    if (!result.success || result.verificationRequired) return
    setVerification(null)
    if (result.user.patientId) navigate('/my/dashboard', { replace: true })
    else {
      setNeedsProfile(true)
      setNotice('Your email code is verified. Complete your patient details to open your care portal.')
    }
  }

  const error = callbackErrors[callbackError] || (!verification && storeError) || (!originalCode.current && !callbackError ? 'Your sign-in link is incomplete. Please return to the login page and try again.' : '')

  if (error) {
    return (
      <div className="auth-form-stack">
        <div className="auth-form-heading">
          <p className="auth-kicker">Secure sign-in</p>
          <h2>We need your attention</h2>
          <p>{error}</p>
        </div>
        <Link to="/login" className="btn-primary w-full justify-center">Return to sign in</Link>
      </div>
    )
  }

  if (verification) {
    return <div className="auth-form-stack">
      <div className="auth-form-heading">
        <p className="auth-kicker">Google identity verified</p>
        <h2>Check your email</h2>
        <p>A sign-in code was sent to {verification.destination}. Patient access opens only after this additional check.</p>
      </div>
      <form onSubmit={verifyEmail} className="auth-login-form">
        {storeError ? <div className="alert-critical" role="alert">{storeError}</div> : null}
        <div><label htmlFor="google-email-code" className="label">Six-digit email code</label>
          <input id="google-email-code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ''))} />
        </div>
        <p className="text-sm text-slate-500">The code expires in 10 minutes and works once. Never share it, including with clinic staff. This check does not give MWOS access to your Gmail inbox.</p>
        <button className="btn-primary w-full justify-center" disabled={isLoading || !/^\d{6}$/.test(emailCode)}>{isLoading ? 'Verifying...' : 'Verify and continue'}</button>
      </form>
      <Link to="/login" className="text-sm font-semibold text-[var(--accent)] underline">Start Google sign-in again for a new code</Link>
    </div>
  }

  if (needsProfile) {
    return (
      <div className="auth-form-stack">
        <div className="auth-form-heading">
          <p className="auth-kicker">Patient profile</p>
          <h2>Complete your record</h2>
          <p>{notice}</p>
          <p className="mt-3 text-sm">After signing in, open Settings to submit one valid government-issued ID for private clinic review.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-login-form">
          <PatientCareFields value={form} required onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
          <div>
            <label className="label">Date of birth</label>
            <input
              className="input"
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Mobile number <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09XX XXX XXXX"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">City / Municipality <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              className="input"
              autoComplete="address-level2"
              placeholder="e.g. Tiwi, Albay"
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
            />
          </div>
          <button type="submit" disabled={isLoading || !form.dateOfBirth} className="btn-primary w-full justify-center">
            {isLoading ? <><span className="loading-spinner h-4 w-4" /> Saving securely...</> : 'Open my care portal'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="auth-callback-loading" aria-live="polite">
      <span className="loading-spinner h-9 w-9" />
      <div>
        <p className="auth-kicker">Secure sign-in</p>
        <h2>Completing your sign-in</h2>
        <p>Please keep this page open while we prepare your secure session.</p>
      </div>
    </div>
  )
}
