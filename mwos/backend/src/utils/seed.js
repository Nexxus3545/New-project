require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { ROLE_PERMISSION_MATRIX } = require('../config/permissions');
const { recordLicenseEvent, upsertStaffRegistry } = require('./staff');

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
    const adminUser = users.rows.find(u => u.email === 'admin@tmccopino.com');
    const doctorUser = users.rows.find(u => u.email === 'doctor@tmccopino.com');
    const midwifeUser = users.rows.find(u => u.email === 'midwife@tmccopino.com');
    const nurseUser = users.rows.find(u => u.email === 'nurse@tmccopino.com');
    const joyUser = users.rows.find(u => u.email === 'patient@example.com');
    const anaUser = users.rows.find(u => u.email === 'ana@example.com');

    const rolePermissionRows = Object.entries(ROLE_PERMISSION_MATRIX).flatMap(([role, permissions]) => (
      permissions.map((permissionKey) => [role, permissionKey, true])
    ));

    if (rolePermissionRows.length > 0) {
      const placeholders = rolePermissionRows.map((_, index) => {
        const offset = index * 3;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      }).join(', ');

      await client.query(
        `INSERT INTO role_permissions (role, permission_key, is_allowed)
         VALUES ${placeholders}
         ON CONFLICT (role, permission_key) DO UPDATE SET is_allowed = EXCLUDED.is_allowed`,
        rolePermissionRows.flat()
      );
    }

    const staffSeeds = [
      {
        userId: adminUser?.id,
        title: 'Clinic Administrator',
        department: 'Administration',
        licenseNumber: 'TMC-ADM-0001',
        licenseType: 'Administrative clearance',
        status: 'verified',
        notes: 'System administration and compliance oversight.',
      },
      {
        userId: doctorUser?.id,
        title: 'Doctor',
        department: 'Obstetrics and Gynecology',
        licenseNumber: 'LIC-DR-2026-0001',
        licenseType: 'Professional license',
        status: 'verified',
        notes: 'Licensed physician responsible for prenatal and delivery oversight.',
      },
      {
        userId: midwifeUser?.id,
        title: 'Midwife',
        department: 'Maternal Care',
        licenseNumber: 'LIC-MW-2026-0001',
        licenseType: 'Professional license',
        status: 'verified',
        notes: 'Licensed midwife assigned to prenatal and labor support.',
      },
      {
        userId: nurseUser?.id,
        title: 'Nurse',
        department: 'Maternal Nursing',
        licenseNumber: 'LIC-NR-2026-0001',
        licenseType: 'Professional license',
        status: 'verified',
        notes: 'Licensed nurse assigned to monitoring and inventory support.',
      },
    ];

    for (const staffSeed of staffSeeds) {
      if (!staffSeed.userId) continue;

      const staffProfile = await upsertStaffRegistry({
        client,
        userId: staffSeed.userId,
        professionalTitle: staffSeed.title,
        department: staffSeed.department,
        licenseNumber: staffSeed.licenseNumber,
        licenseType: staffSeed.licenseType,
        licenseStatus: staffSeed.status,
        credentialNotes: staffSeed.notes,
        verifiedBy: adminUser?.id || staffSeed.userId,
        verifiedAt: staffSeed.status === 'verified' ? new Date() : null,
        lastReviewedAt: new Date(),
      });

      await recordLicenseEvent({
        client,
        staffId: staffProfile.staffId,
        eventType: staffSeed.status === 'verified' ? 'verified' : 'created',
        previousStatus: null,
        nextStatus: staffSeed.status,
        notes: staffSeed.notes,
        performedBy: adminUser?.id || staffSeed.userId,
      });
    }

    // Seed patients
    const patients = await client.query(`
      INSERT INTO patients (
        user_id, patient_code, birthing_id, first_name, middle_name, last_name, suffix, date_of_birth, civil_status,
        occupation, place_of_birth, address, barangay, city, province, postal_code, phone, email,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation, philhealth_id, philhealth_type,
        valid_id_type, valid_id_number, pregnancy_booklet_number, blood_type, biometric_height_cm,
        biometric_weight_kg, biometric_bmi, allergies, risk_level, credential_notes
      )
      VALUES
        ($1, 'MWOS-PAT-DEMO-0001', 'TMC-BIR-DEMO-0001', 'Joy', 'Marie', 'Dela Cruz', NULL, '1995-03-15', 'Married',
         'Teacher', 'Tabaco City', '123 Mayon Street', 'San Roque', 'Tabaco City', 'Albay', '4511', '09001234571', 'patient@example.com',
         'Juan Dela Cruz', '09001234580', 'Spouse', 'PH-1234567890', 'Member', 'PhilSys', 'ID-00012345', 'PB-2026-001', 'A+',
         158.00, 56.50, 22.63, 'None known', 'low', 'Initial birthing and insurance credentials verified.'),
        ($2, 'MWOS-PAT-DEMO-0002', 'TMC-BIR-DEMO-0002', 'Ana', 'Lopez', 'Magpayo', NULL, '1992-07-22', 'Married',
         'Vendor', 'Legazpi City', '456 Rizal Avenue', 'Santo Cristo', 'Tabaco City', 'Albay', '4511', '09001234572', 'ana@example.com',
         'Pedro Magpayo', '09001234581', 'Spouse', 'PH-0987654321', 'Dependent', 'Driver License', 'N01-12-345678', 'PB-2026-002', 'B+',
         154.00, 62.00, 26.14, 'Penicillin', 'high', 'High-risk chart flagged for allergy and previous elevated BP.')
      ON CONFLICT DO NOTHING
      RETURNING id, first_name, last_name
    `, [joyUser?.id, anaUser?.id]);

    console.log('✅ Patients seeded:', patients.rows.length);

    await client.query(`
      UPDATE patients
      SET patient_code = COALESCE(patient_code, 'MWOS-PAT-DEMO-0001'),
          birthing_id = COALESCE(birthing_id, 'TMC-BIR-DEMO-0001'),
          middle_name = COALESCE(middle_name, 'Marie'),
          occupation = COALESCE(occupation, 'Teacher'),
          place_of_birth = COALESCE(place_of_birth, 'Tabaco City'),
          barangay = COALESCE(barangay, 'San Roque'),
          province = COALESCE(province, 'Albay'),
          postal_code = COALESCE(postal_code, '4511'),
          emergency_contact_relation = COALESCE(emergency_contact_relation, 'Spouse'),
          philhealth_type = COALESCE(philhealth_type, 'Member'),
          valid_id_type = COALESCE(valid_id_type, 'PhilSys'),
          valid_id_number = COALESCE(valid_id_number, 'ID-00012345'),
          pregnancy_booklet_number = COALESCE(pregnancy_booklet_number, 'PB-2026-001'),
          biometric_height_cm = COALESCE(biometric_height_cm, 158.00),
          biometric_weight_kg = COALESCE(biometric_weight_kg, 56.50),
          biometric_bmi = COALESCE(biometric_bmi, 22.63),
          credential_notes = COALESCE(credential_notes, 'Initial birthing and insurance credentials verified.'),
          updated_at = NOW()
      WHERE email = 'patient@example.com'
    `);

    await client.query(`
      UPDATE patients
      SET patient_code = COALESCE(patient_code, 'MWOS-PAT-DEMO-0002'),
          birthing_id = COALESCE(birthing_id, 'TMC-BIR-DEMO-0002'),
          middle_name = COALESCE(middle_name, 'Lopez'),
          occupation = COALESCE(occupation, 'Vendor'),
          place_of_birth = COALESCE(place_of_birth, 'Legazpi City'),
          barangay = COALESCE(barangay, 'Santo Cristo'),
          province = COALESCE(province, 'Albay'),
          postal_code = COALESCE(postal_code, '4511'),
          emergency_contact_relation = COALESCE(emergency_contact_relation, 'Spouse'),
          philhealth_type = COALESCE(philhealth_type, 'Dependent'),
          valid_id_type = COALESCE(valid_id_type, 'Driver License'),
          valid_id_number = COALESCE(valid_id_number, 'N01-12-345678'),
          pregnancy_booklet_number = COALESCE(pregnancy_booklet_number, 'PB-2026-002'),
          biometric_height_cm = COALESCE(biometric_height_cm, 154.00),
          biometric_weight_kg = COALESCE(biometric_weight_kg, 62.00),
          biometric_bmi = COALESCE(biometric_bmi, 26.14),
          credential_notes = COALESCE(credential_notes, 'High-risk chart flagged for allergy and previous elevated BP.'),
          updated_at = NOW()
      WHERE email = 'ana@example.com'
    `);

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

    await client.query(`
      INSERT INTO media_feed_posts (title, description, video_url, thumbnail_url, category, is_published, created_by)
      SELECT * FROM (
        VALUES
          ('Hydration reminder for expecting mothers', 'Quick wellness reminder focused on hydration, rest, and warning signs during hot days.', 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', NULL::text, 'health-tip', true, $1::uuid),
          ('Clinic announcement: updated prenatal hours', 'Short guide about adjusted clinic schedules and where to message the care team for rebooking.', 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', NULL::text, 'announcement', true, $2::uuid)
      ) AS seed(title, description, video_url, thumbnail_url, category, is_published, created_by)
      WHERE NOT EXISTS (
        SELECT 1 FROM media_feed_posts existing WHERE existing.title = seed.title
      )
    `, [doctorUser?.id || adminUser?.id, adminUser?.id]);

    console.log('✅ Media feed seeded');

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

    await client.query(`
      UPDATE inventory
      SET description = CASE item_name
            WHEN 'Oxytocin 10 IU' THEN 'Uterotonic medication used for labor induction and postpartum hemorrhage prevention.'
            WHEN 'Misoprostol 200mcg' THEN 'Prostaglandin medication used for cervical ripening and postpartum care.'
            ELSE description
          END,
          dosage = CASE item_name
            WHEN 'Oxytocin 10 IU' THEN '10 IU per ampule'
            WHEN 'Misoprostol 200mcg' THEN '200 mcg tablet'
            ELSE dosage
          END,
          availability_status = CASE
            WHEN quantity <= 0 THEN 'out_of_stock'
            WHEN quantity <= reorder_level THEN 'limited'
            ELSE 'available'
          END,
          updated_at = NOW()
      WHERE category = 'medication'
    `);

    console.log('✅ Medicine catalog seeded');

    const joyPatient = patients.rows.find((p) => p.first_name === 'Joy') || (
      await client.query("SELECT id, first_name, last_name FROM patients WHERE email = 'patient@example.com' LIMIT 1")
    ).rows[0];
    const anaPatient = patients.rows.find((p) => p.first_name === 'Ana') || (
      await client.query("SELECT id, first_name, last_name FROM patients WHERE email = 'ana@example.com' LIMIT 1")
    ).rows[0];

    // Seed interaction threads
    const careTeamThread = await client.query(`
      INSERT INTO conversation_threads (thread_type, title, patient_id, created_by, priority, status)
      VALUES ('care_team', 'Joy Dela Cruz prenatal case review', $1, $2, 'high', 'open')
      RETURNING id
    `, [joyPatient?.id, doctorUser?.id || adminUser?.id]);

    const supportThread = await client.query(`
      INSERT INTO conversation_threads (thread_type, title, patient_id, created_by, priority, status)
      VALUES ('patient_support', 'Patient support request - Joy', $1, $2, 'normal', 'open')
      RETURNING id
    `, [joyPatient?.id, joyUser?.id]);

    const careParticipants = [doctorUser?.id, midwifeUser?.id, nurseUser?.id].filter(Boolean);
    for (const participantId of careParticipants) {
      await client.query(
        `INSERT INTO conversation_participants (thread_id, user_id, last_read_at)
         VALUES ($1, $2, NOW())`,
        [careTeamThread.rows[0].id, participantId]
      );
    }

    const supportParticipants = [joyUser?.id, midwifeUser?.id, doctorUser?.id, nurseUser?.id].filter(Boolean);
    for (const participantId of supportParticipants) {
      const lastReadAt = participantId === joyUser?.id ? new Date() : null;
      await client.query(
        `INSERT INTO conversation_participants (thread_id, user_id, last_read_at)
         VALUES ($1, $2, $3)`,
        [supportThread.rows[0].id, participantId, lastReadAt]
      );
    }

    await client.query(`
      INSERT INTO conversation_messages (thread_id, sender_id, body, message_type)
      VALUES
        ($1, $2, 'Patient blood pressure trend is stable, but we need a nurse follow-up before the next prenatal visit.', 'comment'),
        ($1, $3, 'I will prepare the follow-up checklist and confirm medication adherence tomorrow morning.', 'handoff'),
        ($6, $4, 'Good evening, I would like to ask if my next appointment can be moved earlier because I have transportation issues.', 'comment'),
        ($6, $5, 'We received your request. The midwife and doctor will review the schedule and reply here.', 'comment')
    `, [
      careTeamThread.rows[0].id,
      doctorUser?.id,
      nurseUser?.id,
      joyUser?.id,
      midwifeUser?.id || doctorUser?.id,
      supportThread.rows[0].id,
    ]);

    await client.query(`
      UPDATE conversation_threads
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id IN ($1, $2)
    `, [careTeamThread.rows[0].id, supportThread.rows[0].id]);

    console.log('✅ Interaction threads seeded');

    // Seed care tasks
    await client.query(`
      INSERT INTO care_tasks (
        title, description, patient_id, thread_id, assigned_to, created_by,
        status, priority, due_date, patient_visible, acknowledged_at
      )
      VALUES
        (
          'Recheck Joy prenatal vitals',
          'Repeat blood pressure and fetal heart monitoring before the end of the day.',
          $1, $2, $3, $4,
          'open', 'high', CURRENT_DATE + INTERVAL '1 day', false, NOW()
        ),
        (
          'Prepare appointment documents',
          'Bring your previous lab results and PhilHealth documents to the next visit.',
          $1, $5, $6, $7,
          'open', 'normal', CURRENT_DATE + INTERVAL '2 day', true, NOW()
        ),
        (
          'Review Ana high-risk case',
          'Doctor review requested for allergy and risk profile before referral planning.',
          $8, NULL, $9, $10,
          'in_progress', 'urgent', CURRENT_DATE + INTERVAL '1 day', false, NOW()
        )
    `, [
      joyPatient?.id,
      careTeamThread.rows[0].id,
      nurseUser?.id,
      midwifeUser?.id || doctorUser?.id,
      supportThread.rows[0].id,
      joyUser?.id,
      midwifeUser?.id || adminUser?.id,
      anaPatient?.id,
      doctorUser?.id,
      adminUser?.id || midwifeUser?.id,
    ]);

    console.log('✅ Care tasks seeded');

    await client.query(`
      INSERT INTO patient_documents (patient_id, uploaded_by, document_type, original_name, file_url, verification_status, verification_notes, verified_by, verified_at)
      SELECT * FROM (
        VALUES
          ($1::uuid, $2::uuid, 'PhilHealth ID', 'joy-philhealth.pdf', 'https://example.com/documents/joy-philhealth.pdf', 'verified', 'Verified against submitted member details.', $3::uuid, NOW()),
          ($4::uuid, $5::uuid, 'Birthing ID', 'ana-birthing-id.jpg', 'https://example.com/documents/ana-birthing-id.jpg', 'pending', 'Awaiting final review from staff.', NULL::uuid, NULL::timestamptz)
      ) AS seed(patient_id, uploaded_by, document_type, original_name, file_url, verification_status, verification_notes, verified_by, verified_at)
      WHERE NOT EXISTS (
        SELECT 1
        FROM patient_documents existing
        WHERE existing.patient_id = seed.patient_id
          AND existing.document_type = seed.document_type
          AND existing.original_name = seed.original_name
      )
    `, [
      joyPatient?.id,
      joyUser?.id,
      midwifeUser?.id || adminUser?.id,
      anaPatient?.id,
      anaUser?.id,
    ]);

    console.log('✅ Patient documents seeded');

    await client.query(`
      INSERT INTO reviews (user_id, display_name, role_label, rating, comment, is_published)
      SELECT * FROM (
        VALUES
          ($1::uuid, 'Joy Dela Cruz', 'Patient', 5, 'The staff were kind, the reminders were helpful, and the portal felt easy to use.', true),
          ($2::uuid, 'Ana Magpayo', 'Patient', 4, 'Document uploads and appointment updates saved us time during follow-up visits.', true),
          ($3::uuid, 'Sotera Copino', 'Doctor', 5, 'Care coordination and risk monitoring are much easier with the shared dashboard.', true)
      ) AS seed(user_id, display_name, role_label, rating, comment, is_published)
      WHERE NOT EXISTS (
        SELECT 1 FROM reviews existing
        WHERE existing.display_name = seed.display_name
          AND existing.comment = seed.comment
      )
    `, [joyUser?.id, anaUser?.id, doctorUser?.id]);

    console.log('✅ Reviews seeded');

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
