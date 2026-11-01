import React, { useState } from 'react'
import { Link } from 'react-router-dom'
export const localDate = () => new Date().toLocaleDateString('en-CA')
export const dateValue = value => value ? String(value).slice(0,10) : ''
export const messageFor = error => error?.response?.data?.message || error?.message || 'Unable to complete this action.'
export function QueryState({ query, children }) {
 if(query.isPending) return <p className="card" role="status">Loading records…</p>
 if(query.isError) return <div className="card" role="alert"><p>{messageFor(query.error)}</p><button type="button" className="btn-secondary mt-3" onClick={()=>query.refetch()}>Try again</button></div>
 return children
}
export function WorkflowError({ error }) {
 if(!error) return null
 return <div role="alert" className="alert-critical mb-4"><div><p>{messageFor(error)}</p>{['STEP_UP_REQUIRED','STEP_UP_PURPOSE_MISMATCH','PROFESSIONAL_CREDENTIAL_REQUIRED'].includes(error.response?.data?.code) && <Link className="underline" to="/settings">Open account verification</Link>}</div></div>
}
export function WorkflowForm({ title, fields, initial={}, onSave, pending, error, submitLabel='Save record', onCancel }) {
 const [form,setForm]=useState(initial)
 return <form className="card space-y-4" onSubmit={e=>{e.preventDefault();onSave(form)}}>
  <h2 className="section-title">{title}</h2><WorkflowError error={error}/>
  <div className="grid gap-4 md:grid-cols-2">{fields.map(field=>{
   const [name,label,type='text',options]=field
   const common={id:`${title}-${name}`,name,value:form[name]??'',onChange:e=>setForm({...form,[name]:e.target.type==='checkbox'?e.target.checked:e.target.value}),className:'input',required:field.required===true,disabled:pending}
   return <div key={name} className={type==='textarea'?'md:col-span-2':''}><label className="label" htmlFor={common.id}>{label}{field.required?' *':''}</label>{type==='select'?<select {...common}><option value="">Select…</option>{(options||[]).map(option=>{const [value,text]=Array.isArray(option)?option:[option,option];return <option key={value} value={value}>{text}</option>})}</select>:type==='textarea'?<textarea {...common} rows={3} maxLength={5000}/>:type==='checkbox'?<input {...common} type="checkbox" checked={!!form[name]} value={undefined}/>:<input {...common} type={type} step={type==='number'?'any':undefined} min={field.min} max={field.max} autoComplete={type==='password'?'new-password':undefined} maxLength={type==='text'?300:undefined}/>}</div>
  })}</div>
  <div className="flex flex-wrap gap-3"><button type="submit" className="btn-primary" disabled={pending}>{pending?'Saving…':submitLabel}</button>{onCancel&&<button type="button" className="btn-secondary" disabled={pending} onClick={onCancel}>Cancel</button>}</div>
 </form>
}
export const required = field => Object.assign(field,{required:true})
export function RecordHistory({ rows=[], fields, actions }) {
 if(!rows.length) return <p className="card text-sm text-slate-500">No records yet.</p>
 return <div className="space-y-3">{rows.map(row=><article key={row.id} className="card"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([name,label])=><div key={name}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{row[name]===null||row[name]===undefined||row[name]===''?'Not recorded':String(row[name])}</dd></div>)}</dl>{row.recorded_by_name&&<p className="mt-3 text-xs text-slate-500">Recorded by {row.recorded_by_name} ({row.entry_role})</p>}{actions&&<div className="mt-4 flex flex-wrap gap-2">{actions(row)}</div>}</article>)}</div>
}
