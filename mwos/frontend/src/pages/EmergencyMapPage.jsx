import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

const mapLink = (latitude, longitude) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`
const embedLink = (latitude, longitude) => `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}&output=embed`

const timeSince = (value) => {
  if (!value) return 'No update time'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Updated just now'
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)} min ago`
  return `Updated ${Math.floor(seconds / 3600)} hr ago`
}

export default function EmergencyMapPage() {
  const [selectedId, setSelectedId] = useState('')
  const { data: locations = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['emergency-map-locations'],
    queryFn: () => api.get('/emergency/locations').then((response) => response.data.data),
    refetchInterval: 10000,
  })

  useEffect(() => {
    if (!selectedId && locations[0]?.id) setSelectedId(locations[0].id)
    if (selectedId && !locations.some((location) => location.id === selectedId)) setSelectedId(locations[0]?.id || '')
  }, [locations, selectedId])

  const selected = locations.find((location) => location.id === selectedId) || locations[0]

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency Live Map</h1>
          <p className="page-sub">Active patient GPS shares for clinic, ambulance, barangay, and referral coordination.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-success">{isFetching ? 'Refreshing...' : 'Refreshes every 10s'}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()}>Refresh now</button>
        </div>
      </div>

      <div className="alert-critical">
        <span>Use this location only for authorized care coordination. A shared point is not a substitute for calling 911 or confirming the patient’s condition by phone.</span>
      </div>

      {error && <div className="alert-critical"><span>{error.response?.data?.message || 'Unable to load active emergency locations.'}</span></div>}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title mb-1">Active location shares</h2>
              <p className="text-sm text-slate-500">Only patients who explicitly enabled sharing appear here.</p>
            </div>
            <span className={`badge ${locations.length ? 'badge-warning' : 'badge-gray'}`}>{locations.length} active</span>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? <div className="flex justify-center py-8"><div className="loading-spinner w-7 h-7" /></div> : locations.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No patient is currently sharing a live emergency location.</p>
            ) : locations.map((location) => (
              <button key={location.id} type="button" onClick={() => setSelectedId(location.id)} className={`w-full rounded-2xl border p-4 text-left transition-colors ${selected?.id === location.id ? 'border-[var(--accent)] bg-[var(--accent-ghost)]' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{location.patientName}</p>
                    <p className="mt-1 text-sm text-slate-600">{[location.barangay, location.city, location.province].filter(Boolean).join(', ') || 'Address not recorded'}</p>
                  </div>
                  <span className="badge badge-success">Active</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">{timeSince(location.sharedAt)}{location.accuracyMeters ? ` · accuracy about ${Math.round(location.accuracyMeters)} m` : ''}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="card overflow-hidden p-0">
          {!selected ? (
            <div className="flex min-h-[480px] items-center justify-center p-8 text-center text-sm text-slate-500">Select an active emergency location to view its map. The list updates when a patient starts or stops sharing.</div>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="section-title mb-1">{selected.patientName}</h2>
                  <p className="text-sm text-slate-500">Coordinates from the patient’s device. Confirm the location and emergency details directly with the patient or companion.</p>
                </div>
                <a href={mapLink(selected.latitude, selected.longitude)} target="_blank" rel="noreferrer" className="btn-primary btn-sm justify-center">Open directions</a>
              </div>
              <iframe title={`${selected.patientName} live location`} src={embedLink(selected.latitude, selected.longitude)} className="h-[440px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
