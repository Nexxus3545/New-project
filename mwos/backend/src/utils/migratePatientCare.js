const fs = require('node:fs');
const path = require('node:path');

const migrationSql = fs.readFileSync(path.join(__dirname, '../config/migrations/20261024-patient-care.sql'), 'utf8');
const notificationMigrationSql = fs.readFileSync(path.join(__dirname, '../config/migrations/20261024-login-email-notifications.sql'), 'utf8');

async function migratePatientCare(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query(migrationSql);
    await client.query(notificationMigrationSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (process.env.VERCEL_ENV !== 'production' && !process.argv.includes('--apply')) {
    console.log('Patient care migration skipped outside production. Use --apply for an explicit local migration.');
    return;
  }
  require('dotenv').config();
  // The approved release adds alerts, not a new mandatory login factor.
  require('./googleEmailVerification').assertEmailCodeRolloutDisabled();
  if (process.env.VERCEL_ENV === 'production' && !(process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
    throw new Error('Production database configuration is required; refusing to fall back to a local database.');
  }
  const { pool } = require('../config/database');
  let client;
  try {
    client = await pool.connect();
    await migratePatientCare(client);
    console.log('Additive patient care and email notification migrations applied. Existing records preserved.');
  } finally {
    client?.release();
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => {
  console.error('Patient care migration failed:', error.code || error.message);
  process.exitCode = 1;
});

module.exports = { migratePatientCare, migrationSql, notificationMigrationSql };
