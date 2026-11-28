import React,{useEffect,useRef,useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {Link} from 'react-router-dom'
import api from '../utils/api'
import {useAuthStore} from '../store/authStore'
import PatientSearchSelect from '../components/common/PatientSearchSelect'
import {WorkflowForm,WorkflowError,QueryState,required} from '../components/common/WorkflowForm'
const stages=['initial_assessment','consultation','laboratory','treatment_review','billing','follow_up','prenatal_monitoring','birth_planning','labor_monitoring','delivery','postnatal_monitoring','newborn_monitoring','completed','cancelled']

function PatientCheckInRecord({ record, pending, onCheckIn }) {
 const archived = record.is_active === false
 return <div>
  <strong>{record.first_name} {record.last_name}</strong>
  <p>{record.patient_code}</p>
  {archived && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Archived patient record. An authorized staff member can restore it before check-in so the next visit uses the same clinic history.</p>}
  <div className="mt-2 flex flex-wrap gap-2">
   <Link className="btn-secondary" to={`/patients/${record.id}`}>Open record</Link>
   {archived ? <Link className="btn-secondary" to="/patients?status=archived" state={{ patientSearch: record.patient_code || record.last_name }}>Find in patient archive</Link> : null}
   <button type="button" className="btn-primary" disabled={pending || !record.is_active} onClick={onCheckIn}>Check in</button>
  </div>
 </div>
}

export default function PatientFlowPage(){
 const patient=useAuthStore(s=>s.user?.role==='patient')
 const qc=useQueryClient(),[selected,setSelected]=useState(null),[camera,setCamera]=useState(false),[cameraError,setCameraError]=useState(''),[code,setCode]=useState(''),video=useRef(null)
 const [searchedPatient, setSearchedPatient] = useState(null)
 const visits=useQuery({queryKey:['patient-flow'],queryFn:()=>api.get('/patient-flow').then(r=>r.data.data),refetchInterval:30000})
 const lookup=useMutation({mutationFn:value=>api.post('/patient-qr/lookup',{code:value}).then(r=>r.data.data)})
 const checkInRecord = searchedPatient || lookup.data
 const findFromQr = (value) => {
  setSearchedPatient(null)
  setCamera(false)
  lookup.mutate(value)
 }
 const selectSearchResult = (id, record) => {
  setSearchedPatient(id ? record : null)
  if (id) {
   lookup.reset()
   setCamera(false)
  }
 }
 const save = useMutation({
  mutationFn: (form) => form.checkIn
   ? api.post('/patient-flow', { patientId: form.patientId, note: form.note })
   : api.patch(`/patient-flow/${selected.id}`, { ...form, previousStage: selected.stage }),
  onSuccess: (_result, form) => {
   qc.invalidateQueries({ queryKey: ['patient-flow'] })
   qc.invalidateQueries({ queryKey: ['labor-ward'] })
   setSelected(null)
   if (form.checkIn) {
    lookup.reset()
    setSearchedPatient(null)
   }
  },
 })
 const checkIn = () => {
  setSelected(null)
  save.mutate({
   checkIn: true,
   patientId: checkInRecord.id,
   note: searchedPatient ? 'Clinic check-in using patient search' : 'Clinic check-in using patient QR',
  })
 }
 useEffect(()=>{if(!camera)return;let live=true,stream,timer;async function scan(){try{if(!('BarcodeDetector'in window))throw Error('Camera QR scanning is unavailable in this browser. Use the manual scan code or a USB QR scanner.');const detector=new window.BarcodeDetector({formats:['qr_code']});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});if(!live){stream.getTracks().forEach(t=>t.stop());return}video.current.srcObject=stream;await video.current.play();async function frame(){if(!live)return;try{const results=await detector.detect(video.current);if(!live)return;if(results[0]){setCode(results[0].rawValue);findFromQr(results[0].rawValue);return}}catch{}timer=setTimeout(frame,350)}frame()}catch(e){if(live){setCameraError(e.message);setCamera(false)}}}scan();return()=>{live=false;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop())}},[camera])
 return <div className="space-y-5">
  <header><h1 className="page-title">Patient check-in & progress</h1><p className="page-sub">Identify the patient, record service stages, and review the visit history.</p></header>
  {!patient&&<section className="card space-y-3">
   <h2 className="section-title">Find a patient for check-in</h2>
   <PatientSearchSelect id="check-in-patient-search" value={searchedPatient?.id || ''} onChange={selectSearchResult} disabled={save.isPending} />
   <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
    <h3 className="font-semibold">Scan patient QR</h3>
    <div className="flex flex-wrap gap-2">
     <button type="button" className="btn-secondary" onClick={()=>{setCameraError('');setCamera(v=>!v)}}>{camera?'Stop camera':'Use camera'}</button>
     <Link className="btn-secondary" to="/patients">Open patient directory</Link>
    </div>
    {camera&&<video className="w-full max-w-md rounded-xl" ref={video} muted playsInline/>}
    {cameraError&&<p role="status">{cameraError}</p>}
    <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();findFromQr(code)}}>
     <label className="flex-1 min-w-48 text-sm">Patient QR / scanner text<input className="input" value={code} onChange={e=>setCode(e.target.value)} required/></label>
     <button className="btn-primary" disabled={lookup.isPending || save.isPending}>Find patient</button>
    </form>
    <WorkflowError error={lookup.error}/>
   </div>
   {checkInRecord && <PatientCheckInRecord record={checkInRecord} pending={save.isPending} onCheckIn={checkIn} />}
  </section>}
  <WorkflowError error={save.error}/>
  {selected&&<WorkflowForm title="Update visit progress" fields={[required(['stage','Next service stage','select',stages.map(s=>[s,s.replaceAll('_',' ')])]),required(['note','Progress note','textarea'])]} onSave={save.mutate} pending={save.isPending} error={save.error} onCancel={()=>setSelected(null)}/>}
  <QueryState query={visits}><div className="space-y-3">
   {visits.data?.map(v=><article key={v.id} className="card">
    <div className="flex flex-wrap justify-between gap-2">
     <div><h2 className="section-title">{v.patient_name}</h2><p>{v.stage.replaceAll('_',' ')} · {v.status}</p><p className="text-xs text-slate-500">Last updated {new Date(v.updated_at).toLocaleString('en-PH')}{v.status==='open'?` · ${Math.max(0,Math.floor(v.minutes_in_stage))} min in this stage`:''}</p></div>
     {!patient&&v.status==='open'&&<button className="btn-secondary" onClick={()=>{save.reset();setSelected(v)}}>Update stage</button>}
    </div>
    <details className="mt-3"><summary className="cursor-pointer">Visit history</summary>{v.events?.map(e=><p key={e.id} className="border-t py-2 text-sm">{new Date(e.created_at).toLocaleString('en-PH')} · {e.stage.replaceAll('_',' ')} · {e.note}</p>)}</details>
   </article>)}
   {!visits.data?.length&&<p className="card">No visits have been checked in.</p>}
  </div></QueryState>
 </div>
}
