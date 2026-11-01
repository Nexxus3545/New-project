const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {query,getClient}=require('../config/database');
const v=require('../utils/workflowValidation');
const run=promisify(execFile);
const backupDir=path.resolve(process.cwd(),process.env.BACKUP_DIR||'backups');
const isHosted=()=>process.env.VERCEL==='1'||process.env.NODE_ENV==='production';
const pgTool=name=>process.env.POSTGRES_BIN?path.join(process.env.POSTGRES_BIN,process.platform==='win32'?name+'.exe':name):name;
const pgEnv=()=>({...process.env,PGPASSWORD:process.env.DB_PASSWORD,PGHOST:process.env.DB_HOST,PGPORT:process.env.DB_PORT,PGUSER:process.env.DB_USER,PGDATABASE:process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.DB_NAME});
const record=async(req,file,status,notes)=>(await query('INSERT INTO backup_logs(initiated_by,backup_file,status,notes) VALUES($1,$2,$3,$4) RETURNING id',[req.user.id,file,status,notes])).rows[0];
async function getBackupStatus(req,res,next){try{let fullBackupAvailable=false;if(!isHosted()){try{await run(pgTool('pg_dump'),['--version'],{timeout:5000,windowsHide:true});fullBackupAvailable=true;}catch{}}res.json({success:true,data:{fullBackupAvailable,clinicalExportAvailable:true,restoreAvailable:!isHosted()&&process.env.MWOS_ALLOW_RESTORE==='true',message:fullBackupAvailable?'Full PostgreSQL backup download is available.':'Download clinic data here. Full database recovery is managed through the hosting database provider.'}});}catch(e){next(e)}}
async function createBackup(req,res,next){try{
 if(isHosted())v.fail('Use clinic data export here; full backups are managed through your database hosting provider.',409);
 await fs.mkdir(backupDir,{recursive:true});const name=`mwos-backup-${Date.now()}.dump`,file=path.join(backupDir,name);
 try{await run(pgTool('pg_dump'),['--format=custom','--no-owner','--no-acl','--file',file],{env:pgEnv(),timeout:120000,windowsHide:true,maxBuffer:1024*1024});}catch{v.fail('PostgreSQL backup could not run. Check the server database tools and connection settings.',503);}
 await record(req,name,'success','Full PostgreSQL custom-format backup created.');res.setHeader('Cache-Control','no-store');res.download(file,name);
}catch(e){next(e)}}
// A consistent data extract is usable on serverless hosts without shell utilities.
// It deliberately excludes passwords, sessions, private IDs, tokens and authentication tables.
const exportTables=['patients','pregnancies','appointments','vitals','deliveries','labor_progress','postpartum_records','newborn_records','pediatric_visits','lab_results','ultrasounds','prescriptions','immunizations','billing','billing_payments','inventory','pharmacy_pickups','clinic_referrals','referral_events','education_content'];
async function exportClinicData(req,res,next){let c;try{
 c=await getClient();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables={};let bytes=0;
 for(const table of exportTables){const rows=(await c.query(`SELECT * FROM ${table}`)).rows;
 if(table==='patients')for(const row of rows){delete row.valid_id_number;delete row.philhealth_id;delete row.credential_notes;}
 bytes+=Buffer.byteLength(JSON.stringify(rows));if(bytes>3*1024*1024)v.fail('This clinic export is too large for a web download. Use a full database backup through the server or database provider.',413);tables[table]=rows;}
 await c.query('COMMIT');c.release();c=null;
 const name=`mwos-clinic-data-${new Date().toISOString().slice(0,10)}.json`;await record(req,name,'success','Clinical data export only; excludes authentication, private ID numbers and uploaded file contents. Not a full recovery backup.');
 res.setHeader('Cache-Control','no-store');res.attachment(name);res.type('application/json').send(JSON.stringify({format:'MWOS-clinic-export',version:1,exportedAt:new Date().toISOString(),scope:'Clinical records only. Not a full database recovery backup. Uploaded files and authentication data are excluded.',tables}));
}catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}}
async function restoreBackup(req,res,next){try{
 if(isHosted()||process.env.MWOS_ALLOW_RESTORE!=='true')v.fail('Restore requires an offline maintenance environment. Production restores are disabled in the web app.',409);
 if(req.body.confirmation!=='RESTORE OFFLINE DATABASE')v.fail('Explicit offline restore confirmation is required.');
 const name=v.text(req.body.fileName,'Backup filename',150,true);if(!/^mwos-backup-\d+\.dump$/.test(name))v.fail('Choose a backup created by this server.');
 const file=await fs.realpath(path.join(backupDir,name)),base=await fs.realpath(backupDir);if(path.dirname(file)!==base)v.fail('Invalid backup path.');
 await run(pgTool('pg_restore'),['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname',process.env.DB_NAME,file],{env:pgEnv(),timeout:120000,windowsHide:true,maxBuffer:1024*1024});
 await record(req,name,'success','Restored to an offline database.');res.json({success:true,message:'Offline database restored.'});
}catch(e){next(e)}}
async function getBackupLogs(req,res,next){try{res.json({success:true,data:(await query('SELECT id,status,notes,created_at FROM backup_logs ORDER BY created_at DESC LIMIT 100')).rows});}catch(e){next(e)}}
module.exports={createBackup,restoreBackup,getBackupLogs,getBackupStatus,exportClinicData};
