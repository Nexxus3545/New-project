import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { inspectPreparation, philhealthSources, preparationPackages } from '../../utils/philhealthPreparation'

function LoadError({ children, retry }) {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{children}</p><button type="button" className="btn-secondary mt-3" onClick={retry}>Try again</button></div>
}

export default function PhilHealthPreparation({ billing }) {
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [patientId, setPatientId] = useState('')
  const [packageKey, setPackageKey] = useState('antenatal')
  const [showPin, setShowPin] = useState(false)
  useEffect(() => setShowPin(false), [patientId])
  const results = useQuery({ queryKey: ['philhealth-patient-search', search], queryFn: () => api.get('/patients', { params: { search, limit: 20 } }).then((response) => response.data), enabled: search.length >= 2 })
  const patient = useQuery({ queryKey: ['philhealth-patient', patientId], queryFn: () => api.get(`/patients/${patientId}`).then((response) => response.data.data), enabled: Boolean(patientId) })
  const documents = useQuery({ queryKey: ['philhealth-documents', patientId], queryFn: () => api.get('/documents', { params: { patientId } }).then((response) => response.data.data), enabled: Boolean(patientId) })
  const assessment = inspectPreparation(patient.data, documents.data, packageKey)
  const selectedPackage = preparationPackages[packageKey]
  const pin = String(patient.data?.philhealth_id || '')
  const patientBills = (billing.data || []).filter((bill) => bill.patient_id === patientId)
  return <div className="space-y-6">
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 md:p-7 dark:border-emerald-900 dark:bg-emerald-950/30" aria-labelledby="philhealth-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-200">PhilHealth workspace</p><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Not connected to PhilHealth</span></div>
      <h2 id="philhealth-title" className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">Member & document preparation</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 dark:text-slate-300">Review saved member details, supporting documents, and recorded billing references. Live eligibility checks, claim submission, and PhilHealth claim-status updates are not available.</p>
    </section>
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="card" aria-labelledby="member-review-title">
        <h2 id="member-review-title" className="section-title">Review a patient</h2>
        <p className="mt-2 text-sm text-slate-500">Search by name or clinic code. Up to 20 results are shown; refine the search if needed.</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setPatientId(''); setSearch(searchDraft.trim()); if (searchDraft.trim() === search) results.refetch() }}>
          <div className="min-w-0 flex-1"><label htmlFor="philhealth-patient-search" className="label">Find a patient</label><input id="philhealth-patient-search" className="input" minLength={2} maxLength={100} required value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name or clinic code" autoComplete="off" /></div>
          <button className="btn-secondary" type="submit" disabled={searchDraft.trim().length < 2}>Search patients</button>
        </form>
        {search && results.isPending ? <p role="status" className="mt-4 text-sm">Searching patients...</p> : null}
        {results.isError ? <div className="mt-4"><LoadError retry={() => results.refetch()}>Patient search could not be loaded.</LoadError></div> : null}
        {results.data ? <div className="mt-4"><label htmlFor="philhealth-patient" className="label">Select patient</label><select id="philhealth-patient" className="input" value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Choose a patient</option>{(results.data.data || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.first_name} {entry.last_name} · {entry.patient_code || 'Code not recorded'}</option>)}</select>{!results.data.data?.length ? <p className="mt-2 text-sm text-slate-500">No matching patient found.</p> : null}</div> : null}
        <div className="mt-4"><label htmlFor="philhealth-package" className="label">Care package for document review</label><select id="philhealth-package" className="input" value={packageKey} onChange={(event) => setPackageKey(event.target.value)}>{Object.entries(preparationPackages).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></div>
        {!patientId ? <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">Choose a patient to review their saved information. No information is sent to PhilHealth from this workspace.</p> : patient.isPending ? <p className="mt-5 text-sm" role="status">Loading member details...</p> : patient.isError ? <div className="mt-4"><LoadError retry={() => patient.refetch()}>Member details are unavailable.</LoadError></div> : <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{patient.data.first_name} {patient.data.last_name}</h3><Link className="text-sm font-semibold text-rose-700 underline dark:text-rose-300" to={`/patients/${patientId}`}>Open patient record</Link></div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">PhilHealth identification number (PIN)</dt><dd className="mt-1 break-all font-mono text-sm">{pin ? showPin ? pin : `•••• •••• ${pin.replace(/\D/g, '').slice(-4)}` : 'Not recorded'}</dd>{pin ? <button type="button" className="mt-1 text-xs font-semibold text-rose-700 underline dark:text-rose-300" aria-pressed={showPin} onClick={() => setShowPin(!showPin)}>{showPin ? 'Hide PIN' : 'Show PIN'}</button> : null}</div><div><dt className="text-xs text-slate-500">Recorded membership type</dt><dd className="mt-1 text-sm">{patient.data.philhealth_type || 'Not recorded'}</dd></div></dl>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{!assessment.member.pinPresent ? 'PIN needs entry in the patient profile.' : assessment.member.pinFormatValid ? 'PIN has a 12-digit format. Membership and eligibility have not been verified.' : 'Recorded PIN needs a format review; expected 12 digits.'}</p>
          </div>
          <div><h3 className="font-semibold">Supporting documents · {selectedPackage.recordLabel}</h3><p className="mt-2 text-xs leading-5 text-slate-500">Matches use the saved document type, not file contents. Clinic review status is not PhilHealth acceptance.</p>
            {documents.isPending ? <p role="status" className="mt-3 text-sm">Loading supporting documents...</p> : documents.isError ? <div className="mt-3"><LoadError retry={() => documents.refetch()}>Documents are unavailable. Their presence cannot be checked.</LoadError></div> : <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs text-slate-500">PhilHealth ID on file</p><p className="mt-1 font-semibold">{assessment.idDocuments.length ? `${assessment.idDocuments.length} document(s)` : 'No matching document'}</p></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-xs text-slate-500">{selectedPackage.recordLabel} on file</p><p className="mt-1 font-semibold">{assessment.recordDocuments.length ? `${assessment.recordDocuments.length} document(s)` : 'No matching document'}</p></div></div>
              <ul className="mt-4 space-y-2">{[...assessment.idDocuments, ...assessment.recordDocuments].map((document) => <li key={document.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><span>{document.document_type}</span><span className="text-slate-500">Clinic review: {document.verification_status || 'Not recorded'}</span></li>)}</ul><p className="mt-3 text-xs text-slate-500">{assessment.documentsCount} total uploaded documents. Rejected documents are excluded from matching items.</p>
            </>}
          </div><p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">{assessment.warning}</p>
        </div>}
      </section>
      <aside className="space-y-5">
        <section className="card"><h2 className="section-title">Before live eClaims</h2><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300"><li>Confirm facility accreditation and enrollment for the applicable benefits with PhilHealth.</li><li>Choose a certified service provider, or arrange certification of an in-house solution.</li><li>Obtain the eClaims 3.0 implementation package and approved test access.</li><li>Complete testing and authorized production enrollment before enabling a connection.</li></ol><p className="mt-4 text-xs text-slate-500">No provider credentials are collected on this page.</p></section>
        <section className="card"><h2 className="section-title">Current filing guidance</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Delivery claims use CF4. Antenatal and postpartum records use ANCR and PPCR. Confirm the full case requirements with the clinic's claims officer.</p><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">eClaims 3.0 requires electronic SOA for applicable claims with admission dates from April 2026. An uploaded PDF does not prove eSOA compliance.</p><ul className="mt-4 space-y-3">{philhealthSources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-rose-700 underline underline-offset-4 dark:text-rose-300">{source.label} ↗</a></li>)}</ul></section>
      </aside>
    </div>
    {patientId ? <section className="card" aria-labelledby="claim-history-title"><h2 id="claim-history-title" className="section-title">Recorded claim references</h2><p className="mt-2 text-sm text-slate-500">Saved billing references for the selected patient. These are not live PhilHealth claim-status results.</p>{billing.isPending ? <p role="status" className="mt-4">Loading billing records...</p> : billing.isError ? <div className="mt-4"><LoadError retry={() => billing.refetch()}>Claim references could not be loaded.</LoadError></div> : <div className="table-container mt-4"><table className="table"><thead><tr><th>Service</th><th>Recorded claim reference</th><th>Recorded PhilHealth amount</th><th>Payment status</th></tr></thead><tbody>{patientBills.map((bill) => <tr key={bill.id}><td>{bill.service_type || 'Not recorded'}</td><td>{bill.philhealth_claim_no || 'Not recorded'}</td><td>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(bill.philhealth_amount) || 0)}</td><td>{bill.payment_status}</td></tr>)}{!patientBills.length ? <tr><td colSpan={4}>No billing references recorded for this patient.</td></tr> : null}</tbody></table></div>}</section> : null}
  </div>
}
