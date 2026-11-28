import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import { QueryState, WorkflowForm, required } from './WorkflowForm'

const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded'
const categoryOf = item => item.category?.trim().toLowerCase() || 'uncategorized'

const categoryLabels = {
  medication: 'Medicine',
  medical_supply: 'Medical supplies',
  equipment: 'Equipment',
  uncategorized: 'Uncategorized',
}

const categoryLabel = category => Object.hasOwn(categoryLabels, category)
  ? categoryLabels[category]
  : category.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())

const stockLevels = {
  in_stock: { label: 'In stock', badge: 'badge-success' },
  low: { label: 'Low stock', badge: 'badge-warning' },
  out_of_stock: { label: 'Out of stock', badge: 'badge-danger' },
  unknown: { label: 'Not recorded', badge: 'badge-gray' },
}

function stockLevelOf(item) {
  if (item.quantity == null) return 'unknown'
  const quantity = Number(item.quantity)
  if (quantity <= 0) return 'out_of_stock'
  return item.reorder_level != null && quantity <= Number(item.reorder_level) ? 'low' : 'in_stock'
}

export default function StockMovements() {
  const user = useAuthStore(state => state.user)
  const canAdjust = ['admin', 'nurse'].includes(user?.role)
  const queryClient = useQueryClient()
  const [itemId, setItemId] = useState('')
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [stock, setStock] = useState('')
  const [notice, setNotice] = useState('')
  const inventory = useQuery({ queryKey: ['inventory-stock'], queryFn: () => api.get('/inventory').then(response => response.data.data) })
  const history = useQuery({ queryKey: ['stock-history', itemId], queryFn: () => api.get(`/inventory/${itemId}/history`).then(response => response.data.data), enabled: Boolean(itemId) })
  const save = useMutation({
    mutationFn: ({ id, data }) => api.post(`/inventory/${id}/stock`, data),
    onSuccess: (_response, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock-history', id] })
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
      setEditing(false)
      setNotice('Stock movement saved. The balance and history have been updated.')
    },
  })
  const items = inventory.data || []
  const selected = items.find(item => item.id === itemId)
  const categories = [...new Set(items.map(categoryOf))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)))
  const searchQuery = search.trim().toLowerCase()
  const filtered = items.filter(item => {
    const itemCategory = categoryOf(item)
    if (category && category !== itemCategory) return false
    if (stock && stock !== stockLevelOf(item)) return false
    const searchable = [item.item_name, categoryLabel(itemCategory), item.supplier, item.dosage, item.description].join(' ')
    return searchable.toLowerCase().includes(searchQuery)
  })
  const choose = id => { setItemId(id); setEditing(false); setNotice(''); save.reset() }
  return <section className="card space-y-4" aria-labelledby="stock-movements-title">
    <h2 id="stock-movements-title" className="section-title">Clinic product catalog</h2>
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <label className="block text-sm">
        Search items or suppliers
        <input className="input mt-1" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label className="block text-sm">
        Category
        <select className="input mt-1" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        Stock level
        <select className="input mt-1" value={stock} onChange={event => setStock(event.target.value)}>
          <option value="">All stock levels</option>
          {Object.entries(stockLevels).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <QueryState query={inventory}>
      <p role="status" className="text-sm text-slate-500">Showing {filtered.length} of {items.length} recorded products</p>
      {filtered.length ? (
        <div className="table-container">
          <table className="table" aria-label="Clinic products">
            <thead>
              <tr>{['Item', 'Category', 'Quantity', 'Reorder level', 'Stock level', 'Expiry', 'Supplier', 'Action'].map(label => <th key={label} scope="col">{label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const level = stockLevels[stockLevelOf(item)]
                return (
                  <tr key={item.id}>
                    <td className="font-medium">{item.item_name}</td>
                    <td>{categoryLabel(categoryOf(item))}</td>
                    <td>{item.quantity == null ? 'Not recorded' : `${item.quantity} ${item.unit || ''}`.trim()}</td>
                    <td>{item.reorder_level ?? 'Not recorded'}</td>
                    <td><span className={`badge ${level.badge}`}>{level.label}</span></td>
                    <td>{dateLabel(item.expiry_date)}</td>
                    <td>{item.supplier || 'Not recorded'}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => choose(item.id)} aria-label={`View movements for ${item.item_name}`}>
                        View movements
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-3 text-sm">{items.length ? 'No inventory items match these filters.' : 'No clinic products have been recorded.'}</p>
      )}
    </QueryState>
    {selected && <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{selected.item_name}</h3><p className="text-sm">Current balance: {selected.quantity} {selected.unit}</p></div>{canAdjust && <button className="btn-primary" type="button" onClick={() => { save.reset(); setEditing(true) }}>Record stock in / out</button>}</div>
      {editing && <WorkflowForm title="Record stock movement" fields={[required(['delta', 'Quantity change: positive for stock in, negative for stock out', 'number']), required(['note', 'Reason / delivery or issue reference', 'textarea'])]} onSave={data => save.mutate({ id: selected.id, data })} pending={save.isPending} error={save.error} onCancel={() => setEditing(false)} />}
      <QueryState query={history}><div className="table-container"><table className="table"><thead><tr>{['Recorded', 'Before', 'Change', 'After', 'Reason', 'Recorded by'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{(history.data || []).map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td><td>{row.quantity_before}</td><td>{row.delta > 0 ? '+' : ''}{row.delta}</td><td>{row.quantity_after}</td><td className="whitespace-pre-wrap">{row.reason}</td><td>{row.recorded_by_name || 'System record'}</td></tr>)}</tbody></table>{!history.data?.length && <p className="p-4 text-sm text-slate-500">No movements have been recorded since stock history was enabled. Historical stock changes are not reconstructed.</p>}</div></QueryState>
    </div>}
  </section>
}
