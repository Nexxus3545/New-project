const { query } = require('../config/database');
const v = require('../utils/workflowValidation');
const { clinicalTransaction, linkedPatient } = require('../utils/clinicalWorkflow');
const n=(key,min=0,max=1000000,integer=false)=>[key,x=>v.number(x,key,min,max,integer)];
const s=(key,required=false,max=5000)=>[key,x=>v.text(x,key,max,required)];
const d=(key,required=true)=>[key,x=>v.date(x,key,required)];
const snake=key=>key.replace(/[A-Z]/g,x=>'_'+x.toLowerCase());
const schemas={
 labs:{table:'lab_results',author:'uploaded_by',order:'test_date',fields:[s('testName',true,200),d('testDate'),s('resultValue'),s('unit',false,50),s('referenceRange',false,100),['status',x=>v.choice(x,'status',['normal','abnormal','critical','pending'],'normal')],s('notes')]},
 ultrasounds:{table:'ultrasounds',author:'performed_by',order:'scan_date',fields:[d('scanDate'),n('gestationalAgeWeeks',0,50,true),s('findings'),s('placentaLocation',false,50),s('amnioticFluid',false,50),s('notes')]},
 prescriptions:{table:'prescriptions',author:'prescribed_by',order:'prescribed_date',fields:[s('medicationName',true,200),s('dosage',true,100),s('frequency',true,100),s('route',false,50),s('duration',true,100),s('instructions')]},
 postpartum:{table:'postpartum_records',author:'recorded_by',order:'visit_date',fields:[d('visitDate'),n('daysPostpartum',0,3650,true),n('bpSystolic',0,350,true),n('bpDiastolic',0,250,true),n('temperature',20,50),s('woundStatus',false,100),s('lochia',false,100),s('breastfeedingStatus',false,50),s('emotionalStatus',false,50),s('notes')]},
 immunizations:{table:'immunizations',author:'given_by',order:'date_given',fields:[s('vaccineName',true,200),['doseNumber',x=>v.number(x||1,'Dose number',1,100,true,true)],d('dateGiven'),d('dueDate',false),s('notes')]},
 newborns:{table:'newborn_records',author:'created_by',order:'date_of_birth',fields:[s('babyName',true,200),['birthOrder',x=>v.number(x||1,'Birth order',1,20,true,true)],d('dateOfBirth'),['sex',x=>v.choice(x,'sex',['Male','Female','Not recorded'],'Not recorded')],n('birthWeightKg',0.1,20),s('notes')]},
 pediatric:{table:'pediatric_visits',author:'recorded_by',order:'visit_date',fields:[d('visitDate'),n('weightKg',0.1,300),n('lengthCm',10,250),n('headCircumferenceCm',10,100),n('temperature',20,50),s('feeding'),s('development'),s('assessment',true),s('carePlan'),d('followUpDate',false)]},
};
const list=kind=>async(req,res,next)=>{try{const m=schemas[kind],id=v.uuid(req.params.patientId,'Patient');res.json({success:true,data:(await query(`SELECT r.*,u.first_name||' '||u.last_name AS recorded_by_name,u.role AS entry_role FROM ${m.table} r LEFT JOIN users u ON u.id=r.${m.author} WHERE r.patient_id=$1 ORDER BY r.${m.order} DESC,r.created_at DESC`,[id])).rows});}catch(e){next(e)}};
const create=kind=>async(req,res,next)=>{try{
 const m=schemas[kind],b=req.body,patientId=v.uuid(b.patientId,'Patient'),entries=m.fields.map(([key,parse])=>[snake(key),parse(b[key])]),links={};
 if(['labs','ultrasounds','prescriptions'].includes(kind)){links.pregnancies=b.pregnancyId||null;entries.push(['pregnancy_id',links.pregnancies]);}
 if(['postpartum','newborns','immunizations'].includes(kind)){links.deliveries=b.deliveryId||null;if(kind!=='immunizations')v.uuid(links.deliveries,'Delivery');entries.push(['delivery_id',links.deliveries]);}
 if(kind==='pediatric'){links.newborn_records=v.uuid(b.newbornId,'Newborn');entries.push(['newborn_id',links.newborn_records]);}
 const record=await clinicalTransaction(req,m.table,async client=>{
  await linkedPatient(client,patientId,links);
  if(['newborns','postpartum'].includes(kind)){const delivery=(await client.query('SELECT birth_recorded FROM deliveries WHERE id=$1',[links.deliveries])).rows[0];if(!delivery.birth_recorded)v.fail('Complete the delivery record before recording postnatal or newborn care.');}
  entries.push(['patient_id',patientId],[m.author,req.user.id]);return(await client.query(`INSERT INTO ${m.table} (${entries.map(x=>x[0]).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,entries.map(x=>x[1]))).rows[0];
 });res.status(201).json({success:true,message:'Record saved',data:record});
}catch(e){if(e.code==='23505')return res.status(409).json({success:false,message:'This birth order is already registered for the delivery.'});next(e)}};
async function listPregnancies(req,res,next){try{const params=[],conditions=[];if(req.query.patientId){params.push(v.uuid(req.query.patientId));conditions.push('patient_id=$1')}if(req.query.status){params.push(v.choice(req.query.status,'status',['active','delivered','miscarried','aborted']));conditions.push('status=$'+params.length)}res.json({success:true,data:(await query(`SELECT * FROM pregnancies ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY created_at DESC`,params)).rows});}catch(e){next(e)}}
async function savePregnancy(req,res,next){try{
 const b=req.body,patientId=v.uuid(b.patientId,'Patient'),lmp=v.date(b.lmp,'LMP'),edd=v.date(b.edd,'EDD');if(edd<=lmp)v.fail('EDD must be after LMP.');
 const status=v.choice(b.status,'status',['active','delivered','miscarried','aborted'],'active');
 const values=[lmp,edd,v.number(b.gravida,'Gravida',1,50,true,true),v.number(b.para??0,'Para',0,50,true),v.number(b.abortion??0,'Abortion',0,50,true),v.number(b.livingChildren??0,'Living children',0,50,true),v.choice(b.riskLevel,'risk level',['low','moderate','high'],'low'),v.text(b.notes,'Notes'),status];
 const record=await clinicalTransaction(req,'pregnancies',async client=>{
  await linkedPatient(client,patientId);await client.query('SELECT id FROM patients WHERE id=$1 FOR UPDATE',[patientId]);
  if(status==='active'&&(await client.query("SELECT id FROM pregnancies WHERE patient_id=$1 AND status='active' AND ($2::uuid IS NULL OR id<>$2)",[patientId,req.params.id||null])).rows.length)v.fail('This patient already has an active pregnancy.',409);
  if(req.params.id){v.uuid(req.params.id);const existing=(await client.query('SELECT * FROM pregnancies WHERE id=$1 AND patient_id=$2 FOR UPDATE',[req.params.id,patientId])).rows[0];if(!existing)v.fail('Pregnancy not found.',404);if(existing.status==='delivered'&&status!=='delivered')v.fail('A delivered pregnancy cannot be reopened.');return(await client.query('UPDATE pregnancies SET lmp=$1,edd=$2,gravida=$3,para=$4,abortion=$5,living_children=$6,risk_level=$7,notes=$8,status=$9,updated_at=NOW() WHERE id=$10 RETURNING *',[...values,req.params.id])).rows[0];}
  return(await client.query('INSERT INTO pregnancies (lmp,edd,gravida,para,abortion,living_children,risk_level,notes,status,patient_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[...values,patientId,req.user.id])).rows[0];
 });res.status(req.params.id?200:201).json({success:true,data:record});
}catch(e){next(e)}}
module.exports={list,create,listPregnancies,savePregnancy,schemas};
