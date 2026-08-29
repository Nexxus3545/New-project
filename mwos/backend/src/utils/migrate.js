require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate({ reset = false, closePool = true } = {}) {
  console.log('Running MWOS migrations...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (reset) {
      console.log('Reset flag detected. Dropping existing tables before rebuild...');
      await client.query(`
        DROP TABLE IF EXISTS
          tele_consult_sessions, conversation_messages, conversation_participants, conversation_threads, care_tasks,
          backup_logs, security_audit, digital_signatures, otp_challenges,
          webauthn_credentials, auth_credentials, audit_logs,
          permission_overrides, role_permissions, license_verification_events,
          staff_registry, notifications, billing, inventory_transactions,
          inventory, education_content,
          immunizations, postpartum_records, prescriptions,
          ultrasounds, lab_results, labor_progress, deliveries,
          vitals, appointments, pregnancies, patients,
          password_reset_tokens, users
        CASCADE;
      `);
      console.log('Existing tables removed');
    } else {
      console.log('Applying schema in safe update mode...');
    }

    const sql = fs.readFileSync(path.join(__dirname, '../config/schema.sql'), 'utf8');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('Migration completed successfully!');
    if (reset) {
      console.log('\nNow run: npm run seed\n');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  const shouldReset = process.argv.includes('--reset');

  migrate({ reset: shouldReset, closePool: true }).catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
