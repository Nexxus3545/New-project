import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'

export function EmailVerifiedAction({ purpose, noticeId, label, onVerified }) {
  const [request, setRequest] = useState(null)
  const [code, setCode] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async () => {
    setBusy(true); setError('')
    try { const result = await api.post('/account/security/request', { purpose, noticeId, currentPassword }); setRequest(result.data.data); setCurrentPassword('') }
    catch (failure) { setError(failure.response?.data?.message || 'The verification email could not be sent. Nothing has changed.') }
    finally { setBusy(false) }
  }
  const confirm = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api.post('/account/security/confirm', { requestId: request.requestId, code })
      setRequest(null); setCode(''); await onVerified?.(result.data)
    } catch (failure) { setError(failure.response?.data?.message || 'Verification failed. Nothing has changed.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3">
    {!request && ['deactivate', 'delete'].includes(purpose) ? <label className="label">Current MWOS password (password accounts only)<input type="password" autoComplete="current-password" className="input mt-2" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><span className="block mt-2 text-xs font-normal text-slate-500">Google-linked accounts verify through the email originally linked by Google instead.</span></label> : null}
    {!request ? <button type="button" className="btn-secondary" disabled={busy} onClick={send}>{busy ? 'Sending code...' : label}</button> : <form className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700" onSubmit={confirm} aria-label={`Verify ${label}`}>
      <label className="label">Email code sent to {request.destination}<input aria-label={`Verification code for ${label}`} className="input mt-2" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label>
      <p className="text-xs text-slate-500">Expires after 10 minutes; five attempts maximum. Never share this code.</p>
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying...' : 'Verify and continue'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => { setRequest(null); setCode('') }}>Cancel</button></div>
    </form>}
    {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
  </div>
}

export function SignInReview({ noticeId, onVerified }) {
  const [notice, setNotice] = useState('')
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const complete = async (result) => {
    if (result.data?.signOut) { await logout(); navigate('/forgot-password'); return }
    setNotice('Sign-in confirmed with your email code.'); onVerified?.()
  }
  return <div className="mt-3 space-y-3">
    <p className="text-sm font-medium">Was this you?</p>
    <EmailVerifiedAction purpose="sign_in_confirm" noticeId={noticeId} label="Yes, verify it was me" onVerified={complete} />
    <p className="text-xs text-slate-500">If not, verify your identity to end all MWOS sessions, then secure your Google account. Changing your MWOS password does not change your Google password.</p>
    <EmailVerifiedAction purpose="secure_account" noticeId={noticeId} label="Not me: secure my MWOS sessions" onVerified={complete} />
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
  </div>
}

export default function AccountManagement({ account }) {
  const [purpose, setPurpose] = useState('')
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const status = useQuery({ queryKey: ['account-security', account?.id], queryFn: () => api.get('/account/security').then((result) => result.data.data) })
  const queue = useQuery({ queryKey: ['account-deletion-review'], enabled: account?.role === 'admin', queryFn: () => api.get('/account/deletion-requests').then((result) => result.data.data) })
  const complete = async () => { await logout(); navigate(purpose === 'delete' ? '/login?account=deletion-requested' : '/login?account=deactivated') }
  return <section className="card space-y-4" aria-label="Manage account access">
    <h2 className="section-title">Manage account access</h2>
    {account?.role === 'patient' ? <>
      <p className="text-sm text-slate-600 dark:text-slate-300">Deactivation temporarily closes your login. A deletion request closes login and goes to clinic review. Neither option erases medical records or cancels appointments automatically. Contact the clinic for ongoing care.</p>
      {status.isLoading ? <p role="status">Checking verification availability...</p> : status.isError ? <p role="alert">Account controls could not be loaded. Please retry later.</p> : !status.data?.emailAvailable ? <p role="status" className="text-sm">Email verification is not connected. No account will be closed until identity can be verified. Contact the clinic for assistance.</p> : <>
        <div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={() => setPurpose('deactivate')}>Deactivate account</button><button type="button" className="btn-secondary" onClick={() => setPurpose('delete')}>Request account deletion</button></div>
        {purpose ? <div className="space-y-3 rounded-2xl border border-rose-200 p-4"><h3 className="font-semibold">{purpose === 'delete' ? 'Request deletion and close account access?' : 'Temporarily deactivate account?'}</h3><p className="text-sm">You will be signed out only after the email code is verified. {purpose === 'delete' ? 'The clinic will review retained records before any further deletion. This is a request, not completed erasure.' : 'You can request reactivation using your existing account email.'}</p><EmailVerifiedAction key={purpose} purpose={purpose} label={purpose === 'delete' ? 'Send deletion verification code' : 'Send deactivation verification code'} onVerified={complete} /><button type="button" className="btn-ghost" onClick={() => setPurpose('')}>Keep my account active</button></div> : null}
      </>}
      <Link className="inline-block text-sm underline" to="/reactivate-account">Reactivate a deactivated account</Link>
    </> : <p className="text-sm">Clinic staff account closure is managed by the administrator to preserve clinical responsibilities and prevent administrative lockout.</p>}
    {account?.role === 'admin' ? <div className="space-y-3"><h3 className="font-semibold">Verified deletion requests</h3><p className="text-sm text-slate-500">Restricted review queue. Confirm identity, retention requirements, and ongoing care before processing; no clinical records are deleted here.</p>{queue.isError ? <p role="alert">The review queue could not be loaded.</p> : queue.isLoading ? <p role="status">Loading requests...</p> : queue.data?.length ? <ul className="divide-y">{queue.data.map((item) => <li key={item.id} className="py-3 text-sm">{item.first_name} {item.last_name}<br />Reference: {item.id}<br />Requested: {new Date(item.confirmed_at).toLocaleString()}</li>)}</ul> : <p className="text-sm">No verified deletion requests.</p>}</div> : null}
  </section>
}
