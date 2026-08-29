import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { usePatientExperienceStore } from '../../store/patientExperienceStore'

const statusMeta = {
  available: 'badge-success',
  limited: 'badge-warning',
  out_of_stock: 'badge-danger',
}

export default function PatientMedicineDetailPage() {
  const { id } = useParams()
  const addToCart = usePatientExperienceStore((state) => state.addToCart)

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-pharmacy-detail'],
    queryFn: () => api.get('/medicines').then((response) => response.data.data),
  })

  const medicine = (data || []).find((item) => String(item.id) === id)

  if (isLoading) return <div className="flex justify-center py-16"><div className="loading-spinner h-8 w-8" /></div>
  if (error) return <div className="alert-critical"><span>{error.response?.data?.message || 'Failed to load medicine.'}</span></div>
  if (!medicine) return <div className="card text-sm text-gray-500">Medicine not found.</div>

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{medicine.item_name}</h1>
          <p className="page-sub">{medicine.dosage || 'Clinic medicine item'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="card overflow-hidden p-0">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="overflow-hidden bg-slate-100">
                {medicine.image_url ? (
                  <img src={medicine.image_url} alt={medicine.item_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-400">No medicine image available</div>
                )}
              </div>

              <div className="space-y-4 p-6">
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${statusMeta[medicine.availability_status] || 'badge-gray'}`}>{medicine.availability_status || 'available'}</span>
                  {medicine.quantity !== undefined ? <span className="badge badge-gray">{medicine.quantity} {medicine.unit || 'units'} in stock</span> : null}
                  {medicine.requires_prescription ? <span className="badge badge-danger">Prescription required</span> : <span className="badge badge-info">Patient pickup eligible</span>}
                </div>

                <div>
                  <h3 className="section-title mb-2">What this medicine is for</h3>
                  <p className="text-sm text-slate-600">{medicine.purpose || medicine.description || 'The clinic has not added a detailed purpose yet.'}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Dosage</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{medicine.dosage || 'Not specified'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Supplier</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{medicine.supplier || 'Clinic inventory'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Usage instructions</h3>
            <p className="mt-3 text-sm text-slate-600">{medicine.usage_instructions || 'No detailed instruction paragraph has been added yet.'}</p>

            <div className="mt-5 grid gap-3">
              {(medicine.usage_steps || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                  Step-by-step usage has not been added yet.
                </div>
              ) : (
                medicine.usage_steps.map((step, index) => (
                  <div key={`${medicine.id}-step-${index}`} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]">{index + 1}</div>
                    <p className="text-sm text-slate-700">{step}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card">
              <h3 className="section-title">Precautions</h3>
              <p className="mt-3 text-sm text-slate-600">{medicine.precautions || 'No precautions were added for this entry yet.'}</p>
            </div>
            <div className="card">
              <h3 className="section-title">Possible side effects</h3>
              <p className="mt-3 text-sm text-slate-600">{medicine.side_effects || 'No side effects were added for this entry yet.'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="section-title">Quick actions</h3>
            <div className="mt-4 flex flex-col gap-3">
              <button type="button" className="btn-primary justify-center" onClick={() => addToCart(medicine)}>Add to cart</button>
              <Link to="/my/pharmacy/checkout" className="btn-secondary justify-center">Go to checkout</Link>
              <Link to="/my/pharmacy" className="btn-ghost justify-center">Back to pharmacy</Link>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Pickup notes</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-4"><span>Availability</span><span className="font-medium text-slate-900">{medicine.availability_status || 'available'}</span></div>
              <div className="flex justify-between gap-4"><span>Prescription</span><span className="font-medium text-slate-900">{medicine.requires_prescription ? 'Required' : 'Not required'}</span></div>
              <div className="flex justify-between gap-4"><span>Unit</span><span className="font-medium text-slate-900">{medicine.unit || 'Pack'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
