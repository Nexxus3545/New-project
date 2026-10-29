import React, { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { buildCredentialReview, buildCredentialSubmission, clinicDate, credentialLabel, credentialRequirement, credentialScanNeedsAttention, effectiveCredentialStatus, hasCurrentCredentialScan, PATIENT_ID_TYPES, readCredentialResponse } from '../../utils/accountCredentials'

const statusLabels = { missing: 'Not submitted', pending: 'Awaiting clinic review', verified: 'Verified by clinic', rejected: 'Needs replacement', expired: 'Expired — renewal needed' }
const emptyForm = (role) => ({ documentType: credentialRequirement(role) === 'professional_license' ? 'professional_license' : 'philhealth_id', documentLabel: '', licenseNumber: '', idLast4: '', expiresAt: '', consent: false })
const safeMessage = (error, action) => error?.response?.status === 403
  ? 'Additional account verification is required. Complete verification in Account settings and retry.'
  : error?.response?.status === 409
    ? 'This submission changed or was already reviewed. Refresh it before continuing.'
    : action === 'load' ? 'Credentials could not be loaded. Please try again.'
      : action === 'download' ? 'The private document could not be downloaded. Please try again.'
        : action === 'scan' ? 'Automated checks could not finish. Refresh the credential and retry. The document remains available for clinic review.'
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
  const [verificationMethod, setVerificationMethod] = useState('')
  const [officialCheckConfirmed, setOfficialCheckConfirmed] = useState(false)
  const [acknowledgeScanFlags, setAcknowledgeScanFlags] = useState(false)
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
    refetchInterval: (query) => query.state.data?.credential?.scan?.status === 'processing' ? 2000 : false,
  })
  const credential = credentialQuery.data?.credential
  const status = effectiveCredentialStatus(credential)
  const currentScan = hasCurrentCredentialScan(credential)
  const scanConcerns = credentialScanNeedsAttention(credential)
  const scanProcessing = credential?.scan?.status === 'processing'

  useEffect(() => {
    setForm(emptyForm(account?.role)); setFile(null); setEditing(false); setReviewNotes(''); setNotice(''); setLocalError('')
    if (fileInput.current) fileInput.current.value = ''
  }, [account?.id, account?.role])
  useEffect(() => {
    setVerificationMethod(''); setOfficialCheckConfirmed(false); setAcknowledgeScanFlags(false)
  }, [account?.id, credential?.revision, credential?.scan?.scannedAt, credential?.scan?.status])
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
      const response = await api.post(endpoint, payload, { timeout: 45000 })
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
    mutationFn: async (payload) => {
      const response = await api.patch(`${endpoint}/review`, payload)
      const data = readCredentialResponse(response.data.data, { userId: account.id, role: account.role })
      if (data.credential?.status !== payload.status || data.credential.revision !== payload.revision) throw new Error('Invalid review receipt')
      return data
    },
    onSuccess: (data) => { saved(data); setReviewNotes(''); setNotice(data.credential.status === 'verified' ? 'Credential verified by the clinic.' : 'Replacement requested. The account holder can submit a new document.') },
    onError: (error) => { if (error?.response?.status === 409) credentialQuery.refetch() },
  })
  const scanMutation = useMutation({
    mutationFn: async ({ revision }) => {
      const response = await api.post(`${endpoint}/scan`, { revision }, { timeout: 45000 })
      const data = readCredentialResponse(response.data.data, { userId: account.id, role: account.role })
      if (data.credential?.revision !== revision || data.credential.scan.revision !== revision || data.credential.scan.status === 'not_scanned') throw new Error('Invalid scan receipt')
      return data
    },
    onSuccess: (data) => { saved(data); setNotice(data.credential.scan.status === 'processing' ? 'The private automated check is running. Results will refresh here.' : 'Automated checks finished. Official identity confirmation is still required.') },
    onError: () => { void credentialQuery.refetch() },
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
  const busy = submit.isPending || review.isPending || scanMutation.isPending || scanProcessing
  const error = localError || (submit.error ? safeMessage(submit.error, 'submit') : review.error ? safeMessage(review.error, 'review') : scanMutation.error ? safeMessage(scanMutation.error, 'scan') : download.error ? safeMessage(download.error, 'download') : '')
  const verificationNeeded = [submit.error, review.error, scanMutation.error, download.error].some((item) => item?.response?.status === 403)
  if (!account?.id || requirement === 'none') return null
  if (adminMode && !isReviewer) return null

  const change = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setLocalError(''); setNotice(''); submit.reset() }
  const openReplacement = () => {
    setForm({ ...emptyForm(account.role), documentType: credential?.documentType || emptyForm(account.role).documentType, documentLabel: credential?.documentLabel || '', licenseNumber: credential?.licenseNumber || '', expiresAt: credential?.expiresAt || '' })
    setEditing(true); setNotice(''); setLocalError(''); submit.reset(); scanMutation.reset()
  }
  const onSubmit = (event) => {
    event.preventDefault(); setLocalError(''); setNotice(''); review.reset(); download.reset(); scanMutation.reset()
    submit.mutate({ submittedForm: { ...form }, submittedFile: file })
  }
  const onReview = (decision) => {
    setNotice(''); setLocalError(''); submit.reset(); download.reset()
    try { review.mutate(buildCredentialReview({ credential, decision, reviewNotes, verificationMethod, officialCheckConfirmed, acknowledgeScanFlags })) }
    catch (error) { setLocalError(error.message) }
  }

  return <section id={!adminMode ? 'account-credentials' : undefined} className="card min-w-0 space-y-5" aria-labelledby={inputId('title')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="section-kicker">{professional ? 'Clinical staff credentials' : 'Patient credentials'}</p><h2 id={inputId('title')} className="mt-1 text-xl font-semibold">{professional ? 'Professional license verification' : 'Patient identity verification'}</h2>
        <p className="mt-2 text-sm text-slate-500">{professional ? 'Doctors, nurses, and midwives need a current PRC or professional ID, license number, and expiry date.' : 'Submit one valid government-issued ID, such as a PhilHealth ID or National ID. One current document is enough.'}</p>
      </div>
      <button className="btn-secondary btn-sm" type="button" disabled={credentialQuery.isFetching || busy} onClick={() => { setNotice(''); void credentialQuery.refetch() }}>Refresh credentials</button>
    </div>
    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Documents are scanned privately for readable details and consistency. These checks do not establish authenticity. The clinic confirms the ID before approving it.</p>
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
      {credential?.hasDocument ? <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby={inputId('scan-title')}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={inputId('scan-title')} className="font-semibold">Automated document checks</h3><p className="mt-1 text-sm text-slate-500">This scan compares readable information with the submitted account.</p></div><button type="button" className="btn-secondary btn-sm" disabled={busy || editing} onClick={() => { setNotice(''); setLocalError(''); scanMutation.reset(); scanMutation.mutate({ revision: credential.revision }) }}>{scanMutation.isPending || scanProcessing ? 'Checking document…' : credential.scan.status === 'not_scanned' ? 'Run automated check' : 'Rescan ID'}</button></div>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><strong>Official authenticity not yet verified by this scan.</strong> A readable document or matching text does not prove that an ID is genuine or belongs to the person presenting it.</p>
        {scanProcessing || scanMutation.isPending ? <p role="status" className="text-sm text-slate-500">Reading the document privately. This can take up to 45 seconds.</p> : credential.scan.status === 'not_scanned' ? <p className="text-sm text-slate-500">No current automated check is available. Run the check before clinic approval.</p> : <>
          {credential.scan.scannedAt ? <p className="text-xs text-slate-500">Checked {new Date(credential.scan.scannedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · Manila time{!currentScan ? ' · Refresh required before approval' : ''}</p> : null}
          <p role="status" className={`text-sm ${scanConcerns ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}`}>{credential.scan.analysis?.summary || (credential.scan.status === 'unreadable' ? 'The document could not be read clearly. Compare the original ID or submit a clearer copy.' : 'Automatic reading was unavailable. The clinic must inspect the original ID or confirm it with the issuer.')}</p>
          {credential.scan.analysis?.confidence !== null && credential.scan.analysis?.confidence !== undefined ? <p className="text-xs text-slate-500">Text readability score: {Math.round(credential.scan.analysis.confidence)} / 100. This is not an authenticity score.</p> : null}
          {credential.scan.analysis?.checks?.length ? <ul className="grid gap-2 text-sm sm:grid-cols-2">{credential.scan.analysis.checks.map((check, index) => <li key={`${check.code}-${index}`} className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="min-w-0 break-words">{check.label}</span><span className={`badge shrink-0 ${check.result === 'pass' ? 'badge-success' : check.result === 'flag' ? 'badge-warning' : 'badge-gray'}`}>{check.result === 'pass' ? 'Consistent' : check.result === 'flag' ? 'Needs attention' : 'Manual check'}</span></li>)}</ul> : null}
        </>}
        {credential.documentType === 'national_id' ? <a className="inline-block text-sm font-semibold underline" href="https://everify.gov.ph/check" target="_blank" rel="noopener noreferrer">Open official National ID Check</a> : null}
      </div> : null}
      {isReviewer && credential?.status === 'pending' && credential.hasDocument ? <div className="space-y-3 rounded-2xl border border-rose-200 p-4 dark:border-rose-900">
        <h3 className="font-semibold">Clinic review</h3><p className="text-sm text-slate-500">Check the private document against this account and confirm its validity before verifying.{professional ? ' Check the professional license and expiry using the clinic’s verification process.' : ''}</p>
        {professional ? <a className="inline-block text-sm font-semibold underline" href="https://verification.prc.gov.ph/" target="_blank" rel="noopener noreferrer">Check PRC registration</a> : null}
        {isSelf ? <p className="text-sm text-amber-800">Another administrator must review your own credential.</p> : <>
          <label className="label" htmlFor={inputId('review-note')}>Review note</label><textarea id={inputId('review-note')} className="input min-h-24" value={reviewNotes} maxLength={1500} onChange={(event) => { setReviewNotes(event.target.value); setLocalError(''); review.reset() }} disabled={busy} placeholder="Record the checks performed or why a replacement is needed." />
          <label className="label" htmlFor={inputId('verification-method')}>How was the ID confirmed?</label><select id={inputId('verification-method')} className="input" value={verificationMethod} disabled={busy} onChange={(event) => { setVerificationMethod(event.target.value); setOfficialCheckConfirmed(false); setLocalError('') }}><option value="">Choose the check performed</option><option value="issuer_check">Checked with the issuing authority</option><option value="in_person_original">Inspected the original ID in person</option></select>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={officialCheckConfirmed} disabled={busy || !verificationMethod} onChange={(event) => { setOfficialCheckConfirmed(event.target.checked); setLocalError('') }} /><span>I completed the selected identity check and matched the ID to this account.</span></label>
          {currentScan && scanConcerns ? <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={acknowledgeScanFlags} disabled={busy} onChange={(event) => { setAcknowledgeScanFlags(event.target.checked); setLocalError('') }} /><span>I reviewed the scan concerns or unreadable details and resolved them using the selected identity check.</span></label> : null}
          {!currentScan ? <p className="text-sm text-slate-500">Run a current automated check before verification. Results used for approval must be less than 30 minutes old. You can still request a replacement.</p> : null}
          <div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={busy || !reviewNotes.trim() || !currentScan || !verificationMethod || !officialCheckConfirmed || (scanConcerns && !acknowledgeScanFlags) || (professional && (!credential.expiresAt || credential.expiresAt <= clinicDate()))} onClick={() => onReview('verified')}>{review.isPending ? 'Saving review…' : 'Verify credential'}</button><button type="button" className="btn-secondary" disabled={busy || !reviewNotes.trim()} onClick={() => onReview('rejected')}>Request replacement</button></div>
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
          <div className="min-w-0 sm:col-span-2"><label className="label" htmlFor={inputId('file')}>{professional ? 'One PRC / professional ID file' : 'One government ID file'}</label><input id={inputId('file')} ref={fileInput} className="input block w-full min-w-0 text-sm" type="file" accept="image/jpeg,image/png,application/pdf" required disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setLocalError(''); setNotice(''); submit.reset() }} /><p className="mt-1 text-xs text-slate-500">JPEG, PNG, or PDF, up to 2 MB. Upload one clear document. This replaces the previous submission. Private scanning can take up to 45 seconds.</p></div>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={form.consent} required disabled={busy} onChange={(event) => change('consent', event.target.checked)} /><span>{adminMode ? 'I confirm the account holder provided this document and gave permission for private clinic verification.' : 'I confirm this is my document and permit the clinic to review it privately for account verification.'}</span></label>
        <div className="flex flex-wrap gap-3"><button type="submit" className="btn-primary" disabled={busy || !file || !form.consent}>{submit.isPending ? 'Submitting and checking document…' : 'Submit for review'}</button>{credential ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setEditing(false); setFile(null); setLocalError(''); submit.reset() }}>Cancel replacement</button> : null}</div>
      </form> : null}
    </> : null}
  </section>
}
