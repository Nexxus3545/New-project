require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../config/database');

async function migrateAccountSecurity() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(fs.readFileSync(path.join(__dirname, '../config/account-security.sql'), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (require.main === module) {
  if (!process.argv.includes('--apply')) { console.error('Use --apply after confirming the intended database. This additive migration never deletes patient records.'); process.exitCode = 1; }
  else migrateAccountSecurity().then(() => console.log('Additive account-security migration completed.')).catch(() => { console.error('Account-security migration failed; no credentials are logged.'); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { migrateAccountSecurity };
