import React, {useState} from 'react'
import {Link} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import api from '../../utils/api'
const key=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})
export default function AppointmentOverview({patient=false}) {
 const [day,setDay]=useState(key(new Date())),[month,setMonth]=useState(day.slice(0,7))
 const start=month+'-01',end=key(new Date(Number(month.slice(0,4)),Number(month.slice(5)),0,12))
 const q=useQuery({queryKey:['dashboard-calendar',patient,month],queryFn:()=>api.get('/appointments',{params:{from:start,to:end,limit:200}}).then(r=>r.data)})
 const tips=useQuery({queryKey:['dashboard-health-tips'],queryFn:()=>api.get('/education').then(r=>r.data.data)})
 const selected=(q.data?.data||[]).filter(a=>key(a.scheduled_date)===day)
 const n=Number(end.slice(-2)),offset=new Date(start+'T12:00:00').getDay()
 const base=patient?'/my':''
 return <section className="card space-y-4" aria-label="Appointment calendar and quick actions">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Your clinic calendar</h2><label className="text-sm">Month<input className="input" type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setDay(e.target.value+'-01')}}}/></label></div>
  <div className="flex flex-wrap gap-2"><Link className="btn-primary" to={base+'/scheduling'}>{patient?'Book appointment':'Doctor availability & approvals'}</Link><Link className="btn-secondary" to={base+'/appointments'}>Upcoming appointments</Link><Link className="btn-secondary" to={base+'/telehealth'}>Consultation history</Link><Link className="btn-secondary" to={patient?'/my/health-tips':'/health-education'}>Health tips</Link>{!patient&&<Link className="btn-secondary" to="/patients">Patient records</Link>}</div>
  {q.isLoading?<p>Loading appointments…</p>:q.isError?<p role="alert">The calendar could not be loaded. <button onClick={()=>q.refetch()}>Try again</button></p>:<div className="grid gap-5 lg:grid-cols-2">
   <div className="grid grid-cols-7 gap-1">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d} className="text-center text-xs text-slate-500">{d}</span>)}{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:n},(_,i)=>{const d=month+'-'+String(i+1).padStart(2,'0'),total=(q.data?.data||[]).filter(a=>key(a.scheduled_date)===d).length;return <button key={d} aria-label={d+', '+total+' appointments'} aria-pressed={day===d} onClick={()=>setDay(d)} className={`min-h-12 rounded-lg border text-sm ${day===d?'border-rose-600 bg-rose-50':'border-slate-100'}`}><span>{i+1}</span>{total>0&&<span className="block text-[10px] text-rose-800">{total} visits</span>}</button>})}</div>
   <div className="space-y-2"><h3 className="font-semibold">{day}</h3>{selected.length?selected.map(a=><Link key={a.id} to={base+'/appointments'} className="block rounded-xl border p-3 text-sm"><strong>{String(a.scheduled_time).slice(0,5)} · {a.appointment_type}</strong><p>{patient?a.assigned_to_name:a.patient_name}</p><p>{a.availability_id&&a.status==='scheduled'?'Pending approval':a.status.replaceAll('_',' ')} · {a.consultation_mode==='online'?'Online':'Clinic visit'}</p></Link>):<p className="text-sm text-slate-500">No appointment recorded for this day. Open doctor availability to request a time.</p>}{q.data?.pagination?.total>200&&<p className="text-sm">First 200 appointments shown. Open Appointments for the complete list.</p>}</div>
  </div>}
  <div className="border-t pt-4"><h3 className="font-semibold">From Health Tips</h3>{tips.isError?<p>Health tips could not be loaded.</p>:(tips.data||[]).slice(0,2).map(t=><Link key={t.id} to={patient?'/my/health-tips':'/health-education'} className="mt-2 block text-sm text-rose-800 underline">{t.title}</Link>)}<p className="mt-2 text-xs text-slate-500">General education supports your visit. Individual care decisions belong to your healthcare professional.</p></div>
 </section>
}
