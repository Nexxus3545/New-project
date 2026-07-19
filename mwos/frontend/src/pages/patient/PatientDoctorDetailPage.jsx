import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../utils/api'

const roleLabel = (role) => role === 'midwife' ? 'Midwife' : 'Doctor'

const specialtyCopy = {
  doctor: ['Prenatal visits', 'Risk review', 'Lab result follow-up'],
  midwife: ['Routine checkups', 'Birth preparation', 'Postpartum guidance'],
}

export default function PatientDoctorDetailPage() {
  const { id } = useParams()
  const [teleconsultResult, setTeleconsultResult] = React.useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-directory-doctor-detail'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const teleconsultMutation = useMutation({
    mutationFn: (doctor) => api.post('/interactions/teleconsults', {
      clinicianId: doctor.id,
      title: `${doctor.first_name} ${doctor.last_name} tele-consult`,
      reason: `Patient requested a tele-consult with ${doctor.first_name} ${doctor.last_name}.`,
      initialMessage: `Hello care team, I would like to request a tele-consult with ${doctor.first_name} ${doctor.last_name}.`,
      triggerSource: 'manual',
    }).then((response) => response.data.data),
    onSuccess: (result) => {
      setTeleconsultResult(result)
    },
  })

  const doctor = (data?.staff || []).find((member) => member.id === id)

  if (isLoading) return <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
  if (error) return <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load provider.'}</span></div>
  if (!doctor) return <div className="card text-sm text-gray-500">Provider not found.</div>

  const specialties = specialtyCopy[doctor.role] || specialtyCopy.doctor

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{doctor.first_name} {doctor.last_name}</h1>
          <p className="page-sub">{roleLabel(doctor.role)} • TMC Copino Birthing Home and Medical Clinic</p>
        </div>
      </div>

      {teleconsultMutation.isSuccess ? (
        <div className="alert-success">
          <span>Tele-consult request sent to the care team.</span>
          {teleconsultResult?.meetingUrl ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={teleconsultResult.meetingUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Open tele-consult</a>
              <Link to="/my/interactions" state={{ threadId: teleconsultResult.thread?.id }} className="btn-secondary btn-sm">Open messages</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {teleconsultMutation.isError ? (
        <div className="alert-critical"><span>{teleconsultMutation.error.response?.data?.message || 'Unable to create tele-consult request.'}</span></div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title">About this provider</h3>
            <p className="mt-3 text-sm text-gray-600">
              This profile keeps the current web portal styling while exposing the healthcare-style doctor flow across platforms.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge badge-success">Available this week</span>
              <span className="badge badge-info">{roleLabel(doctor.role)}</span>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Focus areas</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-600">
              {specialties.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                  <span className="badge badge-gray">+</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title">Quick actions</h3>
            <div className="mt-4 flex flex-col gap-3">
              <Link to="/my/appointments" className="btn-primary justify-center">Book consultation</Link>
              <button
                type="button"
                className="btn-secondary justify-center"
                disabled={teleconsultMutation.isPending}
                onClick={() => teleconsultMutation.mutate(doctor)}
              >
                {teleconsultMutation.isPending ? 'Sending request...' : 'Start tele-consult'}
              </button>
              <Link to="/my/doctors" className="btn-ghost justify-center">Back to doctors</Link>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Availability snapshot</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Mon', 'Wed', 'Fri'].map((slot) => (
                <span key={slot} className="badge badge-gray">{slot}</span>
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Final appointment timing is confirmed by the clinic after your request is reviewed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
