import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { usePatientExperienceStore } from '../../store/patientExperienceStore'

const statusMeta = {
  available: 'badge-success',
  limited: 'badge-warning',
  out_of_stock: 'badge-danger',
}

const matchesSearch = (medicine, query) => {
  if (!query) return true
  const haystack = [
    medicine.item_name,
    medicine.dosage,
    medicine.purpose,
    medicine.description,
    medicine.usage_instructions,
  ].join(' ').toLowerCase()

  return haystack.includes(query)
}

export default function PatientPharmacyPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const addToCart = usePatientExperienceStore((state) => state.addToCart)
  const cart = usePatientExperienceStore((state) => state.cart)

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-pharmacy'],
    queryFn: () => api.get('/medicines').then((response) => response.data.data),
  })

  const medicines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return (data || []).filter((medicine) => matchesSearch(medicine, normalizedSearch))
  }, [data, searchTerm])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pharmacy</h1>
          <p className="page-sub">Browse medicines one by one with clear images, intended use, step-by-step guidance, and pickup request actions.</p>
        </div>
        <Link to="/my/pharmacy/checkout" className="btn-primary">Checkout ({cart.length})</Link>
      </div>

      <div className="card">
        <label className="label">Search medicines</label>
        <input
          className="input"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search vitamins, supplements, iron tablets, or usage guidance"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
      ) : error ? (
        <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load medicines.'}</span></div>
      ) : !medicines.length ? (
        <div className="card text-sm text-gray-500">No medicines matched your search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {medicines.map((medicine) => (
            <article key={medicine.id} className="card-hover overflow-hidden p-0">
              <div className="grid h-full md:grid-cols-[220px_1fr]">
                <div className="overflow-hidden bg-slate-100">
                  {medicine.image_url ? (
                    <img src={medicine.image_url} alt={medicine.item_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-slate-400">No image available</div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold text-gray-900">{medicine.item_name}</p>
                      <p className="mt-1 text-sm text-gray-500">{medicine.dosage || medicine.unit || 'Clinic stock'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${statusMeta[medicine.availability_status] || 'badge-gray'}`}>{medicine.availability_status || 'available'}</span>
                      {medicine.requires_prescription ? <span className="badge badge-danger">Prescription</span> : null}
                    </div>
                  </div>

                  <p className="text-sm text-slate-600">{medicine.purpose || medicine.description || 'Patient-friendly purpose will appear here once staff adds it.'}</p>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">How it is used</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {medicine.usage_steps?.length ? medicine.usage_steps.slice(0, 2).join(' • ') : medicine.usage_instructions || 'Detailed usage steps are available on the medicine details screen.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {medicine.quantity !== undefined ? <span className="badge badge-gray">{medicine.quantity} {medicine.unit || 'units'} in stock</span> : null}
                    <Link to={`/my/pharmacy/${medicine.id}`} className="btn-secondary btn-sm">View details</Link>
                    <button type="button" className="btn-primary btn-sm" onClick={() => addToCart(medicine)}>Add to cart</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
