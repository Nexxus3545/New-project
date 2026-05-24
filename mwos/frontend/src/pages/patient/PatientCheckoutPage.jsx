import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { usePatientExperienceStore } from '../../store/patientExperienceStore'

export default function PatientCheckoutPage() {
  const navigate = useNavigate()
  const cart = usePatientExperienceStore((state) => state.cart)
  const updateQuantity = usePatientExperienceStore((state) => state.updateQuantity)
  const removeFromCart = usePatientExperienceStore((state) => state.removeFromCart)
  const clearCart = usePatientExperienceStore((state) => state.clearCart)
  const [pickupNotes, setPickupNotes] = useState('')

  const { data: patient } = useQuery({
    queryKey: ['patient-me-checkout'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
    enabled: cart.length > 0,
  })

  const totalUnits = useMemo(
    () => cart.reduce((sum, item) => sum + (item.quantity || 1), 0),
    [cart]
  )

  const submitMutation = useMutation({
    mutationFn: () => api.post('/interactions/threads', {
      title: 'Pharmacy pickup request',
      initialMessage: [
        `Patient: ${patient?.first_name || 'Unknown'} ${patient?.last_name || ''}`.trim(),
        'Requested medicines:',
        ...cart.map((item) => `- ${item.item_name} x${item.quantity || 1}`),
        pickupNotes.trim() ? `Notes: ${pickupNotes.trim()}` : 'Notes: none',
      ].join('\n'),
      priority: 'high',
    }),
    onSuccess: () => {
      clearCart()
      navigate('/my/pharmacy/success')
    },
  })

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Checkout</h1>
          <p className="page-sub">Turn your selected medicines into a clinic pickup request.</p>
        </div>
      </div>

      {submitMutation.isError ? (
        <div className="alert-critical"><span>{submitMutation.error.response?.data?.message || 'Unable to send pickup request.'}</span></div>
      ) : null}

      {!cart.length ? (
        <div className="card">
          <p className="text-sm text-gray-500">Your cart is empty.</p>
          <Link to="/my/pharmacy" className="btn-primary mt-4 inline-flex">Back to pharmacy</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {cart.map((item) => (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{item.item_name}</p>
                    <p className="mt-1 text-sm text-gray-500">{item.dosage || item.unit || 'Clinic stock'}</p>
                  </div>
                  <button type="button" className="btn-ghost text-red-600" onClick={() => removeFromCart(item.id)}>Remove</button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => updateQuantity(item.id, (item.quantity || 1) - 1)}>-</button>
                  <span className="badge badge-gray">Qty {item.quantity || 1}</span>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => updateQuantity(item.id, (item.quantity || 1) + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="section-title">Pickup summary</h3>
              <p className="mt-3 text-sm text-gray-600">{totalUnits} medicine item(s) ready to send to the clinic support team.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="badge badge-info">MWOS support thread</span>
                <span className="badge badge-gray">Pickup workflow</span>
              </div>
            </div>

            <div className="card">
              <label className="label">Pickup notes</label>
              <textarea
                className="input min-h-[140px] resize-y"
                value={pickupNotes}
                onChange={(event) => setPickupNotes(event.target.value)}
                placeholder="Preferred pickup time, questions, or instructions"
              />
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  className="btn-primary justify-center"
                  disabled={submitMutation.isPending || !patient}
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending ? 'Sending request...' : 'Send pickup request'}
                </button>
                <Link to="/my/pharmacy" className="btn-secondary justify-center">Back to pharmacy</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
