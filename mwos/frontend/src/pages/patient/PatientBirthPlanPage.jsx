import React,{useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import api from '../../utils/api'
import {WorkflowForm,QueryState,RecordHistory,required} from '../../components/common/WorkflowForm'

const get=url=>api.get(url).then(response=>response.data.data)
export default function PatientBirthPlanPage(){
 const qc=useQueryClient(),[show,setShow]=useState(false)
 const patient=useQuery({queryKey:['patient-me-birth-plan'],queryFn:()=>get('/patients/me')})
 const plans=useQuery({queryKey:['my-birth-plans'],queryFn:()=>get('/birth-plans/me')})
 const save=useMutation({mutationFn:form=>api.post('/birth-plans/me',form),onSuccess:()=>{qc.invalidateQueries({queryKey:['my-birth-plans']});setShow(false)}})
 const active=(patient.data?.pregnancies||[]).filter(item=>item.status==='active')
 const fields=[required(['pregnancyId','Pregnancy','select',active.map(item=>[item.id,`EDD ${String(item.edd).slice(0,10)}`])]),required(['planningStatus','Save as','select',[['draft','Draft'],['submitted','Submit to clinic for review']]]),required(['preferredBirthPlace','Preferred birth place','select',[['clinic','TMC Copino clinic'],['hospital','Hospital'],['undecided','Undecided'],['other','Other / discuss with clinic']]]),['supportPersonName','Preferred support person'],['supportPersonContact','Support person contact'],['transportPlan','Transport and contact plan','textarea'],['emergencyContactConfirmed','Emergency contact confirmed','checkbox'],['comfortPreferences','Comfort and communication preferences','textarea'],['newbornCarePreferences','Newborn-care questions or preferences','textarea'],['questionsForClinic','Questions for the clinic','textarea']]
 return <div className="space-y-6"><div className="page-header"><div><h1 className="page-title">My birth plan</h1><p className="page-sub">Share preferences and questions with the clinic. The care team reviews the plan; it is not a clinical order or a guarantee of service availability.</p></div></div><QueryState query={patient}>{active.length?<button className="btn-primary" onClick={()=>{save.reset();setShow(true)}}>Create or update my plan</button>:<p className="card text-sm text-slate-500">No active pregnancy record is available for a birth plan. Please contact the clinic if this needs updating.</p>}</QueryState>{show&&<WorkflowForm title="My birth-plan preferences" fields={fields} initial={{pregnancyId:active[0]?.id||'',planningStatus:'draft',preferredBirthPlace:'clinic',emergencyContactConfirmed:false}} onSave={save.mutate} pending={save.isPending} error={save.error} submitLabel="Save birth plan" onCancel={()=>setShow(false)}/>}<QueryState query={plans}><RecordHistory rows={plans.data} fields={['planning_status','preferred_birth_place','support_person_name','transport_plan','clinician_review','reviewed_by_name','updated_at'].map(key=>[key,key.replaceAll('_',' ')])}/></QueryState></div>
}
