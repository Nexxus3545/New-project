require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seed() {
  console.log('🌱 Seeding MWOS database...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Hash passwords
    const adminHash = await bcrypt.hash('admin1234', 12);
    const staffHash = await bcrypt.hash('password123', 12);
    const patientHash = await bcrypt.hash('patient123', 12);

    // Seed users
    const users = await client.query(`
      INSERT INTO users (email, password, role, first_name, last_name, phone)
      VALUES
        ('admin@tmccopino.com', $1, 'admin', 'System', 'Admin', '09001234567'),
        ('doctor@tmccopino.com', $2, 'doctor', 'Sotera', 'Copino', '09001234568'),
        ('midwife@tmccopino.com', $2, 'midwife', 'Maria', 'Santos', '09001234569'),
        ('nurse@tmccopino.com', $2, 'nurse', 'Ana', 'Reyes', '09001234570'),
        ('patient@example.com', $3, 'patient', 'Joy', 'Dela Cruz', '09001234571'),
        ('ana@example.com', $3, 'patient', 'Ana', 'Magpayo', '09001234572')
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id, email, role
    `, [adminHash, staffHash, patientHash]);

    console.log('✅ Users seeded:', users.rows.length);

    // Get patient user IDs
    const joyUser = users.rows.find(u => u.email === 'patient@example.com');
    const anaUser = users.rows.find(u => u.email === 'ana@example.com');

    // Seed patients
    const patients = await client.query(`
      INSERT INTO patients (
        user_id, first_name, last_name, date_of_birth, civil_status,
        address, city, phone, email, emergency_contact_name,
        emergency_contact_phone, philhealth_id, blood_type,
        allergies, risk_level
      )
      VALUES
        ($1, 'Joy', 'Dela Cruz', '1995-03-15', 'Married',
         '123 Mayon Street', 'Tabaco City', '09001234571', 'patient@example.com',
         'Juan Dela Cruz', '09001234580', 'PH-1234567890', 'A+',
         'None known', 'low'),
        ($2, 'Ana', 'Magpayo', '1992-07-22', 'Married',
         '456 Rizal Avenue', 'Tabaco City', '09001234572', 'ana@example.com',
         'Pedro Magpayo', '09001234581', 'PH-0987654321', 'B+',
         'Penicillin', 'high')
      ON CONFLICT DO NOTHING
      RETURNING id, first_name, last_name
    `, [joyUser?.id, anaUser?.id]);

    console.log('✅ Patients seeded:', patients.rows.length);

    // Seed education content
    await client.query(`
      INSERT INTO education_content (title, category, trimester_target, content)
      VALUES
        ('Prenatal Nutrition Guide', 'nutrition', '1st', 'Proper nutrition during the first trimester is crucial for fetal development. Focus on folic acid, iron, and calcium-rich foods.'),
        ('Warning Signs During Pregnancy', 'safety', 'all', 'Seek immediate medical attention if you experience severe headache, blurred vision, severe abdominal pain, or reduced fetal movement.'),
        ('Preparing for Labor', 'delivery', '3rd', 'As you approach your due date, prepare your birth plan, hospital bag, and make sure your emergency contacts are ready.'),
        ('Postpartum Care Guide', 'postpartum', 'postpartum', 'After delivery, rest as much as possible, eat nutritious meals, and watch for signs of postpartum depression.'),
        ('Newborn Care Basics', 'newborn', 'postpartum', 'Learn how to properly bathe, feed, and care for your newborn. Breastfeeding is recommended for the first 6 months.')
      ON CONFLICT DO NOTHING
    `);

    console.log('✅ Education content seeded');

    // Seed inventory
    await client.query(`
      INSERT INTO inventory (item_name, category, unit, quantity, reorder_level, unit_cost)
      VALUES
        ('Oxytocin 10 IU', 'medication', 'ampule', 50, 10, 25.00),
        ('Misoprostol 200mcg', 'medication', 'tablet', 100, 20, 15.00),
        ('Magnesium Sulfate 500mg', 'medication', 'ampule', 30, 5, 45.00),
        ('Sterile Gloves (M)', 'supplies', 'pair', 200, 50, 8.00),
        ('Sterile Gloves (L)', 'supplies', 'pair', 150, 50, 8.00),
        ('Cord Clamp', 'supplies', 'piece', 100, 20, 12.00),
        ('Suture Vicryl 2-0', 'supplies', 'pack', 40, 10, 85.00),
        ('IV Cannula 18G', 'supplies', 'piece', 80, 20, 25.00),
        ('BP Monitor', 'equipment', 'unit', 3, 1, 2500.00),
        ('Fetoscope', 'equipment', 'unit', 5, 1, 350.00)
      ON CONFLICT DO NOTHING
    `);

    console.log('✅ Inventory seeded');

    await client.query('COMMIT');
    console.log('\n✅ Database seeded successfully!');
    console.log('\n📋 Demo Accounts:');
    console.log('  Admin:    admin@tmccopino.com   / admin1234');
    console.log('  Doctor:   doctor@tmccopino.com  / password123');
    console.log('  Midwife:  midwife@tmccopino.com / password123');
    console.log('  Nurse:    nurse@tmccopino.com   / password123');
    console.log('  Patient:  patient@example.com   / patient123');
    console.log('  Patient:  ana@example.com       / patient123');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
