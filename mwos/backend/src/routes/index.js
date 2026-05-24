const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireOwnPatient } = require('../middleware/auth');
const { activityLogger } = require('../middleware/activityLogger');

// Controllers
const authCtrl = require('../controllers/auth.controller');
const patientCtrl = require('../controllers/patient.controller');
const vitalsCtrl = require('../controllers/vitals.controller');
const apptCtrl = require('../controllers/appointment.controller');
const deliveryCtrl = require('../controllers/delivery.controller');
const reportCtrl = require('../controllers/report.controller');
const notificationCtrl = require('../controllers/notification.controller');
const operationsCtrl = require('../controllers/operations.controller');
const interactionCtrl = require('../controllers/interaction.controller');
const mediaCtrl = require('../controllers/media.controller');
const documentCtrl = require('../controllers/document.controller');
const reviewCtrl = require('../controllers/review.controller');
const medicineCtrl = require('../controllers/medicine.controller');
const aiCtrl = require('../controllers/ai.controller');
const uploadSessionCtrl = require('../controllers/upload.controller');
const { uploadVideo, uploadDocument, uploadMedicineImage } = require('../middleware/uploads');

// ── AUTH ──────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);
router.post('/auth/register', authCtrl.register);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.post('/auth/refresh', authCtrl.refreshToken);
router.post('/auth/logout', authenticate, authCtrl.logout);
router.get('/auth/me', authenticate, authCtrl.getMe);
router.patch('/auth/profile', authenticate, authCtrl.updateProfile);
router.patch('/auth/preferences', authenticate, authCtrl.updatePreferences);
router.patch('/auth/change-password', authenticate, authCtrl.changePassword);

// ── PUBLIC CONTENT ──────────────────────────────────────────────────────────────
router.get('/media-feed/posts', mediaCtrl.list);
router.post('/media-feed/posts/:id/view', mediaCtrl.recordView);
router.get('/reviews/summary', reviewCtrl.getSummary);
router.post('/reviews', reviewCtrl.create);

// Audit/activity logging for state-changing authenticated actions
router.use(authenticate, activityLogger);

router.post('/uploads/sessions', uploadSessionCtrl.createSession);
router.get('/uploads/sessions/:id', uploadSessionCtrl.getSession);
router.put(
  '/uploads/sessions/:id/chunks/:chunkIndex',
  express.raw({ type: 'application/octet-stream', limit: '12mb' }),
  uploadSessionCtrl.uploadChunk
);
router.post('/uploads/sessions/:id/complete', uploadSessionCtrl.completeSession);

// ── DASHBOARD CONTENT & MEDIA ──────────────────────────────────────────────────
router.post('/media-feed/posts', authorize('admin','doctor','midwife'), uploadVideo.single('video'), mediaCtrl.create);

// ── PATIENT DOCUMENTS ──────────────────────────────────────────────────────────
router.get('/documents/my', authorize('patient'), documentCtrl.getMine);
router.post('/documents/my', authorize('patient'), uploadDocument.single('file'), documentCtrl.uploadMine);
router.get('/documents', authorize('admin','doctor','midwife','nurse'), documentCtrl.list);
router.patch('/documents/:id/verify', authorize('admin','doctor','midwife','nurse'), documentCtrl.verify);

// ── MEDICINES ──────────────────────────────────────────────────────────────────
router.get('/medicines', medicineCtrl.getAll);
router.post('/medicines', authorize('admin','doctor','nurse'), uploadMedicineImage.single('image'), medicineCtrl.create);
router.patch('/medicines/:id', authorize('admin','doctor','nurse'), uploadMedicineImage.single('image'), medicineCtrl.update);

// AI
router.get('/ai/recommendations', aiCtrl.getRecommendations);
router.get('/ai/search', aiCtrl.search);

// ── PATIENTS ──────────────────────────────────────────────────
router.get('/patients', authenticate, authorize('admin','doctor','midwife','nurse'), patientCtrl.getAll);
router.post('/patients', authenticate, authorize('admin','doctor','midwife'), patientCtrl.create);
router.get('/patients/me', authenticate, authorize('patient'), patientCtrl.getMe);
router.patch('/patients/me', authenticate, authorize('patient'), patientCtrl.updateMe);
router.get('/patients/:id', authenticate, patientCtrl.getOne);
router.patch('/patients/:id', authenticate, authorize('admin','doctor','midwife'), patientCtrl.update);
router.get('/patients/:id/summary', authenticate, patientCtrl.getSummary);

// ── PREGNANCIES ───────────────────────────────────────────────
const { query } = require('../config/database');

router.get('/pregnancies', authenticate, async (req, res, next) => {
  try {
    const { patientId, status } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (patientId) { conditions.push(`patient_id = $${idx++}`); params.push(patientId); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM pregnancies ${where} ORDER BY created_at DESC`, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/pregnancies', authenticate, authorize('admin','doctor','midwife'), async (req, res, next) => {
  try {
    const { patientId, lmp, edd, gravida, para, abortion, livingChildren, riskLevel, riskFactors, notes } = req.body;
    if (!patientId || !lmp || !edd) {
      return res.status(400).json({ success: false, message: 'Patient ID, LMP, and EDD are required' });
    }
    const result = await query(
      `INSERT INTO pregnancies (patient_id, lmp, edd, gravida, para, abortion, living_children, risk_level, risk_factors, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [patientId, lmp, edd, gravida||1, para||0, abortion||0, livingChildren||0, riskLevel||'low', riskFactors||[], notes||null, req.user.id]
    );
    res.status(201).json({ success: true, message: 'Pregnancy record created', data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── APPOINTMENTS ──────────────────────────────────────────────
router.get('/appointments', authenticate, apptCtrl.getAll);
router.get('/appointments/today', authenticate, authorize('admin','doctor','midwife','nurse'), apptCtrl.getToday);
router.post('/appointments', authenticate, apptCtrl.create);
router.patch('/appointments/:id', authenticate, apptCtrl.update);

// ── VITALS ────────────────────────────────────────────────────
router.post('/vitals', authenticate, authorize('admin','doctor','midwife','nurse'), vitalsCtrl.create);
router.get('/vitals/patient/:patientId', authenticate, vitalsCtrl.getByPatient);
router.get('/vitals/trend/:pregnancyId', authenticate, vitalsCtrl.getTrend);

// ── DELIVERIES ────────────────────────────────────────────────
router.post('/deliveries', authenticate, authorize('admin','doctor','midwife'), deliveryCtrl.create);
router.get('/deliveries/patient/:patientId', authenticate, deliveryCtrl.getByPatient);
router.post('/deliveries/:deliveryId/labor-progress', authenticate, authorize('admin','doctor','midwife'), deliveryCtrl.addLaborProgress);
router.get('/deliveries/:deliveryId/labor-progress', authenticate, deliveryCtrl.getLaborProgress);

// ── EMR: Labs, Ultrasounds, Prescriptions ─────────────────────
router.get('/emr/labs/:patientId', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM lab_results WHERE patient_id = $1 ORDER BY test_date DESC', [req.params.patientId]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/emr/labs', authenticate, authorize('admin','doctor','nurse'), async (req, res, next) => {
  try {
    const { patientId, pregnancyId, testName, testDate, resultValue, unit, referenceRange, status, notes } = req.body;
    if (!patientId || !testName || !testDate) {
      return res.status(400).json({ success: false, message: 'Patient ID, test name, and test date are required' });
    }
    const result = await query(
      `INSERT INTO lab_results (patient_id, pregnancy_id, test_name, test_date, result_value, unit, reference_range, status, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [patientId, pregnancyId||null, testName, testDate, resultValue||null, unit||null, referenceRange||null, status||'normal', notes||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

router.get('/emr/ultrasounds/:patientId', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM ultrasounds WHERE patient_id = $1 ORDER BY scan_date DESC', [req.params.patientId]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/emr/ultrasounds', authenticate, authorize('admin','doctor'), async (req, res, next) => {
  try {
    const { patientId, pregnancyId, scanDate, gestationalAgeWeeks, findings, placentaLocation, amnioticFluid } = req.body;
    if (!patientId || !scanDate) {
      return res.status(400).json({ success: false, message: 'Patient ID and scan date are required' });
    }
    const result = await query(
      `INSERT INTO ultrasounds (patient_id, pregnancy_id, scan_date, gestational_age_weeks, findings, placenta_location, amniotic_fluid, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patientId, pregnancyId||null, scanDate, gestationalAgeWeeks||null, findings||null, placentaLocation||null, amnioticFluid||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

router.get('/emr/prescriptions/:patientId', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT pr.*, u.first_name || ' ' || u.last_name as prescribed_by_name
       FROM prescriptions pr LEFT JOIN users u ON u.id = pr.prescribed_by
       WHERE pr.patient_id = $1 ORDER BY pr.prescribed_date DESC`,
      [req.params.patientId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/emr/prescriptions', authenticate, authorize('admin','doctor'), async (req, res, next) => {
  try {
    const { patientId, pregnancyId, medicationName, dosage, frequency, route, duration, instructions } = req.body;
    if (!patientId || !medicationName) {
      return res.status(400).json({ success: false, message: 'Patient ID and medication name are required' });
    }
    const result = await query(
      `INSERT INTO prescriptions (patient_id, pregnancy_id, medication_name, dosage, frequency, route, duration, instructions, prescribed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [patientId, pregnancyId||null, medicationName, dosage||null, frequency||null, route||null, duration||null, instructions||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POSTPARTUM ────────────────────────────────────────────────
router.get('/postpartum/:patientId', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM postpartum_records WHERE patient_id = $1 ORDER BY visit_date DESC', [req.params.patientId]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/postpartum', authenticate, authorize('admin','doctor','midwife'), async (req, res, next) => {
  try {
    const { patientId, deliveryId, visitDate, daysPostpartum, bpSystolic, bpDiastolic, temperature, woundStatus, lochia, breastfeedingStatus, emotionalStatus, notes } = req.body;
    if (!patientId || !deliveryId || !visitDate) {
      return res.status(400).json({ success: false, message: 'Patient ID, delivery ID, and visit date are required' });
    }
    const result = await query(
      `INSERT INTO postpartum_records (patient_id, delivery_id, visit_date, days_postpartum, bp_systolic, bp_diastolic, temperature, wound_status, lochia, breastfeeding_status, emotional_status, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [patientId, deliveryId, visitDate, daysPostpartum||null, bpSystolic||null, bpDiastolic||null, temperature||null, woundStatus||null, lochia||null, breastfeedingStatus||null, emotionalStatus||null, notes||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── IMMUNIZATIONS ─────────────────────────────────────────────
router.get('/immunizations/:patientId', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM immunizations WHERE patient_id = $1 ORDER BY date_given DESC', [req.params.patientId]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/immunizations', authenticate, authorize('admin','doctor','midwife','nurse'), async (req, res, next) => {
  try {
    const { patientId, deliveryId, vaccineName, doseNumber, dateGiven, dueDate, notes } = req.body;
    if (!patientId || !vaccineName || !dateGiven) {
      return res.status(400).json({ success: false, message: 'Patient ID, vaccine name, and date given are required' });
    }
    const result = await query(
      `INSERT INTO immunizations (patient_id, delivery_id, vaccine_name, dose_number, date_given, due_date, notes, given_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patientId, deliveryId||null, vaccineName, doseNumber||1, dateGiven, dueDate||null, notes||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── BILLING ───────────────────────────────────────────────────
router.get('/billing', authenticate, authorize('admin','doctor'), async (req, res, next) => {
  try {
    const { patientId, status } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (patientId) { conditions.push(`b.patient_id = $${idx++}`); params.push(patientId); }
    if (status) { conditions.push(`b.payment_status = $${idx++}`); params.push(status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT b.*, p.first_name || ' ' || p.last_name as patient_name
       FROM billing b LEFT JOIN patients p ON p.id = b.patient_id
       ${where} ORDER BY b.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/billing', authenticate, authorize('admin','doctor'), async (req, res, next) => {
  try {
    const { patientId, deliveryId, serviceType, amount, discount, paymentMethod, philhealthClaimNo, philhealthAmount, notes } = req.body;
    if (!patientId || !amount) {
      return res.status(400).json({ success: false, message: 'Patient ID and amount are required' });
    }
    const disc = parseFloat(discount || 0);
    const total = parseFloat(amount) - disc;
    const result = await query(
      `INSERT INTO billing (patient_id, delivery_id, service_type, amount, discount, total_amount, payment_method, philhealth_claim_no, philhealth_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [patientId, deliveryId||null, serviceType||null, amount, disc, total, paymentMethod||null, philhealthClaimNo||null, philhealthAmount||0, notes||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/billing/:id/pay', authenticate, authorize('admin','doctor'), async (req, res, next) => {
  try {
    const { paymentMethod, amount } = req.body;
    const bill = await query('SELECT * FROM billing WHERE id = $1', [req.params.id]);
    if (bill.rows.length === 0) return res.status(404).json({ success: false, message: 'Bill not found' });
    const newStatus = parseFloat(amount) >= parseFloat(bill.rows[0].total_amount) ? 'paid' : 'partial';
    const result = await query(
      `UPDATE billing SET payment_status = $1, payment_method = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newStatus, paymentMethod, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── INVENTORY ─────────────────────────────────────────────────
router.get('/inventory', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM inventory ORDER BY category, item_name');
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/inventory', authenticate, authorize('admin','nurse'), async (req, res, next) => {
  try {
    const { itemName, category, unit, quantity, reorderLevel, expiryDate, supplier, unitCost, notes } = req.body;
    if (!itemName) return res.status(400).json({ success: false, message: 'Item name is required' });
    const result = await query(
      `INSERT INTO inventory (item_name, category, unit, quantity, reorder_level, expiry_date, supplier, unit_cost, notes, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [itemName, category||null, unit||null, quantity||0, reorderLevel||10, expiryDate||null, supplier||null, unitCost||null, notes||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/inventory/:id/adjust', authenticate, authorize('admin','nurse'), async (req, res, next) => {
  try {
    const { adjustment, notes } = req.body;
    if (!adjustment) return res.status(400).json({ success: false, message: 'Adjustment amount is required' });
    const result = await query(
      `UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
      [parseInt(adjustment), req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── EDUCATION ─────────────────────────────────────────────────
router.get('/education', authenticate, async (req, res, next) => {
  try {
    const { category, trimester } = req.query;
    const conditions = ["is_published = true"];
    const params = [];
    let idx = 1;
    if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (trimester) { conditions.push(`(trimester_target = $${idx++} OR trimester_target = 'all')`); params.push(trimester); }
    const result = await query(`SELECT * FROM education_content WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/education', authenticate, authorize('admin','doctor','midwife'), async (req, res, next) => {
  try {
    const { title, category, trimesterTarget, content, mediaUrl } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required' });
    const result = await query(
      `INSERT INTO education_content (title, category, trimester_target, content, media_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, category||null, trimesterTarget||'all', content, mediaUrl||null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── REPORTS ───────────────────────────────────────────────────
router.get('/reports/dashboard', authenticate, authorize('admin','doctor','midwife','nurse'), reportCtrl.getDashboard);
router.get('/reports/patient-dashboard', authenticate, authorize('patient'), reportCtrl.getPatientDashboard);
router.get('/reports/births/monthly', authenticate, authorize('admin','doctor'), reportCtrl.getBirthsMonthly);
router.get('/reports/audit-logs', authenticate, authorize('admin'), reportCtrl.getAuditLogs);

// ── USERS (admin) ─────────────────────────────────────────────
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { search, role, status } = req.query;
    const params = [];
    const conditions = [];
    let idx = 1;

    if (search) {
      conditions.push(`(
        u.first_name ILIKE $${idx}
        OR u.last_name ILIKE $${idx}
        OR u.email ILIKE $${idx}
        OR COALESCE(u.phone, '') ILIKE $${idx}
      )`);
      params.push(`%${String(search).trim()}%`);
      idx += 1;
    }

    if (role) {
      conditions.push(`u.role = $${idx}`);
      params.push(role);
      idx += 1;
    }

    if (status === 'active') {
      conditions.push('u.is_active = true');
    } else if (status === 'inactive') {
      conditions.push('u.is_active = false');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.first_name,
         u.last_name,
         u.phone,
         u.is_active,
         u.created_at,
         u.last_login_at,
         u.last_seen_at,
         CASE
           WHEN u.is_active = false THEN 'inactive'
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '5 minutes' THEN 'online'
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '60 minutes' THEN 'recent'
           ELSE 'offline'
         END AS activity_status
       FROM users u
       ${whereClause}
       ORDER BY
         CASE
           WHEN u.is_active = false THEN 4
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '5 minutes' THEN 1
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '60 minutes' THEN 2
           ELSE 3
         END,
         u.role,
         u.last_name,
         u.first_name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.patch('/users/:id/toggle', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, email, role, is_active',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get('/notifications', authenticate, notificationCtrl.getMine);
router.patch('/notifications/:id/read', authenticate, notificationCtrl.markRead);
router.post('/notifications', authenticate, authorize('admin','doctor','midwife','nurse'), notificationCtrl.create);

// ── INTERACTION CENTER ────────────────────────────────────────────────────────
router.get('/interactions/directory', authenticate, interactionCtrl.getDirectory);
router.get('/interactions/threads', authenticate, interactionCtrl.getThreads);
router.post('/interactions/threads', authenticate, interactionCtrl.createThread);
router.get('/interactions/threads/:id', authenticate, interactionCtrl.getThreadById);
router.post('/interactions/threads/:id/messages', authenticate, interactionCtrl.addMessage);
router.patch('/interactions/threads/:id/read', authenticate, interactionCtrl.markThreadRead);
router.get('/interactions/tasks', authenticate, interactionCtrl.getTasks);
router.post('/interactions/tasks', authenticate, interactionCtrl.createTask);
router.patch('/interactions/tasks/:id', authenticate, interactionCtrl.updateTask);

// ── OPERATIONS (backup & restore) ─────────────────────────────────────────────
router.post('/admin/backup', authenticate, authorize('admin'), operationsCtrl.createBackup);
router.post('/admin/restore', authenticate, authorize('admin'), operationsCtrl.restoreBackup);
router.get('/admin/backup-logs', authenticate, authorize('admin'), operationsCtrl.getBackupLogs);

module.exports = router;

