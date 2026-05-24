require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const shouldReset = process.argv.includes('--reset');

async function migrate() {
  console.log('Running MWOS migrations...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (shouldReset) {
      console.log('Reset flag detected. Dropping existing tables before rebuild...');
      await client.query(`
        DROP TABLE IF EXISTS
          backup_logs, audit_logs, notifications, billing,
          inventory_transactions, inventory, education_content,
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
    if (shouldReset) {
      console.log('\nNow run: npm run seed\n');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
