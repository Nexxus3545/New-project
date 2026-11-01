/* Explicit local integration runner. Creates an isolated database; never targets production. */
require('dotenv').config();
const assert=require('node:assert/strict'),{Pool}=require('pg'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
if(process.env.DATABASE_URL||process.env.POSTGRES_URL||!['127.0.0.1','localhost'].includes(process.env.DB_HOST))throw new Error('This runner requires a local PostgreSQL connection.');
process.env.NODE_ENV='test';process.env.AUTO_MIGRATE_ON_START='false';
// No delivery adapters are configured in this test process.
for(const key of Object.keys(process.env))if(/^(SMTP_|RESEND_|TWILIO_)/.test(key))delete process.env[key];
const databaseName='mwos_verify_'+Date.now();
const admin=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
let server,pool,checks=0;
async function main(){
 await admin.query(`CREATE DATABASE "${databaseName}"`);process.env.DB_NAME=databaseName;
 ({pool}=require('../../src/config/database'));
 await require('../../src/utils/migrate').migrate({closePool:false});const c=await pool.connect();try{await require('../../src/utils/migratePatientCare').migratePatientCare(c)}finally{c.release()}
 const password='Verify!'+crypto.randomBytes(16).toString('hex'),hash=await require('bcryptjs').hash(password,10);
 const users={};for(const role of ['admin','patient','other','nurse']){const dbRole=role==='other'?'patient':role;users[role]=(await pool.query("INSERT INTO users(email,password,role,first_name,last_name,is_active) VALUES($1,$2,$3,$4,'Verification',true) RETURNING *",[`${role}@mwos-verification.invalid`,hash,dbRole,role])).rows[0]}
 const patients={};for(const role of ['patient','other'])patients[role]=(await pool.query("INSERT INTO patients(user_id,first_name,last_name,date_of_birth,care_type) VALUES($1,$2,'Verification','2000-01-01','maternal') RETURNING *",[users[role].id,role])).rows[0];
 server=require('../../src/index').listen(Number(process.env.MWOS_TEST_PORT || 5002),'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`,tokens={},step=require('../../src/utils/security').issueStepUpToken({userId:users.admin.id,role:'admin',purpose:'critical'});
 async function call(role,method,url,body,expected=200,withStep=true){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),...(role==='admin'&&withStep?{'X-Step-Up-Token':step}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,`${method} ${url}: ${JSON.stringify(data)}`);checks++;return data.data??data}
 for(const role of Object.keys(users)){const session=await call(role,'POST','/auth/login',{email:users[role].email,password});tokens[role]=session.accessToken;assert.ok(tokens[role])}
 const p=patients.patient.id,other=patients.other.id,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 await call('admin','POST','/pregnancies',{patientId:p},403,false);
 const preg=await call('admin','POST','/pregnancies',{patientId:p,lmp:'2026-02-01',edd:'2026-11-08',gravida:1,para:0},201);
 await call('admin','POST','/pregnancies',{patientId:p,lmp:'2026-02-01',edd:'2026-11-08',gravida:1},409);
 await call('patient','GET',`/pregnancies?patientId=${other}`,undefined,403);
 await call('patient','GET',`/patients/${other}`,undefined,403);
 await call('nurse','POST','/vitals',{patientId:p,visitDate:today},403);
 const countBefore=(await pool.query('SELECT COUNT(*) FROM vitals')).rows[0].count;
 await call('admin','POST','/vitals',{patientId:other,pregnancyId:preg.id,visitDate:today},400);
 assert.equal((await pool.query('SELECT COUNT(*) FROM vitals')).rows[0].count,countBefore);
 await call('admin','POST','/vitals',{patientId:p,pregnancyId:preg.id,visitDate:today,bpSystolic:120,bpDiastolic:80,weightKg:62,heightCm:160},201);
 const delivery=await call('admin','POST','/deliveries',{patientId:p,pregnancyId:preg.id,deliveryDate:today,birthRecorded:false},201);
 await call('admin','POST','/postpartum',{patientId:p,deliveryId:delivery.id,visitDate:today},400);
 await call('admin','POST',`/deliveries/${delivery.id}/labor-progress`,{recordedAt:new Date().toISOString(),cervicalDilation:3.5,fetalHeartRate:140,notes:'Synthetic observation'},201);
 await call('patient','GET',`/deliveries/${delivery.id}/labor-progress`);
 await call('other','GET',`/deliveries/${delivery.id}/labor-progress`,undefined,403);
 await call('admin','PATCH',`/deliveries/${delivery.id}`,{patientId:p,pregnancyId:preg.id,deliveryDate:today,birthRecorded:true,deliveryType:'Vacuum',apgar1min:0,apgar5min:9,birthWeightKg:3.2});
 assert.equal((await pool.query('SELECT status FROM pregnancies WHERE id=$1',[preg.id])).rows[0].status,'delivered');
 assert.equal((await pool.query('SELECT apgar_1min FROM deliveries WHERE id=$1',[delivery.id])).rows[0].apgar_1min,0);
 const baby=await call('admin','POST','/newborns',{patientId:p,deliveryId:delivery.id,babyName:'Synthetic Baby',birthOrder:1,dateOfBirth:today,sex:'Female'},201);
 await call('admin','POST','/newborns',{patientId:p,deliveryId:delivery.id,babyName:'Duplicate',birthOrder:1,dateOfBirth:today},409);
 await call('admin','POST','/pediatric',{patientId:p,newbornId:baby.id,visitDate:today,weightKg:3.2,assessment:'Synthetic follow-up'},201);
 await call('admin','POST','/postpartum',{patientId:p,deliveryId:delivery.id,visitDate:today,notes:'Synthetic follow-up'},201);
 for(const [kind,body] of [['emr/labs',{testName:'Demo test',testDate:today,resultValue:'Synthetic'}],['emr/ultrasounds',{scanDate:today,findings:'Synthetic'}],['emr/prescriptions',{medicationName:'Demo medicine',dosage:'As ordered',frequency:'Per order',duration:'Per order'}],['immunizations',{vaccineName:'Demo vaccine',dateGiven:today,doseNumber:1}]])await call('admin','POST','/'+kind,{patientId:p,...body},201);
 for(const kind of ['emr/labs','emr/ultrasounds','emr/prescriptions','postpartum','immunizations','newborns','pediatric']){await call('patient','GET',`/${kind}/${p}`);await call('other','GET',`/${kind}/${p}`,undefined,403)}
 assert.equal(Number((await pool.query('SELECT COUNT(*) FROM digital_signatures')).rows[0].count),0,'Admin entry never manufactures a clinical signature');
 const draft=await call('admin','POST','/education',{title:'Synthetic article',content:'Full article body',trimesterTarget:'general',isPublished:false},201);
 assert.ok(!(await call('patient','GET','/education?includeDrafts=true')).some(r=>r.id===draft.id));
 await call('admin','PATCH',`/education/${draft.id}`,{title:'Synthetic article',content:'Full article body',trimesterTarget:'general',isPublished:true});
 assert.ok((await call('patient','GET','/education')).some(r=>r.id===draft.id));
 const bill=await call('admin','POST','/billing',{patientId:p,serviceType:'Demo service',amount:1000,discount:100},201);
 const payment={amount:300,paymentMethod:'cash',requestId:crypto.randomUUID()};await call('admin','PATCH',`/billing/${bill.id}/pay`,payment);await call('admin','PATCH',`/billing/${bill.id}/pay`,payment);
 let statement=await call('admin','GET',`/billing/${bill.id}`);assert.equal(statement.payments.length,1);assert.equal(Number(statement.bill.balance),600);
 await call('admin','PATCH',`/billing/${bill.id}/pay`,{amount:601,paymentMethod:'cash',requestId:crypto.randomUUID()},400);
 await call('patient','GET',`/billing/${bill.id}`,undefined,403);
 const concurrent=await Promise.all([500,500].map(amount=>fetch(base+`/billing/${bill.id}/pay`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.admin,'X-Step-Up-Token':step},body:JSON.stringify({amount,paymentMethod:'cash',requestId:crypto.randomUUID()})})));
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,400]);checks++;
 statement=await call('admin','GET',`/billing/${bill.id}`);assert.equal(Number(statement.bill.balance),100);
 const medication=(await pool.query("INSERT INTO inventory(item_name,category,quantity,unit,reorder_level,availability_status) VALUES('Synthetic medicine','medication',3,'unit',1,'available') RETURNING *")).rows[0];
 const pickupBody={requestId:crypto.randomUUID(),items:[{id:medication.id,quantity:2}]};
 const pickup=await call('patient','POST','/pharmacy/pickups',pickupBody,201);assert.equal((await call('patient','POST','/pharmacy/pickups',pickupBody,201)).id,pickup.id);
 await call('other','PATCH',`/pharmacy/pickups/${pickup.id}`,{status:'cancelled',reviewNote:'not mine'},403);
 await call('admin','PATCH',`/pharmacy/pickups/${pickup.id}`,{status:'ready',reviewNote:'Reviewed',reviewConfirmed:true});
 await call('admin','PATCH',`/pharmacy/pickups/${pickup.id}`,{status:'dispensed',reviewNote:'Handed over'});
 await call('admin','PATCH',`/pharmacy/pickups/${pickup.id}`,{status:'dispensed',reviewNote:'Handed over'});
 assert.equal((await pool.query('SELECT quantity FROM inventory WHERE id=$1',[medication.id])).rows[0].quantity,1);
 const referral=await call('admin','POST','/referrals',{patientId:p,destination:'Synthetic receiving facility',reason:'Synthetic handover'},201);
 await call('admin','PATCH',`/referrals/${referral.id}`,{status:'handed_over',note:'Invalid skip'},409);
 for(const status of ['accepted','in_transit','handed_over','closed'])await call('admin','PATCH',`/referrals/${referral.id}`,{status,note:'Synthetic confirmed update'});
 assert.equal((await call('other','GET','/referrals')).length,0);
 const appointment=await call('patient','POST','/appointments',{patientId:p,scheduledDate:tomorrow,scheduledTime:'09:00'},201);
 await call('admin','PATCH',`/appointments/${appointment.id}`,{status:'confirmed'});
 await call('patient','PATCH',`/appointments/${appointment.id}`,{scheduledTime:'11:00'},409);
 await call('admin','POST','/appointments/'+appointment.id+'/remind',{});
 assert.equal((await call('admin','POST','/appointments/'+appointment.id+'/remind',{})).alreadySent,true);
 await call('patient','POST','/appointments',{patientId:p,scheduledDate:tomorrow,scheduledTime:'09:00'},409);
 await call('admin','PATCH',`/users/${users.admin.id}/toggle`,{},409);
 await call('admin','POST','/users',{role:'nurse',firstName:'Test',lastName:'Staff',email:'staff2@mwos-verification.invalid',password:'weak'},400);
 const staff=await call('admin','POST','/users',{role:'nurse',firstName:'Test',lastName:'Staff',email:'staff2@mwos-verification.invalid',password},201);assert.ok(staff.user);
 assert.equal((await call('admin','GET',`/appointments?from=${tomorrow}&to=${tomorrow}&limit=200`)).length,1);
 await call('admin','GET','/appointments?from=2099-01-01&to=2000-01-01',undefined,400);
 await call('admin','GET','/appointments?limit=0',undefined,400);
 await call('admin','GET','/reports/births/monthly');await call('admin','GET','/reports/dashboard');
 const exported=await call('admin','POST','/admin/clinic-export',{});assert.equal(exported.format,'MWOS-clinic-export');assert.ok(!exported.tables.users);
 console.log(JSON.stringify({result:'passed',checks,database:databaseName}));
 if(process.env.MWOS_KEEP_TEST_SERVER==='1'){
 const target=path.resolve(process.env.MWOS_TEST_FIXTURE || '../../tmp/workflow-browser-fixture.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({apiBase:base,database:databaseName,users,patients,tokens,step,password,delivery,baby,bill,appointment}));console.log('Synthetic test server retained on 5002 for browser checks.');return;
 }
 await cleanup();
}
async function cleanup(){if(server)await new Promise(r=>server.close(r));await pool?.end();if(/^mwos_verify_\d+$/.test(databaseName))await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);await admin.end()}
main().catch(async e=>{console.error(e.stack);await cleanup().catch(()=>{});process.exitCode=1});
