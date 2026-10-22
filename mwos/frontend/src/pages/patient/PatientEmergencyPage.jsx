import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { createTransportSubmission } from '../../utils/transportRequests'
import TransportRequestReceipt from '../../components/patient/TransportRequestReceipt'

const clinicQuery = 'TMC Copino Birthing Home and Medical Clinic Gajo Tiwi Albay'
const emptyRequestForm = {
  requestType: 'ambulance', pickupLocation: '', landmark: '', symptoms: '',
  destination: 'TMC Copino Clinic', callbackNumber: '', companionNotes: '',
}

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
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)
  const [requestForm, setRequestForm] = useState({ ...emptyRequestForm })
  const receiptRef = useRef(null)
  const submitLockRef = useRef(false)
  const submission = useMemo(() => createTransportSubmission({
    userId, post: (url, payload) => api.post(url, payload),
  }), [userId])
  const previousRequestId = submission.getRequestId()
  const previousRequestQuery = useQuery({
    queryKey: ['emergency-transport-request', userId, previousRequestId],
    queryFn: () => api.get(`/interactions/threads/${previousRequestId}`).then((response) => {
      const request = response.data.data
      if (request?.created_by !== userId || !request.messages?.[0]?.body?.startsWith('Emergency transport request\n')) {
        throw new Error('This reference could not be confirmed as your transport request. Check Messages for details.')
      }
      return request
    }),
    enabled: Boolean(userId && previousRequestId),
    retry: false,
  })
  const [liveLocation, setLiveLocation] = useState(null)
  const [locationState, setLocationState] = useState('idle')
  const [locationError, setLocationError] = useState('')
  const locationWatchRef = useRef(null)
  const lastLocationPostRef = useRef(0)
  const isLocationSharingRef = useRef(false)

  const { data: patient } = useQuery({
    queryKey: ['patient-me-emergency'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })
  const { data: activeLocation } = useQuery({
    queryKey: ['emergency-location-me'],
    queryFn: () => api.get('/emergency/location/me').then((response) => response.data.data),
    refetchInterval: locationState === 'sharing' ? 30000 : false,
  })

  const originLabel = useMemo(() => {
    const parts = [patient?.address, patient?.barangay, patient?.city, patient?.province].filter(Boolean)
    return parts.join(', ')
  }, [patient])

  const sharedLocation = liveLocation || activeLocation

  const services = useMemo(() => {
    const communityBase = [patient?.barangay, patient?.city, patient?.province].filter(Boolean).join(' ')
    const communityQuery = communityBase ? `${communityBase} barangay health station` : 'Barangay health station Tiwi Albay'
    const ambulanceQuery = communityBase ? `${communityBase} ambulance service` : 'Ambulance service Tiwi Albay'
    const referralQuery = communityBase ? `hospital near ${communityBase}` : 'Hospital near Tiwi Albay'

    const baseServices = [
      buildService('clinic', 'Clinic triage hub', 'Open the clinic location in Google Maps for rapid arrival and referral coordination.', clinicQuery, 'Open clinic route'),
      buildService('barangay', 'Barangay healthcare service', 'Find the nearest barangay health station for immediate first response and local assistance.', communityQuery, 'Open barangay route'),
      buildService('ambulance', 'Emergency transport', 'Use the request form below, then open an ambulance-related map search for nearby transport options.', ambulanceQuery, 'Search ambulance route'),
      buildService('hospital', 'Referral hospital', 'Locate the nearest hospital in case the clinic or barangay team advises direct hospital transfer.', referralQuery, 'Open hospital route'),
    ]
    if (!sharedLocation) return baseServices

    return [
      buildService('live-location', 'My shared live location', `Device location last updated ${new Date(sharedLocation.sharedAt || Date.now()).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}. Emergency staff can use this point for coordination.`, `${sharedLocation.latitude},${sharedLocation.longitude}`, 'Open live location'),
      ...baseServices,
    ]
  }, [patient, sharedLocation])

  const [selectedService, setSelectedService] = useState('clinic')

  const activeService = services.find((item) => item.type === selectedService) || services[0]
  const emergencyNumber = '911'

  const locationMutation = useMutation({
    mutationFn: (payload) => api.post('/emergency/location', payload).then((response) => response.data.data),
    onSuccess: (data) => {
      setLiveLocation(data)
      setLocationState('sharing')
      setLocationError('')
      setSelectedService('live-location')
      queryClient.setQueryData(['emergency-location-me'], data)
    },
    onError: (error) => setLocationError(error.response?.data?.message || 'We could not share your device location. Please check your connection and try again.'),
  })

  const stopLocationMutation = useMutation({
    mutationFn: () => api.delete('/emergency/location'),
    onSuccess: () => {
      setLiveLocation(null)
      setLocationState('idle')
      setLocationError('')
      queryClient.setQueryData(['emergency-location-me'], null)
    },
    onError: (error) => setLocationError(error.response?.data?.message || 'We stopped device tracking, but could not confirm that the saved share was removed. Please try again.'),
  })

  const stopLiveLocation = () => {
    if (locationWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchRef.current)
    locationWatchRef.current = null
    isLocationSharingRef.current = false
    setLocationState('idle')
    stopLocationMutation.mutate()
  }

  const startLiveLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('This device does not support location sharing. Enter your pickup location manually or use your saved address.')
      return
    }

    setLocationState('requesting')
    setLocationError('')
    isLocationSharingRef.current = true
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          consent: true,
        }
        setLiveLocation({ ...payload, sharedAt: new Date().toISOString() })
        setLocationState('sharing')
        setRequestForm((current) => current.pickupLocation ? current : ({
          ...current,
          pickupLocation: `Current GPS location (${payload.latitude.toFixed(5)}, ${payload.longitude.toFixed(5)})`,
        }))

        const now = Date.now()
        if (now - lastLocationPostRef.current >= 10000) {
          lastLocationPostRef.current = now
          locationMutation.mutate(payload)
        }
      },
      (error) => {
        isLocationSharingRef.current = false
        if (locationWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchRef.current)
        locationWatchRef.current = null
        setLocationState('idle')
        setLocationError(error.code === 1
          ? 'Location permission was not granted. You can still use your saved address or enter a pickup location.'
          : 'We could not get your current location. Please check location services and try again.')
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )
  }

  useEffect(() => () => {
    if (locationWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchRef.current)
    if (isLocationSharingRef.current) void api.delete('/emergency/location').catch(() => {})
  }, [])

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
        `Live GPS: ${sharedLocation ? `${sharedLocation.latitude}, ${sharedLocation.longitude} (accuracy ${Math.round(sharedLocation.accuracyMeters || 0)} m)` : 'Not shared'}`,
      ].join('\n')

      return submission.submit({
        title: 'Emergency transport request',
        initialMessage: body,
        priority: 'urgent',
      })
    },
    retry: false,
    onSuccess: (request) => {
      queryClient.setQueryData(['emergency-transport-request', userId, request.id], request)
      queryClient.invalidateQueries({ queryKey: ['message-threads'] })
    },
    onSettled: () => { submitLockRef.current = false },
  })
  const requestReceipt = emergencyMutation.data || previousRequestQuery.data
  const checkingPreviousRequest = Boolean(previousRequestId && previousRequestQuery.isPending)
  const previousRequestUnconfirmed = previousRequestQuery.isError && previousRequestQuery.error.response?.status !== 404
  const requestDetailsLocked = emergencyMutation.isPending || checkingPreviousRequest || previousRequestUnconfirmed || submission.hasSubmitted()

  useEffect(() => {
    if (!emergencyMutation.data) return
    receiptRef.current?.focus({ preventScroll: true })
    receiptRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' })
  }, [emergencyMutation.data])

  const startDifferentRequest = () => {
    if (!window.confirm('This creates a separate new request. For an update to your current request, use Messages instead. Start a different request?')) return
    if (!submission.reset()) return
    emergencyMutation.reset()
    setRequestForm({ ...emptyRequestForm })
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency Transport</h1>
          <p className="page-sub">Request clinic or barangay support, open Google Maps routes, and escalate to emergency transport from one place.</p>
        </div>
      </div>

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
          <Link to="/my/messages" className="btn-secondary btn-sm mt-4 justify-center">Open messages</Link>
        </div>
      </div>

      <div className={`card ${locationState === 'sharing' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Live pickup location</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{locationState === 'sharing' ? 'Your device location is being shared with emergency staff' : 'Share your current device location during an emergency'}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Location sharing is optional. It is sent only to authorized clinic staff for emergency coordination, automatically expires after 15 minutes without an update, and stops when you leave this page or choose Stop sharing.</p>
            {sharedLocation && <p className="mt-2 text-xs text-slate-500">Last device update: {new Date(sharedLocation.sharedAt).toLocaleString('en-PH')} {sharedLocation.accuracyMeters ? `· accuracy about ${Math.round(sharedLocation.accuracyMeters)} m` : ''}</p>}
            {locationError && <p className="mt-2 text-sm text-red-700" role="alert">{locationError}</p>}
          </div>
          {locationState === 'sharing' ? (
            <button type="button" className="btn-danger justify-center" disabled={stopLocationMutation.isPending} onClick={stopLiveLocation}>{stopLocationMutation.isPending ? 'Stopping...' : 'Stop sharing'}</button>
          ) : (
            <button type="button" className="btn-primary justify-center" disabled={locationState === 'requesting'} onClick={startLiveLocation}>{locationState === 'requesting' ? 'Requesting location...' : 'Share live location'}</button>
          )}
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
            aria-busy={emergencyMutation.isPending || checkingPreviousRequest}
            onSubmit={(event) => {
              event.preventDefault()
              if (submitLockRef.current || requestReceipt || checkingPreviousRequest || previousRequestUnconfirmed) return
              submitLockRef.current = true
              emergencyMutation.mutate()
            }}
          >
            <div>
              <h3 className="section-title mb-1">Request emergency transport</h3>
              <p className="text-sm text-slate-500">Send an urgent request to the clinic so they can coordinate ambulance, barangay assistance, or referral guidance.</p>
            </div>

            {requestReceipt ? <div ref={receiptRef} tabIndex={-1} className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <TransportRequestReceipt request={requestReceipt} onNewRequest={startDifferentRequest} />
            </div> : <>
            {checkingPreviousRequest ? <p role="status" className="rounded-2xl bg-slate-100 p-4 text-sm">Checking your previous request before sending another...</p> : null}
            {emergencyMutation.isError || previousRequestUnconfirmed ? <div role="alert" className="alert-critical text-sm">
              <p>We could not confirm the request. It may already be in the clinic inbox. Check Messages before trying again.</p>
              <p className="mt-1">Retrying sends the original details with the same reference, not a separate request.</p>
              <p className="mt-1">{emergencyMutation.error?.response?.data?.message || emergencyMutation.error?.message || previousRequestQuery.error?.response?.data?.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/my/messages" state={previousRequestId ? { threadId: previousRequestId } : undefined} className="btn-secondary">Check Messages</Link>
                <button type="button" className="btn-secondary" onClick={() => previousRequestQuery.refetch()}>Check request status</button>
              </div>
            </div> : null}
            <fieldset disabled={requestDetailsLocked} className="grid gap-4 md:grid-cols-2">
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
            </fieldset>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={requestDetailsLocked} onClick={() => setRequestForm((current) => ({ ...current, pickupLocation: sharedLocation ? `Current GPS location (${sharedLocation.latitude.toFixed(5)}, ${sharedLocation.longitude.toFixed(5)})` : originLabel || current.pickupLocation }))}>{sharedLocation ? 'Use live location' : 'Use saved address'}</button>
              <button type="submit" className="btn-primary" disabled={emergencyMutation.isPending || checkingPreviousRequest || previousRequestUnconfirmed}>
                {emergencyMutation.isPending ? 'Sending request...' : 'Send urgent transport request'}
              </button>
            </div>
            {emergencyMutation.isPending ? <p role="status" className="text-sm font-medium text-slate-600">Sending your request. Please wait; do not press Send again.</p> : null}
            </>}
          </form>
        </div>
      </div>
    </div>
  )
}
