import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi } from '../utils/api'

export default function ReactivateAccountPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [requestId, setRequestId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const result = await publicApi.post(requestId ? '/account/reactivate/confirm' : '/account/reactivate/request', requestId ? { requestId, code } : { email })
      setMessage(result.data.message)
      if (requestId) { setDone(true); setCode('') } else setRequestId(result.data.data.requestId)
    } catch (failure) { setMessage(failure.response?.data?.message || 'Account recovery is unavailable. Contact the clinic for assistance.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-5"><h2 className="text-xl font-bold">Reactivate account</h2><p className="text-sm text-slate-500">For accounts you temporarily deactivated. Deletion requests and clinic-disabled accounts require clinic review. This will not automatically sign you in.</p>
    {!done ? <form onSubmit={submit} className="space-y-4"><label className="label">{requestId ? 'Email verification code' : 'Existing account email'}<input className="input mt-2" type={requestId ? 'text' : 'email'} inputMode={requestId ? 'numeric' : 'email'} autoComplete={requestId ? 'one-time-code' : 'email'} value={requestId ? code : email} onChange={(event) => requestId ? setCode(event.target.value.replace(/\D/g, '').slice(0, 6)) : setEmail(event.target.value)} required pattern={requestId ? '[0-9]{6}' : undefined} /></label><button disabled={busy} className="btn-primary">{busy ? 'Please wait...' : requestId ? 'Verify and reactivate' : 'Send reactivation code'}</button>{requestId ? <button type="button" disabled={busy} className="btn-secondary" onClick={() => { setRequestId(''); setCode('') }}>Start again</button> : null}</form> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}<Link className="inline-block text-sm underline" to="/login">Return to sign in</Link>
  </div>
}
