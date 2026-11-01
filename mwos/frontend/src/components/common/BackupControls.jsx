import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import { WorkflowError, QueryState } from './WorkflowForm'
export default function BackupControls() {
 const role=useAuthStore(s=>s.user?.role),qc=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState(null),[done,setDone]=useState('')
 const status=useQuery({queryKey:['backup-status'],queryFn:()=>api.get('/admin/backup-status').then(r=>r.data.data),enabled:role==='admin'})
 async function download(kind){setBusy(true);setError(null);setDone('');try{const r=await api.post(kind==='full'?'/admin/backup':'/admin/clinic-export',{}, {responseType:'blob'});const a=document.createElement('a'),url=URL.createObjectURL(r.data);a.href=url;a.download=`MWOS-${kind==='full'?'database.dump':'clinic-data.json'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDone(kind==='full'?'Database backup downloaded.':'Clinic data downloaded. Keep the file in secure clinic storage.');qc.invalidateQueries({queryKey:['dashboard']})}catch(e){if(e.response?.data instanceof Blob){try{e.response.data=JSON.parse(await e.response.data.text())}catch{}}setError(e)}finally{setBusy(false)}}
 if(role!=='admin')return null
 return <div className="mt-4 space-y-3"><QueryState query={status}><p className="text-sm text-slate-500">{status.data?.message}</p><p className="text-xs text-slate-500">Clinic data export excludes passwords, identity document numbers, and uploaded files. It is not a complete recovery backup.</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={()=>download('clinic')}>{busy?'Preparing download…':'Download clinic data'}</button>{status.data?.fullBackupAvailable&&<button className="btn-secondary" disabled={busy} onClick={()=>download('full')}>Download database backup</button>}</div></QueryState><WorkflowError error={error}/>{done&&<p role="status" className="text-sm">{done}</p>}</div>
}
