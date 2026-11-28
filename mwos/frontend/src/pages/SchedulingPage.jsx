import React,{useState} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {useAuthStore} from '../store/authStore'
import api from '../utils/api'
import {WorkflowForm,WorkflowError,QueryState,required} from '../components/common/WorkflowForm'
import {awaitingConsultationPayment,consultationHasFutureSlot,getConsultationBillId,isOnlineConsultationBill} from '../utils/consultationBilling'

const dateKey=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})
const labels={scheduled:'Pending approval',awaiting_payment:'Approved · awaiting payment',payment_review:'Payment under verification',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',declined:'Declined',rescheduled:'Alternative schedule proposed'}
const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n)||0)

function ConsultationRequest({ request, patient, manager, begin, perform, pending }) {
 const a = request
 const expiredPaymentSlot = awaitingConsultationPayment(a) && !consultationHasFutureSlot(a)
 const telehealthPath = patient ? '/my/telehealth' : '/telehealth'
 return <article className="space-y-2 rounded-2xl border p-4">
  <div className="flex flex-wrap justify-between gap-3">
   <div>
    <h3 className="font-semibold">{patient ? a.provider_name : a.patient_name}</h3>
    <p className="text-sm">{dateKey(a.scheduled_date)} · {String(a.scheduled_time).slice(0,5)} PHT · {a.consultation_mode === 'online' ? 'Online' : 'In person'} · {money(a.consultation_fee)}</p>
   </div>
   <strong className="text-sm text-rose-800 dark:text-rose-200">{labels[a.status] || a.status}</strong>
  </div>
  {expiredPaymentSlot && <p className="text-sm">The scheduled consultation time has passed. Contact the clinic to reconcile the bill or arrange a new schedule.</p>}
  <p className="whitespace-pre-wrap text-sm">{a.notes}</p>
  {a.review_note && <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">Clinic note: {a.review_note}</p>}
  {a.payments?.map(payment => <p key={payment.id} className="text-xs text-slate-600 dark:text-slate-300">Payment {payment.status} · {payment.payment_method} · {payment.reference} · {money(payment.amount)}{payment.review_note ? ' · ' + payment.review_note : ''}</p>)}
  <div className="flex flex-wrap gap-2">
   {manager && a.status === 'scheduled' && <button type="button" className="btn-primary" onClick={() => begin('review',a)}>Review request</button>}
   {patient && a.status === 'awaiting_payment' && !expiredPaymentSlot && <button type="button" className="btn-primary" onClick={() => begin('payment',a)}>Submit payment reference</button>}
   {manager && a.status === 'payment_review' && <button type="button" className="btn-primary" onClick={() => begin('verify',a)}>Verify payment</button>}
   {manager && a.status === 'confirmed' && <button type="button" disabled={pending} className="btn-secondary" onClick={() => perform(`/scheduling/requests/${a.id}/complete`,{})}>Mark completed</button>}
   {['scheduled','awaiting_payment','payment_review','confirmed'].includes(a.status) && !a.teleconsult_id && <button type="button" disabled={pending} className="btn-secondary" onClick={() => perform(`/scheduling/requests/${a.id}/cancel`,{})}>Cancel request</button>}
   {a.teleconsult_id && <Link className="btn-primary" to={telehealthPath}>Open consultation in MWOS</Link>}
  </div>
 </article>
}

export default function SchedulingPage(){
 const user=useAuthStore(s=>s.user),patient=user.role==='patient',manager=['admin','doctor'].includes(user.role),qc=useQueryClient()
 const [search] = useSearchParams()
 const billId = getConsultationBillId(search)
 const [day,setDay]=useState(dateKey(new Date())),[view,setView]=useState('month'),[window,setWindow]=useState(null),[form,setForm]=useState(null),[notice,setNotice]=useState('')
 const base=new Date(day+'T12:00:00+08:00'),first=new Date(base),last=new Date(base)
 if(view==='month'){first.setDate(1);last.setMonth(last.getMonth()+1,0)}else if(view==='week'){first.setDate(first.getDate()-first.getDay());last.setDate(first.getDate()+6)}
 const from=dateKey(first),to=dateKey(last),days=[];for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1))days.push(dateKey(d))
 const availability=useQuery({queryKey:['schedule-windows',from,to],queryFn:()=>api.get('/scheduling/availability',{params:{from,to}}).then(r=>r.data.data),enabled:!billId})
 const providers=useQuery({queryKey:['schedule-providers'],queryFn:()=>api.get('/scheduling/providers').then(r=>r.data.data),enabled:!billId})
 const requests=useQuery({queryKey:['schedule-requests'],queryFn:()=>api.get('/scheduling/requests').then(r=>r.data.data),enabled:patient||manager})
 const slots=useQuery({queryKey:['schedule-slots',window?.id],queryFn:()=>api.get(`/scheduling/availability/${window.id}/slots`).then(r=>r.data.data),enabled:!!window})
 const save=useMutation({mutationFn:({path,body,method='post'})=>api[method](path,body),onSuccess:()=>{qc.invalidateQueries({queryKey:['schedule-windows']});qc.invalidateQueries({queryKey:['schedule-requests']});qc.invalidateQueries({queryKey:['schedule-slots']});qc.invalidateQueries({queryKey:['appointments']});setForm(null);setNotice('Saved. Availability and consultation status are up to date.')}})
 const begin=(kind,row)=>{save.reset();setNotice('');setForm({kind,row})}
 const perform=(path,body,method)=>save.mutate({path,body,method})
 let fields=[],initial={},title='',path=''
 if(form?.kind==='availability'){
  title='Add consultation availability';path='/scheduling/availability';initial={date:day,startTime:'09:00',endTime:'12:00',slotMinutes:30,maxAppointments:6,mode:'in_person',fee:0}
  fields=[...(user.role==='admin'?[required(['providerId','Reviewed doctor','select',(providers.data||[]).map(p=>[p.id,p.name])])]:[]),required(['date','Consultation date','date']),required(['startTime','Starts at (Philippine time)','time']),required(['endTime','Ends at (Philippine time)','time']),required(['slotMinutes','Minutes per consultation','select',[15,30,45,60]]),required(['maxAppointments','Maximum bookings','number']),required(['mode','Consultation type','select',[['online','Online in MWOS'],['in_person','In-person visit']]]),required(['fee','Consultation fee (PHP)','number'])]
 }else if(form?.kind==='book'){
  title='Request this consultation';path='/scheduling/requests';initial={availabilityId:window.id,time:form.row.time};fields=[required(['reason','Reason / information for your clinician','textarea'])]
 }else if(form?.kind==='review'){
  title='Review consultation request';path=`/scheduling/requests/${form.row.id}/review`;fields=[required(['action','Decision','select',[['approve','Approve'],['decline','Decline'],['reschedule','Propose another schedule']]]),['note','Reason or proposed alternative date and time','textarea']]
 }else if(form?.kind==='payment'){
  title='Submit a payment reference';path=`/scheduling/requests/${form.row.id}/payment`;fields=[required(['method','Payment method','select',['cash','bank_transfer','gcash','card','other']]),required(['reference','Receipt / transaction reference'])]
 }else if(form?.kind==='verify'){
  title='Verify payment against clinic records';path=`/scheduling/requests/${form.row.id}/verify-payment`;fields=[required(['action','Decision','select',[['verify','Verified against actual records'],['reject','Reject / needs correction']]]),['confirmedAgainstRecords','I checked the actual receipt or payment provider record','checkbox'],required(['note','Verification evidence / reason','textarea'])]
 }
 const feedback = <>
  {notice && <p role="status" className="card text-emerald-700">{notice}</p>}
  {form ? <WorkflowForm key={form.kind+(form.row?.id||form.row?.time||'')} title={title} fields={fields} initial={initial} onSave={body=>perform(path,body)} pending={save.isPending} error={save.error} onCancel={()=>setForm(null)} submitLabel="Submit"/> : <WorkflowError error={save.error}/>}
 </>

 if (billId) {
  const bill = (requests.data ?? []).find(request => request.id === billId && isOnlineConsultationBill(request))
  const telehealthPath = patient ? '/my/telehealth' : '/telehealth'
  return <div className="mx-auto max-w-3xl space-y-4">
   <header className="page-header">
    <div><h1 className="page-title">Consultation bill</h1><p className="page-sub">Check the consultation fee and the clinic’s payment review.</p></div>
    <Link to={telehealthPath} className="btn-secondary">Back to Telehealth</Link>
   </header>
   {patient || manager ? <QueryState query={requests}>
    {bill ? <>
     {(!form?.row || form.row.id === bill.id) && feedback}
     <section className="card space-y-3" aria-label="Online consultation billing details">
      <p className="text-sm">Bill reference <span className="break-all font-mono">{bill.billing_id}</span></p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Contact the clinic for payment instructions. A submitted reference needs separate verification.</p>
      <ConsultationRequest request={bill} patient={patient} manager={manager} begin={begin} perform={perform} pending={save.isPending} />
     </section>
    </> : <p className="card" role="status">This consultation bill is unavailable for your account.</p>}
   </QueryState> : <p className="card" role="status">This consultation bill is unavailable for your account.</p>}
  </div>
 }

 return <div className="space-y-5"><header className="page-header"><div><h1 className="page-title">Consultation schedules</h1><p className="page-sub">Choose a reviewed doctor, request a time, and follow approval and payment progress.</p></div>{manager&&<button className="btn-primary" onClick={()=>begin('availability')}>Add availability</button>}</header>
  <nav className="flex flex-wrap gap-3"><Link className="btn-secondary" to={patient?'/my/appointments':'/appointments'}>Visit records</Link><Link className="btn-secondary" to={patient?'/my/telehealth':'/telehealth'}>Open Telehealth</Link></nav>
  <p className="text-sm text-slate-500">All schedules use Philippine time. Contact the clinic for payment instructions. Entering a reference does not confirm payment; authorized staff must verify it. For emergencies, seek immediate medical assistance.</p>
  {feedback}
  <section className="card space-y-4"><div className="flex flex-wrap items-end gap-3"><label className="text-sm">Date<input className="input mt-1" type="date" value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setWindow(null)}}}/></label><div className="flex gap-2">{['month','week','day'].map(v=><button key={v} className={view===v?'btn-primary':'btn-secondary'} aria-pressed={view===v} onClick={()=>setView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div></div>
   <p className="text-sm">{from} — {to} · Select a date to see its available times.</p>
   <QueryState query={availability}><div className={view==='day'?'grid gap-2':'grid grid-cols-2 gap-2 sm:grid-cols-7'}>{days.map(d=>{const windows=(availability.data||[]).filter(a=>dateKey(a.service_date)===d),bookings=(requests.data||[]).filter(a=>dateKey(a.scheduled_date)===d);return <button key={d} className={`min-h-24 rounded-xl border p-2 text-left text-sm ${day===d?'border-rose-500 bg-rose-50':'border-slate-200'}`} onClick={()=>{setDay(d);setWindow(null)}}><strong>{new Date(d+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',day:'numeric'})}</strong><span className="block text-xs text-slate-500">{windows.length?windows.filter(a=>a.status==='available'&&a.reserved<a.max_appointments).length+' open schedules':'No posted schedule'}</span>{bookings.length>0&&<span className="mt-1 block text-xs text-rose-700">{bookings.length} consultation(s)</span>}</button>})}</div></QueryState>
  </section>
  <section className="grid gap-4 lg:grid-cols-2"><div className="card space-y-3"><h2 className="section-title">Doctor availability · {day}</h2>{(availability.data||[]).filter(a=>dateKey(a.service_date)===day).map(a=><article key={a.id} className="rounded-xl border p-4"><h3 className="font-semibold">{a.provider_name}</h3><p className="text-sm">{String(a.starts_at).slice(0,5)}–{String(a.ends_at).slice(0,5)} · {a.slot_minutes} min · {a.consultation_mode==='online'?'Online':'In person'} · {money(a.fee)}</p><p className="my-2 text-xs">{a.status} · {a.reserved}/{a.max_appointments} reserved</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setWindow(a)}>View time slots</button>{manager&&(user.role==='admin'||a.provider_id===user.id)&&<button disabled={save.isPending||Number(a.reserved)>0} className="btn-secondary" onClick={()=>perform(`/scheduling/availability/${a.id}`,{status:a.status==='available'?'blocked':'available'},'patch')}>{a.status==='available'?'Block schedule':'Reopen schedule'}</button>}</div></article>)}{!(availability.data||[]).some(a=>dateKey(a.service_date)===day)&&<p className="text-sm text-slate-500">No schedule has been posted for this date.</p>}</div>
  <div className="card space-y-3"><h2 className="section-title">{window?window.provider_name+' · time slots':'Select a doctor schedule'}</h2>{window&&<QueryState query={slots}><div className="flex flex-wrap gap-2">{(slots.data||[]).map(s=><button key={s.time} className="btn-secondary" disabled={!s.available||!patient||save.isPending} onClick={()=>begin('book',s)}>{s.time}{s.available?'':' · unavailable'}</button>)}</div>{!patient&&<p className="text-sm text-slate-500">Patients submit requests from their own account.</p>}</QueryState>}</div></section>
  {(patient||manager)&&<section className="card space-y-4"><h2 className="section-title">Consultation requests</h2><QueryState query={requests}>{!(requests.data||[]).length&&<p>No consultation requests yet.</p>}{(requests.data||[]).map(request=><ConsultationRequest key={request.id} request={request} patient={patient} manager={manager} begin={begin} perform={perform} pending={save.isPending} />)}</QueryState></section>}
 </div>
}
