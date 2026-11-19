const {query,getClient}=require('../config/database');
const v=require('../utils/workflowValidation');
const QRCode=require('qrcode');
const {manilaDateKey}=require('../middleware/professionalCredential');
const stages=['checked_in','initial_assessment','consultation','laboratory','treatment_review','billing','follow_up','prenatal_monitoring','birth_planning','labor_monitoring','delivery','postnatal_monitoring','newborn_monitoring','completed','cancelled'];
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){next(e)}};
const qr=wrap(async(req,res)=>{
 const p=(await query('SELECT qr_token,patient_code FROM patients WHERE user_id=$1',[req.user.id])).rows[0];if(!p)v.fail('Patient profile not found.',404);
 const value='urn:mwos:patient:'+p.qr_token;
 res.set('Cache-Control','no-store');res.json({success:true,data:{value,patientCode:p.patient_code,image:await QRCode.toDataURL(value,{width:320,margin:2})}});
});
const lookup=wrap(async(req,res)=>{
 const raw=v.text(req.body.code,'Patient QR code',100,true),token=raw.replace(/^urn:mwos:patient:/,'');v.uuid(token,'Patient QR code');
 const p=(await query('SELECT id,patient_code,first_name,last_name,is_active FROM patients WHERE qr_token=$1',[token])).rows[0];if(!p)v.fail('Patient QR code not recognized.',404);
 res.set('Cache-Control','no-store');res.json({success:true,data:p});
});
const listVisits=wrap(async(req,res)=>{
 const values=[],where=[];if(req.user.role==='patient'){values.push(req.user.id);where.push('p.user_id=$1')}else if(req.query.patientId){values.push(v.uuid(req.query.patientId));where.push('p.id=$1')}
 res.json({success:true,data:(await query(`SELECT v.*,p.patient_code,p.first_name||' '||p.last_name AS patient_name,
 EXTRACT(EPOCH FROM (NOW()-v.updated_at))/60 AS minutes_in_stage,
 (SELECT json_agg(e ORDER BY e.created_at) FROM patient_visit_events e WHERE e.visit_id=v.id)AS events
 FROM patient_visits v JOIN patients p ON p.id=v.patient_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY v.created_at DESC LIMIT 200`,values)).rows});
});
const startVisit=wrap(async(req,res)=>{
 const patientId=v.uuid(req.body.patientId),client=await getClient();try{await client.query('BEGIN');await client.query('SELECT id FROM patients WHERE id=$1 FOR UPDATE',[patientId]);
 const p=(await client.query('SELECT is_active FROM patients WHERE id=$1',[patientId])).rows[0];if(!p||!p.is_active)v.fail('Choose an active patient.',400);
 const existing=(await client.query("SELECT id FROM patient_visits WHERE patient_id=$1 AND status='open'",[patientId])).rows[0];if(existing)v.fail('This patient already has an open visit.',409);
 if(req.body.appointmentId){const a=(await client.query("SELECT id FROM appointments WHERE id=$1 AND patient_id=$2 AND status='confirmed'",[v.uuid(req.body.appointmentId),patientId])).rows[0];if(!a)v.fail('Choose a confirmed appointment for this patient.')}
 const row=(await client.query('INSERT INTO patient_visits(patient_id,appointment_id,created_by)VALUES($1,$2,$3)RETURNING *',[patientId,req.body.appointmentId||null,req.user.id])).rows[0];
 await client.query("INSERT INTO patient_visit_events(visit_id,stage,note,recorded_by)VALUES($1,'checked_in',$2,$3)",[row.id,v.text(req.body.note,'Check-in note',1000),req.user.id]);await client.query('COMMIT');res.status(201).json({success:true,data:row});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
const advance=wrap(async(req,res)=>{
 const id=v.uuid(req.params.id),stage=v.choice(req.body.stage,'Service stage',stages),client=await getClient();try{await client.query('BEGIN');const visit=(await client.query('SELECT * FROM patient_visits WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!visit)v.fail('Visit not found.',404);if(visit.status!=='open')v.fail('This visit is closed.',409);if(req.body.previousStage!==visit.stage)v.fail('Another staff member updated this visit. Refresh before continuing.',409);if(stage===visit.stage)v.fail('Choose the next service stage.');
 await client.query('UPDATE patient_visits SET stage=$1,status=$2,updated_at=NOW()WHERE id=$3',[stage,['completed','cancelled'].includes(stage)?stage:'open',id]);await client.query('INSERT INTO patient_visit_events(visit_id,stage,note,recorded_by)VALUES($1,$2,$3,$4)',[id,stage,v.text(req.body.note,'Progress note',2000,true),req.user.id]);await client.query('COMMIT');res.json({success:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
const stock=wrap(async(req,res)=>{const id=v.uuid(req.params.id),delta=v.number(req.body.delta,'Stock change',-100000,100000,true,true),note=v.text(req.body.note,'Stock movement reason',1000,true);if(delta===0)v.fail('Enter a non-zero quantity change.');const r=await query('UPDATE inventory SET quantity=quantity+$1,notes=$2,updated_by=$3,updated_at=NOW(),availability_status=CASE WHEN quantity+$1=0 THEN \'out_of_stock\' WHEN quantity+$1<=reorder_level THEN \'limited\' ELSE \'available\' END WHERE id=$4 AND quantity+$1>=0 RETURNING *',[delta,note,req.user.id,id]);if(!r.rows.length)v.fail('Item not found or insufficient stock.',409);res.json({success:true,data:r.rows[0]})});
const stockHistory=wrap(async(req,res)=>{res.json({success:true,data:(await query('SELECT t.*,u.first_name||\' \'||u.last_name AS recorded_by_name FROM inventory_transactions t LEFT JOIN users u ON u.id=t.recorded_by WHERE inventory_id=$1 ORDER BY t.created_at DESC LIMIT 200',[v.uuid(req.params.id)])).rows})});
const outcome=wrap(async(req,res)=>{
 const b=req.body,patientId=v.uuid(b.patientId),type=v.choice(b.type,'Outcome',['maternal_death','neonatal_death']),date=v.date(b.date),note=v.text(b.evidenceNote,'Reviewed source evidence',3000,true);if(date>manilaDateKey())v.fail('An outcome date cannot be in the future.');if(b.confirmed!==true)v.fail('Confirm review of the source clinical record.');
 let newborn=null;if(type==='neonatal_death'){newborn=v.uuid(b.newbornId,'Newborn');const n=(await query("SELECT id FROM newborn_records WHERE id=$1 AND patient_id=$2 AND $3::date>=date_of_birth AND $3::date<date_of_birth+28",[newborn,patientId,date])).rows[0];if(!n)v.fail('A neonatal death must match this mother and occur within the first 28 days after birth.');}
 const row=(await query('INSERT INTO clinical_outcomes(patient_id,newborn_id,outcome_type,occurred_on,evidence_note,verified_by)VALUES($1,$2,$3,$4,$5,$6)RETURNING *',[patientId,newborn,type,date,note,req.user.id])).rows[0];res.status(201).json({success:true,data:row});
});
const outcomes=wrap(async(req,res)=>{res.json({success:true,data:(await query("SELECT o.*,p.first_name||' '||p.last_name AS patient_name FROM clinical_outcomes o JOIN patients p ON p.id=o.patient_id ORDER BY o.occurred_on DESC LIMIT 200")).rows})});
const analytics=wrap(async(req,res)=>{
 const from=v.date(req.query.from||manilaDateKey().slice(0,4)+'-01-01'),to=v.date(req.query.to||manilaDateKey());if(from>to)v.fail('Choose a valid date range.');
 const counts=(await query(`SELECT (SELECT count(*)::int FROM patients) AS patients,
 (SELECT count(DISTINCT patient_id)::int FROM pregnancies WHERE status='active') AS pregnant,
 (SELECT count(*)::int FROM appointments WHERE appointment_type='prenatal' AND status='completed' AND scheduled_date BETWEEN $1 AND $2) AS prenatal_visits,
 (SELECT count(*)::int FROM appointments WHERE status='completed' AND scheduled_date BETWEEN $1 AND $2) AS completed_visits,
 (SELECT count(*)::int FROM deliveries WHERE birth_recorded=true AND delivery_date BETWEEN $1 AND $2) AS deliveries,
 (SELECT count(*)::int FROM clinical_outcomes WHERE outcome_type='maternal_death' AND occurred_on BETWEEN $1 AND $2) AS maternal_deaths,
 (SELECT count(*)::int FROM clinical_outcomes WHERE outcome_type='neonatal_death' AND occurred_on BETWEEN $1 AND $2) AS neonatal_deaths,
 (SELECT count(*)::int FROM clinic_referrals WHERE (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $1 AND $2) AS referrals`,[from,to])).rows[0];
 res.json({success:true,data:{from,to,counts,definition:'Documented death counts only. No mortality rate is calculated without validated case definitions and denominators.',monthlyDeliveries:(await query("SELECT to_char(delivery_date,'YYYY-MM') AS month,count(*)::int AS count FROM deliveries WHERE birth_recorded=true AND delivery_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1",[from,to])).rows}});
});
module.exports={qr,lookup,listVisits,startVisit,advance,stock,stockHistory,outcome,outcomes,analytics,stages};
