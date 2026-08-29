import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../utils/api'

const clinicQuery = 'TMC Copino Birthing Home and Medical Clinic Gajo Tiwi Albay'

const buildService = (type, title, description, query, cta) => ({
  type,
  title,
  description,
  query,
  cta,
  mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  embedUrl: `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`,
})

export default function PatientEmergencyPage() {
  const [requestForm, setRequestForm] = useState({
    requestType: 'ambulance',
    pickupLocation: '',
    landmark: '',
    symptoms: '',
    destination: 'TMC Copino Clinic',
    callbackNumber: '',
    companionNotes: '',
  })

  const { data: patient } = useQuery({
    queryKey: ['patient-me-emergency'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const originLabel = useMemo(() => {
    const parts = [patient?.address, patient?.barangay, patient?.city, patient?.province].filter(Boolean)
    return parts.join(', ')
  }, [patient])

  const services = useMemo(() => {
    const communityBase = [patient?.barangay, patient?.city, patient?.province].filter(Boolean).join(' ')
    const communityQuery = communityBase ? `${communityBase} barangay health station` : 'Barangay health station Tiwi Albay'
    const ambulanceQuery = communityBase ? `${communityBase} ambulance service` : 'Ambulance service Tiwi Albay'
    const referralQuery = communityBase ? `hospital near ${communityBase}` : 'Hospital near Tiwi Albay'

    return [
      buildService('clinic', 'Clinic triage hub', 'Open the clinic location in Google Maps for rapid arrival and referral coordination.', clinicQuery, 'Open clinic route'),
      buildService('barangay', 'Barangay healthcare service', 'Find the nearest barangay health station for immediate first response and local assistance.', communityQuery, 'Open barangay route'),
      buildService('ambulance', 'Emergency transport', 'Use the request form below, then open an ambulance-related map search for nearby transport options.', ambulanceQuery, 'Search ambulance route'),
      buildService('hospital', 'Referral hospital', 'Locate the nearest hospital in case the clinic or barangay team advises direct hospital transfer.', referralQuery, 'Open hospital route'),
    ]
  }, [patient])

  const [selectedService, setSelectedService] = useState('clinic')

  const activeService = services.find((item) => item.type === selectedService) || services[0]
  const emergencyNumber = '911'

  const emergencyMutation = useMutation({
    mutationFn: () => {
      const body = [
        'Emergency transport request',
        `Type: ${requestForm.requestType}`,
        `Pickup location: ${requestForm.pickupLocation || originLabel || 'Not provided'}`,
        `Landmark: ${requestForm.landmark || 'Not provided'}`,
        `Symptoms: ${requestForm.symptoms || 'Not provided'}`,
        `Preferred destination: ${requestForm.destination || 'TMC Copino Clinic'}`,
        `Callback number: ${requestForm.callbackNumber || patient?.phone || 'Not provided'}`,
        `Companion notes: ${requestForm.companionNotes || 'None'}`,
      ].join('\n')

      return api.post('/interactions/threads', {
        title: 'Emergency transport request',
        initialMessage: body,
        priority: 'urgent',
      })
    },
  })

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency Transport</h1>
          <p className="page-sub">Request clinic or barangay support, open Google Maps routes, and escalate to emergency transport from one place.</p>
        </div>
      </div>

      {emergencyMutation.isSuccess ? (
        <div className="alert-success"><span>Emergency transport request sent to the clinic care team. Keep your phone nearby for call-back coordination.</span></div>
      ) : null}
      {emergencyMutation.isError ? (
        <div className="alert-critical"><span>{emergencyMutation.error.response?.data?.message || 'Unable to send urgent request.'}</span></div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card border-red-100 bg-red-50">
          <p className="text-xs uppercase tracking-[0.22em] text-red-500">Emergency call</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{emergencyNumber}</p>
          <a href={`tel:${emergencyNumber}`} className="btn-danger btn-sm mt-4 justify-center">Call now</a>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Saved address</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">{originLabel || 'No saved patient address yet'}</p>
          <p className="mt-2 text-sm text-slate-500">Use your saved address as the pickup point for transport coordination.</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Care team</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">Clinic and barangay escalation</p>
          <Link to="/my/interactions" className="btn-secondary btn-sm mt-4 justify-center">Open messages</Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title mb-4">Emergency map services</h3>
            <div className="grid gap-3">
              {services.map((service) => (
                <button
                  key={service.type}
                  type="button"
                  onClick={() => setSelectedService(service.type)}
                  className={`text-left rounded-2xl border px-4 py-4 transition-all ${selectedService === service.type ? 'border-[var(--accent)] bg-[var(--accent-ghost)] shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{service.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{service.description}</p>
                    </div>
                    <span className="badge badge-info">{service.type}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title mb-4">Immediate safety checklist</h3>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">If there is heavy bleeding, loss of consciousness, seizure activity, or severe breathing difficulty, call <strong>911</strong> immediately before using the transport request form.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">If possible, keep a companion nearby and prepare your ID, pregnancy booklet, and current medication list.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Use the barangay health station option if you need the nearest community-based first response while the clinic is coordinating next steps.</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card overflow-hidden p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="section-title mb-1">{activeService.title}</h3>
                  <p className="text-sm text-slate-500">{activeService.description}</p>
                </div>
                <a href={activeService.mapUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">{activeService.cta}</a>
              </div>
            </div>
            <iframe
              title={`${activeService.title} map`}
              src={activeService.embedUrl}
              className="h-[360px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <form
            className="card space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              emergencyMutation.mutate()
            }}
          >
            <div>
              <h3 className="section-title mb-1">Request emergency transport</h3>
              <p className="text-sm text-slate-500">Send an urgent request to the clinic so they can coordinate ambulance, barangay assistance, or referral guidance.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Request type</label>
                <select className="input" value={requestForm.requestType} onChange={(event) => setRequestForm((current) => ({ ...current, requestType: event.target.value }))}>
                  <option value="ambulance">Ambulance transport</option>
                  <option value="barangay-assist">Barangay health assist</option>
                  <option value="clinic-callback">Urgent clinic callback</option>
                </select>
              </div>
              <div>
                <label className="label">Callback number</label>
                <input className="input" value={requestForm.callbackNumber} onChange={(event) => setRequestForm((current) => ({ ...current, callbackNumber: event.target.value }))} placeholder={patient?.phone || 'Mobile number for call-back'} />
              </div>
              <div className="md:col-span-2">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="label mb-0">Pickup location</label>
                  {originLabel ? (
                    <button type="button" className="text-xs font-medium text-[var(--accent)]" onClick={() => setRequestForm((current) => ({ ...current, pickupLocation: originLabel }))}>
                      Use saved address
                    </button>
                  ) : null}
                </div>
                <input className="input" value={requestForm.pickupLocation} onChange={(event) => setRequestForm((current) => ({ ...current, pickupLocation: event.target.value }))} placeholder="House, street, barangay, municipality" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Nearest landmark</label>
                <input className="input" value={requestForm.landmark} onChange={(event) => setRequestForm((current) => ({ ...current, landmark: event.target.value }))} placeholder="School, chapel, crossing, sari-sari store..." />
              </div>
              <div className="md:col-span-2">
                <label className="label">Symptoms or emergency reason</label>
                <textarea className="input min-h-[110px]" value={requestForm.symptoms} onChange={(event) => setRequestForm((current) => ({ ...current, symptoms: event.target.value }))} placeholder="Describe the situation, warning signs, or transport reason." />
              </div>
              <div>
                <label className="label">Preferred destination</label>
                <input className="input" value={requestForm.destination} onChange={(event) => setRequestForm((current) => ({ ...current, destination: event.target.value }))} />
              </div>
              <div>
                <label className="label">Companion notes</label>
                <input className="input" value={requestForm.companionNotes} onChange={(event) => setRequestForm((current) => ({ ...current, companionNotes: event.target.value }))} placeholder="Who is with the patient?" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRequestForm((current) => ({ ...current, pickupLocation: originLabel || current.pickupLocation }))}>Use recorded location</button>
              <button type="submit" className="btn-primary" disabled={emergencyMutation.isPending}>
                {emergencyMutation.isPending ? 'Sending request...' : 'Send urgent transport request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
