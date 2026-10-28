import React, { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { buildCredentialSubmission, clinicDate, credentialLabel, credentialRequirement, effectiveCredentialStatus, PATIENT_ID_TYPES, readCredentialResponse } from '../../utils/accountCredentials'

const statusLabels = { missing: 'Not submitted', pending: 'Awaiting clinic review', verified: 'Verified by clinic', rejected: 'Needs replacement', expired: 'Expired — renewal needed' }
const emptyForm = (role) => ({ documentType: credentialRequirement(role) === 'professional_license' ? 'professional_license' : 'philhealth_id', documentLabel: '', licenseNumber: '', idLast4: '', expiresAt: '', consent: false })
const safeMessage = (error, action) => error?.response?.status === 403
  ? 'Additional account verification is required. Complete verification in Account settings and retry.'
  : error?.response?.status === 409
    ? 'This submission changed or was already reviewed. Refresh it before continuing.'
    : action === 'load' ? 'Credentials could not be loaded. Please try again.'
      : action === 'download' ? 'The private document could not be downloaded. Please try again.'
        : error?.credentialValidation ? error.message : 'The credential action could not be completed. Please try again.'

export default function AccountCredentials({ targetUser, adminMode = false, onChanged }) {
  const currentUser = useAuthStore((state) => state.user)
  const account = targetUser || currentUser
  const requirement = credentialRequirement(account?.role)
  const professional = requirement === 'professional_license'
  const queryClient = useQueryClient()
  const identifier = useId()
  const inputId = (field) => `${identifier}-${field}`
  const fileInput = useRef(null)
  const urls = useRef(new Set())
  const [form, setForm] = useState(() => emptyForm(account?.role))
  const [file, setFile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [notice, setNotice] = useState('')
  const [localError, setLocalError] = useState('')
  const isReviewer = adminMode && currentUser?.role === 'admin'
  const isSelf = account?.id === currentUser?.id
  const endpoint = adminMode ? `/credentials/users/${encodeURIComponent(account?.id || '')}` : '/credentials/mine'
  const queryKey = ['account-credentials', account?.id, adminMode ? 'admin' : 'own']
  const credentialQuery = useQuery({
    queryKey, enabled: Boolean(account?.id) && requirement !== 'none' && (!adminMode || isReviewer),
    queryFn: () => api.get(endpoint).then((response) => readCredentialResponse(response.data.data, { userId: account.id, role: account.role })),
    retry: false,
  })
  const credential = credentialQuery.data?.credential
  const status = effectiveCredentialStatus(credential)

  useEffect(() => {
    setForm(emptyForm(account?.role)); setFile(null); setEditing(false); setReviewNotes(''); setNotice(''); setLocalError('')
    if (fileInput.current) fileInput.current.value = ''
  }, [account?.id, account?.role])
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear() }, [])
  const saved = (data) => {
    queryClient.setQueryData(queryKey, data)
    for (const key of [['users-admin'], ['auth-me'], ['staff-registry']]) queryClient.invalidateQueries({ queryKey: key })
    onChanged?.(data.credential)
  }
  const submit = useMutation({
    mutationFn: async ({ submittedForm, submittedFile }) => {
      let payload
      try { payload = await buildCredentialSubmission(account.role, submittedForm, submittedFile) }
      catch (error) { error.credentialValidation = true; throw error }
      const response = await api.post(endpoint, payload)
      const data = readCredentialResponse(response.data.data, { userId: account.id, role: account.role })
      if (data.credential?.status !== 'pending' || !data.credential.hasDocument) throw new Error('Invalid submission receipt')
      return data
    },
    onSuccess: (data) => {
      saved(data); setFile(null); setForm(emptyForm(account.role)); setEditing(false); setReviewNotes('')
      if (fileInput.current) fileInput.current.value = ''
      setNotice('Document submitted for clinic review. It is not verified yet.')
    },
  })
  const review = useMutation({
    mutationFn: async ({ status: decision, revision, notes }) => {
      const response = await api.patch(`${endpoint}/review`, { status: decision, revision, reviewNotes: notes })
      const data = readCredentialResponse(response.data.data, { userId: account.id, role: account.role })
      if (data.credential?.status !== decision || data.credential.revision !== revision) throw new Error('Invalid review receipt')
      return data
    },
    onSuccess: (data) => { saved(data); setReviewNotes(''); setNotice(data.credential.status === 'verified' ? 'Credential verified by the clinic.' : 'Replacement requested. The account holder can submit a new document.') },
    onError: (error) => { if (error?.response?.status === 409) credentialQuery.refetch() },
  })
  const download = useMutation({
    mutationFn: async () => {
      const response = await api.get(`${endpoint}/document`, { responseType: 'blob' })
      const blob = response.data
      if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type) || !blob.size || blob.size > 2 * 1024 * 1024) throw new Error('Invalid private document')
      const url = URL.createObjectURL(blob)
      urls.current.add(url)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = credential.fileName || 'identity-document'; anchor.rel = 'noopener'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url) }, 1000)
    },
  })
  const busy = submit.isPending || review.isPending
  const error = localError || (submit.error ? safeMessage(submit.error, 'submit') : review.error ? safeMessage(review.error, 'review') : download.error ? safeMessage(download.error, 'download') : '')
  const verificationNeeded = [submit.error, review.error, download.error].some((item) => item?.response?.status === 403)
  if (!account?.id || requirement === 'none') return null
  if (adminMode && !isReviewer) return null

  const change = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setLocalError(''); setNotice(''); submit.reset() }
  const openReplacement = () => {
    setForm({ ...emptyForm(account.role), documentType: credential?.documentType || emptyForm(account.role).documentType, documentLabel: credential?.documentLabel || '', licenseNumber: credential?.licenseNumber || '', expiresAt: credential?.expiresAt || '' })
    setEditing(true); setNotice(''); setLocalError(''); submit.reset()
  }
  const onSubmit = (event) => {
    event.preventDefault(); setLocalError(''); setNotice(''); review.reset(); download.reset()
    submit.mutate({ submittedForm: { ...form }, submittedFile: file })
  }
  const onReview = (decision) => {
    setNotice(''); setLocalError(''); submit.reset(); download.reset()
    if (!reviewNotes.trim()) { setLocalError('Add a short review note before deciding.'); return }
    review.mutate({ status: decision, revision: credential.revision, notes: reviewNotes.trim() })
  }

  return <section id={!adminMode ? 'account-credentials' : undefined} className="card min-w-0 space-y-5" aria-labelledby={inputId('title')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="section-kicker">{professional ? 'Clinical staff credentials' : 'Patient credentials'}</p><h2 id={inputId('title')} className="mt-1 text-xl font-semibold">{professional ? 'Professional license verification' : 'Patient identity verification'}</h2>
        <p className="mt-2 text-sm text-slate-500">{professional ? 'Doctors, nurses, and midwives need a current PRC or professional ID, license number, and expiry date.' : 'Submit one valid government-issued ID, such as a PhilHealth ID or National ID. One current document is enough.'}</p>
      </div>
      <button className="btn-secondary btn-sm" type="button" disabled={credentialQuery.isFetching || busy} onClick={() => { setNotice(''); void credentialQuery.refetch() }}>Refresh credentials</button>
    </div>
    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">The clinic reviews the document manually. Documents are private and are not published as public links.</p>
    {professional && !adminMode && status !== 'verified' ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Clinical workspace access awaits approval of a current professional license. You can continue using account settings and submit your credential here.</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p> : null}
    {error ? <p role="alert" className="alert-warning">{error}</p> : null}
    {verificationNeeded ? <Link className="text-sm font-semibold underline" to={`${currentUser?.role === 'patient' ? '/my' : ''}/settings`}>Open Account settings</Link> : null}
    {credentialQuery.isLoading ? <p role="status" className="text-sm text-slate-500">Loading credentials…</p> : credentialQuery.isError ? <div role="alert"><p className="text-sm">{safeMessage(credentialQuery.error, 'load')}</p><button className="btn-secondary mt-3" type="button" onClick={() => credentialQuery.refetch()}>Retry credentials</button></div> : credentialQuery.data ? <>
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <span className={`badge ${status === 'verified' ? 'badge-success' : ['rejected', 'expired'].includes(status) ? 'badge-danger' : 'badge-warning'}`}>{statusLabels[status]}</span>
        {credential ? <dl className="mt-4 grid min-w-0 gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Document</dt><dd className="mt-1 break-words font-medium">{credentialLabel(credential.documentType, credential.documentLabel)}</dd></div>
          {professional ? <><div><dt className="text-slate-500">License number</dt><dd className="mt-1 break-all font-medium">{credential.licenseNumber || 'Not provided'}</dd></div><div><dt className="text-slate-500">License expires</dt><dd className="mt-1 font-medium">{credential.expiresAt || 'Not provided'}</dd></div></> : credential.idLast4 ? <div><dt className="text-slate-500">ID reference</dt><dd className="mt-1 font-medium">Ending in {credential.idLast4}</dd></div> : null}
          <div><dt className="text-slate-500">Submitted</dt><dd className="mt-1">{credential.submittedAt && Number.isFinite(Date.parse(credential.submittedAt)) ? new Date(credential.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) + ' · Manila time' : 'Date unavailable'}</dd></div>
          {credential.reviewNotes ? <div className="sm:col-span-2"><dt className="text-slate-500">Clinic review note</dt><dd className="mt-1 whitespace-pre-wrap break-words">{credential.reviewNotes}</dd></div> : null}
        </dl> : <p className="mt-3 text-sm text-slate-500">{professional ? 'No professional ID has been submitted for review.' : 'No government ID has been submitted for review.'}</p>}
        {credential?.hasDocument ? <button type="button" className="btn-secondary mt-4" disabled={download.isPending || busy} onClick={() => { download.reset(); void download.mutate() }}>{download.isPending ? 'Preparing document…' : 'Download ID for review'}</button> : null}
        {credential && !editing ? <button type="button" className="btn-secondary mt-3 sm:ml-3" disabled={busy} onClick={openReplacement}>Submit replacement</button> : null}
      </div>
      {isReviewer && credential?.status === 'pending' && credential.hasDocument ? <div className="space-y-3 rounded-2xl border border-rose-200 p-4 dark:border-rose-900">
        <h3 className="font-semibold">Clinic review</h3><p className="text-sm text-slate-500">Check the private document against this account and confirm its validity before verifying.{professional ? ' Check the professional license and expiry using the clinic’s verification process.' : ''}</p>
        {professional ? <a className="inline-block text-sm font-semibold underline" href="https://verification.prc.gov.ph/" target="_blank" rel="noopener noreferrer">Check PRC registration</a> : null}
        {isSelf ? <p className="text-sm text-amber-800">Another administrator must review your own credential.</p> : <>
          <label className="label" htmlFor={inputId('review-note')}>Review note</label><textarea id={inputId('review-note')} className="input min-h-24" value={reviewNotes} maxLength={1500} onChange={(event) => { setReviewNotes(event.target.value); setLocalError(''); review.reset() }} disabled={busy} placeholder="Record the checks performed or why a replacement is needed." />
          <div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={busy || !reviewNotes.trim() || (professional && (!credential.expiresAt || credential.expiresAt <= clinicDate()))} onClick={() => onReview('verified')}>{review.isPending ? 'Saving review…' : 'Verify credential'}</button><button type="button" className="btn-secondary" disabled={busy || !reviewNotes.trim()} onClick={() => onReview('rejected')}>Request replacement</button></div>
        </>}
      </div> : null}
      {editing || !credential ? <form className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700" onSubmit={onSubmit}>
        <h3 className="font-semibold">{credential ? 'Replace current submission' : 'Submit one document'}</h3>
        {credential ? <p className="text-sm text-slate-500">A replacement returns the credential to pending review.{professional ? ' Professional verification will remain pending until the new license is reviewed.' : ''}</p> : null}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {professional ? <><div><label htmlFor={inputId('license')} className="label">Professional license number</label><input id={inputId('license')} className="input" value={form.licenseNumber} maxLength={120} autoComplete="off" required disabled={busy} onChange={(event) => change('licenseNumber', event.target.value)} /></div><div><label htmlFor={inputId('expiry')} className="label">License expiry date</label><input id={inputId('expiry')} className="input min-w-0" type="date" min={clinicDate()} value={form.expiresAt} required disabled={busy} onChange={(event) => change('expiresAt', event.target.value)} /><p className="mt-1 text-xs text-slate-500">Use a future date shown on the professional ID.</p></div></> : <>
            <div><label htmlFor={inputId('type')} className="label">Government-issued ID type</label><select id={inputId('type')} className="input" value={form.documentType} disabled={busy} onChange={(event) => change('documentType', event.target.value)}>{PATIENT_ID_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            {form.documentType === 'other_government_id' ? <div><label htmlFor={inputId('id-name')} className="label">Government ID name</label><input id={inputId('id-name')} className="input" value={form.documentLabel} maxLength={100} required disabled={busy} onChange={(event) => change('documentLabel', event.target.value)} /></div> : null}
            <div><label htmlFor={inputId('last4')} className="label">ID last four characters (optional)</label><input id={inputId('last4')} className="input" value={form.idLast4} maxLength={4} autoComplete="off" disabled={busy} onChange={(event) => change('idLast4', event.target.value)} /><p className="mt-1 text-xs text-slate-500">Do not enter the full government ID number.</p></div>
          </>}
          <div className="min-w-0 sm:col-span-2"><label className="label" htmlFor={inputId('file')}>{professional ? 'One PRC / professional ID file' : 'One government ID file'}</label><input id={inputId('file')} ref={fileInput} className="input block w-full min-w-0 text-sm" type="file" accept="image/jpeg,image/png,application/pdf" required disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setLocalError(''); setNotice(''); submit.reset() }} /><p className="mt-1 text-xs text-slate-500">JPEG, PNG, or PDF, up to 2 MB. Upload one clear document. This replaces the previous submission.</p></div>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={form.consent} required disabled={busy} onChange={(event) => change('consent', event.target.checked)} /><span>{adminMode ? 'I confirm the account holder provided this document and gave permission for private clinic verification.' : 'I confirm this is my document and permit the clinic to review it privately for account verification.'}</span></label>
        <div className="flex flex-wrap gap-3"><button type="submit" className="btn-primary" disabled={busy || !file || !form.consent}>{submit.isPending ? 'Submitting document…' : 'Submit for review'}</button>{credential ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setEditing(false); setFile(null); setLocalError(''); submit.reset() }}>Cancel replacement</button> : null}</div>
      </form> : null}
    </> : null}
  </section>
}
