require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  console.log('🔄 Running MWOS migrations...');
  const sql = fs.readFileSync(path.join(__dirname, '../config/schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
