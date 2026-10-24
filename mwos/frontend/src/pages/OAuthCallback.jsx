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

  const error = callbackErrors[callbackError] || storeError || (!code && !callbackError ? 'Your sign-in link is incomplete. Please return to the login page and try again.' : '')

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

  if (needsProfile) {
    return (
      <div className="auth-form-stack">
        <div className="auth-form-heading">
          <p className="auth-kicker">Patient profile</p>
          <h2>Complete your record</h2>
          <p>{notice}</p>
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
