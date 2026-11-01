const { query, getClient } = require('../config/database');
const v = require('../utils/workflowValidation');
const { linkedPatient } = require('../utils/clinicalWorkflow');
const { queueNotification } = require('../utils/notificationEvents');

async function transaction(action) {
  const c = await getClient();
  try { await c.query('BEGIN'); const result = await action(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function patientScope(req, c, requested) {
  if (req.user.role !== 'patient') return requested ? v.uuid(requested, 'Patient') : null;
  const own = (await c.query('SELECT id FROM patients WHERE user_id=$1', [req.user.id])).rows[0];
  if (!own || (requested && own.id !== requested)) v.fail('You can only access your own patient records.', 403);
  return own.id;
}
async function notifyPatient(c, patientId, eventKey, title, body, route, actor) {
  const row = (await c.query('SELECT user_id FROM patients WHERE id=$1', [patientId])).rows[0];
  if (row?.user_id) await queueNotification(c, { eventKey, userId: row.user_id, recipient: null, title, body, metadata: { route }, createdBy: actor });
}
const listPickups = async (req,res,next) => {try {
  const patient = await patientScope(req,{query},req.query.patientId);
  const rows = await query(`SELECT r.*, p.first_name || ' ' || p.last_name AS patient_name FROM pharmacy_pickups r JOIN patients p ON p.id=r.patient_id ${patient ? 'WHERE r.patient_id=$1' : ''} ORDER BY r.created_at DESC LIMIT 200`, patient ? [patient] : []);
  res.json({success:true,data:rows.rows});
} catch(e){next(e)}};
const createPickup = async (req,res,next) => {try {
  const requestId=v.uuid(req.body.requestId,'Request reference'), notes=v.text(req.body.notes,'Notes',2000);
  if(!Array.isArray(req.body.items)||!req.body.items.length||req.body.items.length>30) v.fail('Select between 1 and 30 medicines.');
  const items=req.body.items.map(i=>({id:v.uuid(i.id,'Medicine'),quantity:v.number(i.quantity,'Quantity',1,1000,true)})).sort((a,b)=>a.id.localeCompare(b.id));
  if(items.some(i=>i.quantity===null)||new Set(items.map(i=>i.id)).size!==items.length) v.fail('Use one entry per medicine with a positive quantity.');
  const data=await transaction(async c=>{
    const patientId=await patientScope(req,c,req.body.patientId); if(!patientId)v.fail('Patient is required.');
    await linkedPatient(c,patientId); await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[requestId]);
    const prior=(await c.query('SELECT * FROM pharmacy_pickups WHERE request_id=$1',[requestId])).rows[0];
    if(prior){if(prior.patient_id!==patientId||JSON.stringify(prior.items.map(i=>({id:i.id,quantity:i.quantity})))!==JSON.stringify(items)||prior.notes!==notes)v.fail('This request reference was already used.',409);return prior;}
    const catalog=(await c.query("SELECT id,item_name,dosage,unit,quantity,expiry_date,availability_status FROM inventory WHERE id=ANY($1::uuid[]) AND category='medication'",[items.map(i=>i.id)])).rows;
    const saved=items.map(i=>{const stock=catalog.find(s=>s.id===i.id);if(!stock)v.fail('A selected medicine is no longer available.',409);if(stock.quantity<i.quantity||stock.availability_status==='out_of_stock'||(stock.expiry_date&&new Date(stock.expiry_date)<new Date(new Date().toISOString().slice(0,10))))v.fail(`${stock.item_name} is unavailable in the requested quantity.`,409);return {...i,item_name:stock.item_name,dosage:stock.dosage,unit:stock.unit};});
    return (await c.query('INSERT INTO pharmacy_pickups(patient_id,items,notes,request_id) VALUES($1,$2,$3,$4) RETURNING *',[patientId,JSON.stringify(saved),notes,requestId])).rows[0];
  });res.status(201).json({success:true,data});
}catch(e){next(e)}};
const updatePickup=async(req,res,next)=>{try{
 const id=v.uuid(req.params.id),status=v.choice(req.body.status,'Status',['ready','dispensed','cancelled']),note=v.text(req.body.reviewNote,'Review note',2000,true);
 const data=await transaction(async c=>{
  const row=(await c.query('SELECT * FROM pharmacy_pickups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)v.fail('Pickup request not found.',404);
  await patientScope(req,c,row.patient_id);
  if(req.user.role==='patient'&&(status!=='cancelled'||row.status!=='requested'))v.fail('Only a pending pickup request can be cancelled by the patient.',403);
  if(row.status===status)return row;
  if(!({requested:['ready','cancelled'],ready:['dispensed','cancelled']}[row.status]||[]).includes(status))v.fail('This pickup status can no longer be changed.',409);
  if(status==='ready'&&req.body.reviewConfirmed!==true)v.fail('Confirm that the order and any required prescription have been reviewed.');
  if(status==='dispensed'){
   for(const item of [...row.items].sort((a,b)=>a.id.localeCompare(b.id))){
    const stock=(await c.query("UPDATE inventory SET quantity=quantity-$2, availability_status=CASE WHEN quantity-$2=0 THEN 'out_of_stock' WHEN quantity-$2<=reorder_level THEN 'limited' ELSE 'available' END,updated_at=NOW(),updated_by=$3 WHERE id=$1 AND quantity >= $2 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND availability_status <> 'out_of_stock' RETURNING id",[item.id,item.quantity,req.user.id])).rows[0];
    if(!stock)v.fail(`${item.item_name} has insufficient or expired stock. No items were deducted.`,409);
   }
  }
  const updated=(await c.query('UPDATE pharmacy_pickups SET status=$1,review_note=$2,reviewed_by=$3,updated_at=NOW() WHERE id=$4 RETURNING *',[status,note,req.user.id,id])).rows[0];
  await notifyPatient(c,row.patient_id,`pickup:${id}:${status}`,'Pharmacy pickup update',`Your pickup request is ${status}. Review the clinic note in your pharmacy requests.`, '/my/pharmacy/success', req.user.id);
  return updated;
 });res.json({success:true,data});
}catch(e){next(e)}};
const listReferrals=async(req,res,next)=>{try{
 const patient=await patientScope(req,{query},req.query.patientId);
 const rows=await query(`SELECT r.*,p.first_name||' '||p.last_name AS patient_name,COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM referral_events e WHERE e.referral_id=r.id),'[]') AS events FROM clinic_referrals r JOIN patients p ON p.id=r.patient_id ${patient?'WHERE r.patient_id=$1':''} ORDER BY r.created_at DESC LIMIT 200`,patient?[patient]:[]);
 res.json({success:true,data:rows.rows});
}catch(e){next(e)}};
const createReferral=async(req,res,next)=>{try{
 const b=req.body,patient=v.uuid(b.patientId,'Patient'),destination=v.text(b.destination,'Receiving facility',250,true),reason=v.text(b.reason,'Reason',3000,true),summary=v.text(b.clinicalSummary,'Handover summary',5000),contact=v.text(b.receivingContact,'Receiving contact',200);
 const data=await transaction(async c=>{await linkedPatient(c,patient);const r=(await c.query('INSERT INTO clinic_referrals(patient_id,destination,reason,clinical_summary,receiving_contact,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[patient,destination,reason,summary,contact,req.user.id])).rows[0];await c.query("INSERT INTO referral_events(referral_id,status,note,recorded_by) VALUES($1,'requested',$2,$3)",[r.id,'Referral recorded; receiving facility acceptance is not yet confirmed.',req.user.id]);return r;});
 res.status(201).json({success:true,data});
}catch(e){next(e)}};
const updateReferral=async(req,res,next)=>{try{
 const id=v.uuid(req.params.id),status=v.choice(req.body.status,'Status',['accepted','in_transit','handed_over','closed','cancelled']),note=v.text(req.body.note,'Handover / confirmation note',3000,true);
 const data=await transaction(async c=>{const row=(await c.query('SELECT * FROM clinic_referrals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)v.fail('Referral not found.',404);
 const transitions={requested:['accepted','cancelled'],accepted:['in_transit','cancelled'],in_transit:['handed_over','cancelled'],handed_over:['closed']};
 if(!(transitions[row.status]||[]).includes(status))v.fail('That referral status transition is not allowed.',409);
 const r=(await c.query('UPDATE clinic_referrals SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[status,id])).rows[0];await c.query('INSERT INTO referral_events(referral_id,status,note,recorded_by) VALUES($1,$2,$3,$4)',[id,status,note,req.user.id]);return r;});res.json({success:true,data});
}catch(e){next(e)}};
const remindAppointment=async(req,res,next)=>{try{
 const id=v.uuid(req.params.id);const data=await transaction(async c=>{
  const a=(await c.query("SELECT a.*,p.user_id FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1 AND a.status='confirmed' FOR UPDATE OF a",[id])).rows[0];
  if(!a)v.fail('Only confirmed appointments can receive reminders.',409);if(!a.user_id)v.fail('This patient has no linked portal account.',409);
  const date=new Date(a.scheduled_date).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),schedule=`${date} ${a.scheduled_time}`;
  if(new Date(`${date}T${a.scheduled_time}+08:00`)<=new Date())v.fail('This appointment is in the past.',409);
  const r=await c.query("INSERT INTO appointment_reminders(appointment_id,schedule_key,status,attempts,delivered_at) VALUES($1,$2,'in_app',1,NOW()) ON CONFLICT(appointment_id,schedule_key) DO NOTHING RETURNING id",[id,schedule]);
  if(r.rows.length)await notifyPatient(c,a.patient_id,`reminder:${id}:${schedule}`,'Appointment reminder',`Your confirmed clinic visit is on ${date} at ${String(a.scheduled_time).slice(0,5)} (Philippine time).`, '/my/appointments',req.user.id);
  return {inApp:true,alreadySent:!r.rows.length};
 });res.json({success:true,data,message:data.alreadySent?'A portal reminder already exists for this schedule.':'Reminder added to the patient portal.'});
}catch(e){next(e)}};
module.exports={listPickups,createPickup,updatePickup,listReferrals,createReferral,updateReferral,remindAppointment};
