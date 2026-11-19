import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import { QueryState, WorkflowForm, required } from './WorkflowForm'

const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded'

export default function StockMovements() {
  const user = useAuthStore(state => state.user)
  const canAdjust = ['admin', 'nurse'].includes(user?.role)
  const queryClient = useQueryClient()
  const [itemId, setItemId] = useState('')
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const inventory = useQuery({ queryKey: ['inventory-stock'], queryFn: () => api.get('/inventory').then(response => response.data.data) })
  const history = useQuery({ queryKey: ['stock-history', itemId], queryFn: () => api.get(`/inventory/${itemId}/history`).then(response => response.data.data), enabled: Boolean(itemId) })
  const save = useMutation({
    mutationFn: data => api.post(`/inventory/${itemId}/stock`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock-history', itemId] })
      queryClient.invalidateQueries({ queryKey: ['medicines'] })
      setEditing(false)
      setNotice('Stock movement saved. The balance and history have been updated.')
    },
  })
  const selected = inventory.data?.find(item => item.id === itemId)
  const filtered = (inventory.data || []).filter(item => `${item.item_name} ${item.category || ''} ${item.supplier || ''}`.toLowerCase().includes(search.toLowerCase()))
  const choose = id => { setItemId(id); setEditing(false); setNotice(''); save.reset() }
  return <section className="card space-y-4" aria-labelledby="stock-movements-title">
    <div><h2 id="stock-movements-title" className="section-title">Supplies & stock movements</h2><p className="text-sm text-slate-500">Review medicines and medical supplies, expiry dates, and recorded stock changes.</p></div>
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <label className="block text-sm">Search items or suppliers<input className="input mt-1" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <QueryState query={inventory}><div className="table-container"><table className="table"><thead><tr>{['Item', 'Category', 'Quantity', 'Reorder level', 'Expiry', 'Supplier', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td>{item.item_name}</td><td>{item.category || 'Not recorded'}</td><td><span className={Number(item.quantity) <= Number(item.reorder_level) ? 'font-semibold text-amber-800' : ''}>{item.quantity} {item.unit}</span></td><td>{item.reorder_level}</td><td>{dateLabel(item.expiry_date)}</td><td>{item.supplier || 'Not recorded'}</td><td><button type="button" className="btn-secondary btn-sm" onClick={() => choose(item.id)}>View movements</button></td></tr>)}</tbody></table>{!filtered.length && <p className="p-4 text-sm">No inventory matches this search.</p>}</div></QueryState>
    {selected && <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{selected.item_name}</h3><p className="text-sm">Current balance: {selected.quantity} {selected.unit}</p></div>{canAdjust && <button className="btn-primary" type="button" onClick={() => { save.reset(); setEditing(true) }}>Record stock in / out</button>}</div>
      {editing && <WorkflowForm title="Record stock movement" fields={[required(['delta', 'Quantity change: positive for stock in, negative for stock out', 'number']), required(['note', 'Reason / delivery or issue reference', 'textarea'])]} onSave={save.mutate} pending={save.isPending} error={save.error} onCancel={() => setEditing(false)} />}
      <QueryState query={history}><div className="table-container"><table className="table"><thead><tr>{['Recorded', 'Before', 'Change', 'After', 'Reason', 'Recorded by'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{(history.data || []).map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td><td>{row.quantity_before}</td><td>{row.delta > 0 ? '+' : ''}{row.delta}</td><td>{row.quantity_after}</td><td className="whitespace-pre-wrap">{row.reason}</td><td>{row.recorded_by_name || 'System record'}</td></tr>)}</tbody></table>{!history.data?.length && <p className="p-4 text-sm text-slate-500">No movements have been recorded since stock history was enabled. Historical stock changes are not reconstructed.</p>}</div></QueryState>
    </div>}
  </section>
}
