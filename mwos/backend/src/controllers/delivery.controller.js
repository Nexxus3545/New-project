const { query } = require('../config/database');
const { generateUniqueCode } = require('../utils/identifiers');
const { clinicalTransaction, linkedPatient } = require('../utils/clinicalWorkflow');
const v = require('../utils/workflowValidation');
const save=async(req,res,next)=>{try{
 const b=req.body,patientId=v.uuid(b.patientId,'Patient'),pregnancyId=v.uuid(b.pregnancyId,'Pregnancy'),birthRecorded=b.birthRecorded!==false;
 const deliveryDate=v.date(b.deliveryDate,'Delivery/admission date'),type=v.choice(b.deliveryType,'delivery type',['NSD','CS','Forceps','Vacuum'],'NSD'),time=b.deliveryTime||null;
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time))v.fail('Enter a valid time.');
 const data=[deliveryDate,time,type,v.number(b.gestationalAgeAtDelivery,'Gestational weeks',0,50,true),v.text(b.newbornSex,'Sex',10),v.number(b.birthWeightKg,'Birth weight',0.1,20),v.number(b.apgar1min,'APGAR at 1 minute',0,10,true),v.number(b.apgar5min,'APGAR at 5 minutes',0,10,true),v.text(b.newbornCondition,'Newborn condition'),v.text(b.complications,'Complications'),v.text(b.placentaDelivery,'Placenta',30),v.number(b.bloodLossMl,'Blood loss',0,20000,true),v.text(b.notes,'Notes'),birthRecorded];
 const record=await clinicalTransaction(req,'deliveries',async client=>{
  await linkedPatient(client,patientId,{pregnancies:pregnancyId});const pregnancy=(await client.query('SELECT status FROM pregnancies WHERE id=$1 FOR UPDATE',[pregnancyId])).rows[0];
  if(!req.params.id&&pregnancy.status!=='active')v.fail('Select an active pregnancy.');
  if(req.params.id){v.uuid(req.params.id);const old=(await client.query('SELECT * FROM deliveries WHERE id=$1 AND patient_id=$2 AND pregnancy_id=$3 FOR UPDATE',[req.params.id,patientId,pregnancyId])).rows[0];if(!old)v.fail('Delivery not found.',404);if(old.birth_recorded&&!birthRecorded)v.fail('A completed delivery cannot be changed to an admission.');}
  else if((await client.query('SELECT id FROM deliveries WHERE pregnancy_id=$1',[pregnancyId])).rows.length)v.fail('A labor/delivery record already exists. Open it to continue.',409);
  const columns=['delivery_date','delivery_time','delivery_type','gestational_age_at_delivery','newborn_sex','birth_weight_kg','apgar_1min','apgar_5min','newborn_condition','complications','placenta_delivery','blood_loss_ml','notes','birth_recorded'];let saved;
  if(req.params.id)saved=(await client.query(`UPDATE deliveries SET ${columns.map((c,i)=>c+'=$'+(i+1)).join(',')},updated_at=NOW() WHERE id=$15 RETURNING *`,[...data,req.params.id])).rows[0];
  else{const code=await generateUniqueCode({table:'deliveries',column:'delivery_code',prefix:'TMC-DEL',client});saved=(await client.query(`INSERT INTO deliveries (${columns.join(',')},patient_id,pregnancy_id,birth_attendant,created_by,delivery_code,labor_started_at) VALUES (${data.map((_,i)=>'$'+(i+1)).join(',')},$15,$16,$17,$17,$18,NOW()) RETURNING *`,[...data,patientId,pregnancyId,req.user.id,code])).rows[0];}
  if(birthRecorded)await client.query("UPDATE pregnancies SET status='delivered',updated_at=NOW() WHERE id=$1",[pregnancyId]);return saved;
 });res.status(req.params.id?200:201).json({success:true,data:record});
}catch(e){next(e)}};
const getByPatient=async(req,res,next)=>{try{v.uuid(req.params.patientId);res.json({success:true,data:(await query("SELECT d.*,u.first_name||' '||u.last_name AS birth_attendant_name,u.role AS entry_role FROM deliveries d LEFT JOIN users u ON u.id=d.birth_attendant WHERE d.patient_id=$1 ORDER BY d.delivery_date DESC",[req.params.patientId])).rows});}catch(e){next(e)}};
const addLaborProgress=async(req,res,next)=>{try{
 const b=req.body,id=v.uuid(req.params.deliveryId,'Delivery');if(!b.recordedAt||!Number.isFinite(Date.parse(b.recordedAt))||Date.parse(b.recordedAt)>Date.now()+60000)v.fail('Observation time must be valid and not in the future.');
 const fields=[['cervicalDilation',0,10],['fetalStation',-5,5],['fetalHeartRate',0,300],['contractionsPer10min',0,20],['contractionDuration',0,600],['bpSystolic',0,350],['bpDiastolic',0,250],['pulseRate',0,300],['temperature',20,50],['urineOutput',0,10000],['oxytocinUnits',0,1000]];
 const values=fields.map(([key,min,max])=>v.number(b[key],key,min,max,key!=='cervicalDilation'&&key!=='temperature'));if(values.every(x=>x===null)&&!b.notes)v.fail('Enter an observation or note.');
 const record=await clinicalTransaction(req,'labor_progress',async client=>{
  if(!(await client.query('SELECT id FROM deliveries WHERE id=$1',[id])).rows.length)v.fail('Delivery not found.',404);
  return(await client.query('INSERT INTO labor_progress (delivery_id,recorded_at,cervical_dilation,fetal_station,fetal_heart_rate,contractions_per_10min,contraction_duration,bp_systolic,bp_diastolic,pulse_rate,temperature,urine_output,oxytocin_units,notes,assessment,care_plan,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[id,new Date(b.recordedAt),...values,v.text(b.notes,'Notes'),v.text(b.assessment,'Assessment'),v.text(b.carePlan,'Care plan'),req.user.id])).rows[0];
 });res.status(201).json({success:true,data:record});
}catch(e){next(e)}};
const getLaborProgress=async(req,res,next)=>{try{v.uuid(req.params.deliveryId);res.json({success:true,data:(await query('SELECT * FROM labor_progress WHERE delivery_id=$1 ORDER BY recorded_at ASC',[req.params.deliveryId])).rows});}catch(e){next(e)}};
module.exports={create:save,update:save,getByPatient,addLaborProgress,getLaborProgress};
