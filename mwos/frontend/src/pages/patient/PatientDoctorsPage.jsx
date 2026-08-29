import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'

const roleLabel = (role) => role === 'midwife' ? 'Midwife' : 'Doctor'

export default function PatientDoctorsPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-directory-doctors'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const doctors = useMemo(() => {
    const source = (data?.staff || []).filter((member) => ['doctor', 'midwife'].includes(member.role))
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return source

    return source.filter((member) => {
      const haystack = `${member.first_name} ${member.last_name} ${member.role}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [data, searchTerm])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Top Doctors</h1>
          <p className="page-sub">Browse the clinic care team using the same web UI language you already have.</p>
        </div>
      </div>

      <div className="card">
        <label className="label">Search care team</label>
        <input
          className="input"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search doctor or midwife"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
      ) : error ? (
        <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load care team.'}</span></div>
      ) : !doctors.length ? (
        <div className="card text-sm text-gray-500">No providers matched your search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {doctors.map((doctor) => (
            <div key={doctor.id} className="card-hover flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-gray-900">{doctor.first_name} {doctor.last_name}</p>
                <p className="mt-1 text-sm text-gray-500">{roleLabel(doctor.role)} • TMC Copino Clinic</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="badge badge-success">Available</span>
                  <span className="badge badge-gray">Care consultation</span>
                </div>
              </div>
              <Link to={`/my/doctors/${doctor.id}`} className="btn-secondary btn-sm">View</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
