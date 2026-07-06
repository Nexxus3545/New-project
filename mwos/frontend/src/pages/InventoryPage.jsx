import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

const EMPTY_FORM = {
  itemName: '',
  dosage: '',
  description: '',
  purpose: '',
  usageInstructions: '',
  usageSteps: '',
  precautions: '',
  sideEffects: '',
  requiresPrescription: false,
  quantity: '',
  unit: 'box',
  reorderLevel: 10,
  supplier: '',
  unitCost: '',
  availabilityStatus: 'available',
  notes: '',
  image: null,
}

const statusMeta = {
  available: 'badge-success',
  limited: 'badge-warning',
  out_of_stock: 'badge-danger',
}

const StatCard = ({ label, value, detail }) => (
  <div className="card">
    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    <p className="mt-2 text-sm text-slate-500">{detail}</p>
  </div>
)

const usagePreview = (item) => {
  if (item.usage_steps?.length) return item.usage_steps.slice(0, 2).join(' • ')
  return item.usage_instructions || item.purpose || item.description || 'Usage guidance not set yet.'
}

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  const { data: medicines = [], isLoading, error } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => api.get('/medicines').then((response) => response.data.data),
  })

  const filteredMedicines = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return medicines.filter((item) => {
      const matchesSearch = normalizedSearch
        ? `${item.item_name} ${item.dosage || ''} ${item.purpose || ''} ${item.description || ''} ${item.usage_instructions || ''}`.toLowerCase().includes(normalizedSearch)
        : true

      const matchesStatus = statusFilter === 'all' ? true : item.availability_status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [medicines, search, statusFilter])

  const stats = useMemo(() => ({
    total: medicines.length,
    lowStock: medicines.filter((item) => item.availability_status === 'limited').length,
    outOfStock: medicines.filter((item) => item.availability_status === 'out_of_stock').length,
    prescription: medicines.filter((item) => item.requires_prescription).length,
  }), [medicines])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'image') {
          if (value) formData.append(key, value)
          return
        }

        if (typeof value === 'boolean') {
          formData.append(key, String(value))
          return
        }

        formData.append(key, value ?? '')
      })

      if (editingItem) {
        return api.patch(`/medicines/${editingItem.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      }

      return api.post('/medicines', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
      setShowForm(false)
      setEditingItem(null)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (err) => setFormError(err.response?.data?.message || 'Unable to save medicine entry'),
  })

  const openCreate = () => {
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setForm({
      itemName: item.item_name || '',
      dosage: item.dosage || '',
      description: item.description || '',
      purpose: item.purpose || '',
      usageInstructions: item.usage_instructions || '',
      usageSteps: (item.usage_steps || []).join('\n'),
      precautions: item.precautions || '',
      sideEffects: item.side_effects || '',
      requiresPrescription: Boolean(item.requires_prescription),
      quantity: item.quantity ?? '',
      unit: item.unit || 'box',
      reorderLevel: item.reorder_level ?? 10,
      supplier: item.supplier || '',
      unitCost: item.unit_cost || '',
      availabilityStatus: item.availability_status || 'available',
      notes: item.notes || '',
      image: null,
    })
    setFormError('')
    setShowForm(true)
  }

  useEffect(() => {
    if (!showForm) {
      setPreviewUrl('')
      return undefined
    }

    if (form.image) {
      const objectUrl = URL.createObjectURL(form.image)
      setPreviewUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }

    setPreviewUrl(editingItem?.image_url || '')
    return undefined
  }, [editingItem?.image_url, form.image, showForm])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Medicine Management</h1>
          <p className="page-sub">Organize every medicine with an image, purpose, step-by-step usage, safety guidance, and live stock visibility.</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary">Add medicine</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total medicines" value={stats.total} detail="All medicine entries available to staff and patient pharmacy screens." />
        <StatCard label="Low stock" value={stats.lowStock} detail="Items that have reached the reorder threshold." />
        <StatCard label="Out of stock" value={stats.outOfStock} detail="Items that need urgent replenishment or substitution." />
        <StatCard label="Prescription" value={stats.prescription} detail="Medicines marked as requiring clinician approval." />
      </div>

      <div className="card">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <label className="label">Search medicines</label>
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, dosage, use case, or instructions"
            />
          </div>
          <div>
            <label className="label">Availability</label>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert-critical"><span>{error.response?.data?.message || 'Unable to load medicine inventory.'}</span></div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <div className="card xl:col-span-3">Loading medicines...</div>
        ) : filteredMedicines.length === 0 ? (
          <div className="card xl:col-span-3">No medicines matched the current filters.</div>
        ) : (
          filteredMedicines.map((item) => (
            <article key={item.id} className="card-hover overflow-hidden p-0">
              <div className="grid h-full grid-rows-[220px_1fr]">
                <div className="relative overflow-hidden bg-slate-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">No image uploaded</div>
                  )}
                  <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                    <span className={`badge ${statusMeta[item.availability_status] || 'badge-gray'}`}>{item.availability_status || 'available'}</span>
                    {item.requires_prescription ? <span className="badge badge-danger">Prescription</span> : <span className="badge badge-info">OTC ready</span>}
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{item.item_name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.dosage || item.unit || 'Dosage pending'}</p>
                    <p className="mt-3 text-sm text-slate-600">{item.purpose || item.description || 'No purpose or summary added yet.'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Usage guidance</p>
                    <p className="mt-2 text-sm text-slate-600">{usagePreview(item)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-500">
                    <div>Stock: <span className="font-medium text-slate-900">{item.quantity} {item.unit}</span></div>
                    <div>Reorder: <span className="font-medium text-slate-900">{item.reorder_level}</span></div>
                    <div>Supplier: <span className="font-medium text-slate-900">{item.supplier || '-'}</span></div>
                    <div>Unit cost: <span className="font-medium text-slate-900">{item.unit_cost ? `PHP ${Number(item.unit_cost).toLocaleString()}` : '-'}</span></div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => openEdit(item)} className="btn-secondary btn-sm">Edit medicine</button>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{editingItem ? 'Update medicine entry' : 'Add medicine entry'}</h2>
                <p className="text-sm text-slate-500">Keep medicine photos, clinical usage, and patient-facing guidance aligned in one place.</p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Close</button>
            </div>

            {formError ? <div className="alert-critical mx-6 mt-5 text-sm">{formError}</div> : null}

            <div className="grid gap-6 px-6 py-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                  <div className="aspect-[4/5] overflow-hidden">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Medicine preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">Upload a medicine image to preview it here.</div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
                  <label className="label">Medicine photo</label>
                  <input className="input" type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, image: event.target.files?.[0] || null }))} />
                  <p className="mt-2 text-xs text-slate-500">Use a clear front-facing image so patients can match the medicine and packaging correctly.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Medicine name</label>
                  <input className="input" value={form.itemName} onChange={(event) => setForm((current) => ({ ...current, itemName: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Dosage</label>
                  <input className="input" value={form.dosage} onChange={(event) => setForm((current) => ({ ...current, dosage: event.target.value }))} placeholder="500 mg tablet" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Purpose</label>
                  <input className="input" value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Supports iron intake during pregnancy" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input min-h-[96px]" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short patient-friendly overview of the medicine." />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Usage instructions</label>
                  <textarea className="input min-h-[96px]" value={form.usageInstructions} onChange={(event) => setForm((current) => ({ ...current, usageInstructions: event.target.value }))} placeholder="How and when the medicine should be taken." />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Step-by-step usage</label>
                  <textarea className="input min-h-[110px]" value={form.usageSteps} onChange={(event) => setForm((current) => ({ ...current, usageSteps: event.target.value }))} placeholder={'Enter one step per line\nTake after breakfast\nDrink a full glass of water\nFollow the prescribed frequency'} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Precautions</label>
                  <textarea className="input min-h-[96px]" value={form.precautions} onChange={(event) => setForm((current) => ({ ...current, precautions: event.target.value }))} placeholder="Warnings, contraindications, or reminders before use." />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Possible side effects</label>
                  <textarea className="input min-h-[96px]" value={form.sideEffects} onChange={(event) => setForm((current) => ({ ...current, sideEffects: event.target.value }))} placeholder="List common side effects patients should watch for." />
                </div>
                <div>
                  <label className="label">Quantity</label>
                  <input className="input" type="number" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input className="input" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Reorder level</label>
                  <input className="input" type="number" value={form.reorderLevel} onChange={(event) => setForm((current) => ({ ...current, reorderLevel: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Availability</label>
                  <select className="input" value={form.availabilityStatus} onChange={(event) => setForm((current) => ({ ...current, availabilityStatus: event.target.value }))}>
                    <option value="available">Available</option>
                    <option value="limited">Limited</option>
                    <option value="out_of_stock">Out of stock</option>
                  </select>
                </div>
                <div>
                  <label className="label">Supplier</label>
                  <input className="input" value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))} />
                </div>
                <div>
                  <label className="label">Unit cost</label>
                  <input className="input" type="number" step="0.01" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Internal notes</label>
                  <textarea className="input min-h-[80px]" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Storage notes, substitution plan, or purchase reminders." />
                </div>
                <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={form.requiresPrescription} onChange={(event) => setForm((current) => ({ ...current, requiresPrescription: event.target.checked }))} />
                  Requires clinician prescription or approval before release
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-5">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving medicine...' : editingItem ? 'Update medicine' : 'Create medicine'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
