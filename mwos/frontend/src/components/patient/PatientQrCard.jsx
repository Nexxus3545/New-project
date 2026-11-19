import React from 'react'
import {useQuery} from '@tanstack/react-query'
import api from '../../utils/api'
import {QueryState} from '../common/WorkflowForm'
export default function PatientQrCard(){
 const q=useQuery({queryKey:['patient-qr'],queryFn:()=>api.get('/patient-qr/mine').then(r=>r.data.data)})
 return <section className="card space-y-3"><h2 className="section-title">Your patient QR</h2><p className="text-sm text-slate-500">Show this at the clinic for identification and check-in. Staff must sign in to open your record.</p><QueryState query={q}>{q.data&&<><img className="w-56 max-w-full" src={q.data.image} alt="Patient identification QR code"/><p>{q.data.patientCode}</p><a className="btn-secondary inline-flex" href={q.data.image} download="MWOS-patient-QR.png">Download QR</a><details><summary className="cursor-pointer text-sm">Manual scan code</summary><code className="block break-all text-xs">{q.data.value}</code></details></>}</QueryState></section>
}
