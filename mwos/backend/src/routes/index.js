const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireOwnPatient } = require('../middleware/auth');
const { activityLogger } = require('../middleware/activityLogger');
const { authorizePermission } = require('../middleware/permissions');
const { requireStepUp } = require('../middleware/stepUp');
const { requireCurrentProfessionalCredential, isCredentialSelfServiceRoute } = require('../middleware/professionalCredential');

// Controllers
const authCtrl = require('../controllers/auth.controller');
const accountCtrl = require('../controllers/account.controller');
const accountSecurity = require('../controllers/accountSecurity.controller');
const credentialCtrl = require('../controllers/credential.controller');
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
const staffCtrl = require('../controllers/staff.controller');
const staffDocumentCtrl = require('../controllers/staffDocument.controller');
const requirementsCtrl = require('../controllers/requirements.controller');
const emergencyLocationCtrl = require('../controllers/emergencyLocation.controller');
const securityCtrl = require('../controllers/security.controller');
const { uploadVideo, uploadDocument, uploadMedicineImage } = require('../middleware/uploads');
const { signClinicalRecord } = require('../utils/security');
const clinical = require('../controllers/clinicalWorkflow.controller');
const billingWorkflow = require('../controllers/billingWorkflow.controller');
const coordination = require('../controllers/coordinationWorkflow.controller');
const workflowValidation = require('../utils/workflowValidation');
const educationWorkflow = require('../controllers/educationWorkflow.controller');
const { ownLinkedRecord, ownPatientQuery } = require('../middleware/recordScope');
const oauthCtrl = require('../controllers/oauth.controller');
const { passport } = require('../config/oauth');

// ── AUTH ──────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);
// SMS is reserved for verified contacts/recovery, not public passwordless sign-in.
router.post(['/auth/sms-login/request', '/auth/sms-login/verify'], (_req, res) =>
  res.status(410).json({ success: false, message: 'SMS sign-in is no longer offered. Sign in with Google or your clinic account.' })
);
router.post('/auth/register', authCtrl.register);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.post('/account/reactivate/request', accountSecurity.requestCode);
router.post('/account/reactivate/confirm', accountSecurity.confirm);
router.post('/auth/refresh', authCtrl.refreshToken);
router.post('/auth/logout', authenticate, authCtrl.logout);
router.get('/auth/me', authenticate, authCtrl.getMe);
router.patch('/auth/profile', authenticate, authCtrl.updateProfile);
router.patch('/auth/preferences', authenticate, authCtrl.updatePreferences);
router.patch('/auth/change-password', authenticate, authCtrl.changePassword);
router.post('/auth/otp/request', authenticate, authorize('admin','doctor','midwife','nurse'), securityCtrl.requestOtp);
router.post('/auth/otp/verify', authenticate, authorize('admin','doctor','midwife','nurse'), securityCtrl.verifyOtp);
router.post('/auth/webauthn/register/start', authenticate, authorize('admin','doctor','midwife','nurse'), securityCtrl.startWebAuthnRegistration);
router.post('/auth/webauthn/register/finish', authenticate, authorize('admin','doctor','midwife','nurse'), securityCtrl.finishWebAuthnRegistration);
router.post('/auth/webauthn/login/start', securityCtrl.startWebAuthnLogin);
router.post('/auth/webauthn/login/finish', securityCtrl.finishWebAuthnLogin);
router.get('/auth/providers', oauthCtrl.providerStatus);
router.get('/auth/google', oauthCtrl.start('google', passport));
router.get('/auth/google/callback', oauthCtrl.ensureConfigured('google'), oauthCtrl.validateState('google'), oauthCtrl.callback('google', passport));
router.get('/auth/facebook', oauthCtrl.start('facebook', passport));
router.get('/auth/facebook/callback', oauthCtrl.ensureConfigured('facebook'), oauthCtrl.validateState('facebook'), oauthCtrl.callback('facebook', passport));
router.post('/auth/oauth/exchange', oauthCtrl.exchange);
router.post('/auth/oauth/complete-profile', authenticate, authorize('patient'), oauthCtrl.completePatientProfile);

// ── PUBLIC CONTENT ──────────────────────────────────────────────────────────────
router.get('/media-feed/posts', mediaCtrl.list);
router.post('/media-feed/posts/:id/view', mediaCtrl.recordView);
router.get('/reviews/summary', reviewCtrl.getSummary);
router.post('/reviews', reviewCtrl.create);

// Audit/activity logging for state-changing authenticated actions
router.use(authenticate, activityLogger);

// Onboarding remains accessible while clinical credentials await review.
router.get('/credentials/mine', credentialCtrl.getMine);
router.post('/credentials/mine', credentialCtrl.submitMine);
router.post('/credentials/mine/scan', credentialCtrl.scanMine);
router.get('/credentials/mine/document', credentialCtrl.downloadMine);
router.get('/credentials/users/:userId', authorize('admin'), credentialCtrl.getForUser);
router.post('/credentials/users/:userId', authorize('admin'), requireStepUp('license-change'), credentialCtrl.submitForUser);
router.post('/credentials/users/:userId/scan', authorize('admin'), requireStepUp('license-change'), credentialCtrl.scanForUser);
router.get('/credentials/users/:userId/document', authorize('admin'), credentialCtrl.downloadForUser);
router.patch('/credentials/users/:userId/review', authorize('admin'), requireStepUp('license-change'), credentialCtrl.reviewForUser);
router.use((req, res, next) => {
  if (isCredentialSelfServiceRoute(req)) return next();
  return requireCurrentProfessionalCredential(req, res, next);
});

router.get('/account/activity', accountCtrl.getActivity);
router.get('/account/security', accountSecurity.status);
router.post('/account/security/request', accountSecurity.requestCode);
router.post('/account/security/confirm', accountSecurity.confirm);
router.get('/account/deletion-requests', authorize('admin'), accountSecurity.deletionQueue);

router.post('/uploads/sessions', uploadSessionCtrl.createSession);
router.get('/uploads/sessions/:id', uploadSessionCtrl.getSession);
router.put(
  '/uploads/sessions/:id/chunks/:chunkIndex',
  express.raw({ type: 'application/octet-stream', limit: '12mb' }),
  uploadSessionCtrl.uploadChunk
);
router.post('/uploads/sessions/:id/complete', uploadSessionCtrl.completeSession);
router.post('/security/sign', authenticate, authorize('admin','doctor','midwife','nurse'), requireStepUp('critical'), securityCtrl.signEntity);
router.get('/security/signatures/:entityType/:entityId', authenticate, authorize('admin','doctor','midwife','nurse'), securityCtrl.getSignatures);
router.get('/security/audit', authenticate, authorize('admin'), securityCtrl.getAudit);
router.get('/security/audit/summary', authenticate, authorize('admin'), securityCtrl.getAuditSummary);
router.get('/security/audit/:staffId', authenticate, authorize('admin'), securityCtrl.getAudit);

// ── DASHBOARD CONTENT & MEDIA ──────────────────────────────────────────────────
router.post('/media-feed/posts', authenticate, authorizePermission('content:media:write'), uploadVideo.single('video'), mediaCtrl.create);

// ── PATIENT DOCUMENTS ──────────────────────────────────────────────────────────
router.get('/documents/my', authorize('patient'), documentCtrl.getMine);
router.post('/documents/my', authorize('patient'), uploadDocument.single('file'), documentCtrl.uploadMine);
router.get('/documents', authorize('admin','doctor','midwife','nurse'), documentCtrl.list);
router.patch('/documents/:id/verify', authenticate, authorizePermission('clinical:documents:review'), documentCtrl.verify);

// ── PATIENT SERVICE REQUIREMENTS ───────────────────────────────────────────────
router.get('/requirements/services', authorize('admin','doctor','midwife','nurse','patient'), requirementsCtrl.listServices);
router.post('/requirements/services', authorize('admin'), requirementsCtrl.upsertServiceRequirement);
router.get('/requirements/my', authorize('patient'), requirementsCtrl.getMine);
router.post('/requirements/my/:requirementId/submit', authorize('patient'), requirementsCtrl.submitMine);
router.get('/requirements/patient/:patientId', authorize('admin','doctor','midwife','nurse'), requirementsCtrl.getByPatient);
router.patch('/requirements/submissions/:id/review', authorizePermission('clinical:documents:review'), requirementsCtrl.reviewSubmission);

// ── CONSENT-BASED EMERGENCY LOCATION SHARING ───────────────────────────────────
router.get('/emergency/location/me', authorize('patient'), emergencyLocationCtrl.getMine);
router.post('/emergency/location', authorize('patient'), emergencyLocationCtrl.shareMine);
router.delete('/emergency/location', authorize('patient'), emergencyLocationCtrl.stopSharingMine);
router.get('/emergency/locations', authorize('admin','doctor','midwife','nurse'), emergencyLocationCtrl.listActive);

// ── MEDICINES ──────────────────────────────────────────────────────────────────
router.get('/medicines', medicineCtrl.getAll);
router.post('/medicines', authenticate, authorizePermission('pharmacy:write'), uploadMedicineImage.single('image'), medicineCtrl.create);
router.patch('/medicines/:id', authenticate, authorizePermission('pharmacy:write'), uploadMedicineImage.single('image'), medicineCtrl.update);

// AI
router.get('/ai/recommendations', aiCtrl.getRecommendations);
router.get('/ai/search', aiCtrl.search);

// ── PATIENTS ──────────────────────────────────────────────────
router.get('/patients', authenticate, authorize('admin','doctor','midwife','nurse'), patientCtrl.getAll);
router.post('/patients', authenticate, authorizePermission('patients:write'), patientCtrl.create);
router.get('/patients/me', authenticate, authorize('patient'), patientCtrl.getMe);
router.patch('/patients/me', authenticate, authorize('patient'), patientCtrl.updateMe);
router.get('/patients/:id', authenticate, requireOwnPatient, patientCtrl.getOne);
router.patch('/patients/:id', authenticate, authorizePermission('patients:write'), patientCtrl.update);
router.get('/patients/:id/summary', authenticate, requireOwnPatient, patientCtrl.getSummary);

// ── PREGNANCIES ───────────────────────────────────────────────
const { query } = require('../config/database');

router.get('/pregnancies', authenticate, ownPatientQuery, clinical.listPregnancies);
router.post('/pregnancies', authenticate, authorize('admin','doctor','midwife'), authorizePermission('patients:write'), clinical.savePregnancy);
router.patch('/pregnancies/:id', authenticate, authorize('admin','doctor','midwife'), authorizePermission('patients:write'), clinical.savePregnancy);

// ── APPOINTMENTS ──────────────────────────────────────────────
// Structured pickup and referral coordination; patients remain scoped to their own records.
router.get('/pharmacy/pickups', coordination.listPickups);
router.post('/pharmacy/pickups', coordination.createPickup);
router.patch('/pharmacy/pickups/:id', (req,res,next) => req.user.role === 'patient' ? next() : authorizePermission('pharmacy:write')(req,res,next), coordination.updatePickup);
router.get('/referrals', coordination.listReferrals);
router.post('/referrals', authorize('admin','doctor','midwife','nurse'), authorizePermission('communication:write'), coordination.createReferral);
router.patch('/referrals/:id', authorize('admin','doctor','midwife','nurse'), authorizePermission('communication:write'), coordination.updateReferral);
router.post('/appointments/:id/remind', authorize('admin','doctor','midwife','nurse'), authorizePermission('appointments:write'), coordination.remindAppointment);

router.get('/appointments', authenticate, apptCtrl.getAll);
router.get('/appointments/today', authenticate, authorize('admin','doctor','midwife','nurse'), apptCtrl.getToday);
router.post('/appointments', authenticate, apptCtrl.create);
router.patch('/appointments/:id', authenticate, apptCtrl.update);

// ── VITALS ────────────────────────────────────────────────────
router.post('/vitals', authenticate, authorizePermission('clinical:vitals:write'), vitalsCtrl.create);
router.get('/vitals/patient/:patientId', authenticate, requireOwnPatient, vitalsCtrl.getByPatient);
router.get('/vitals/trend/:pregnancyId', authenticate, ownLinkedRecord('pregnancies','pregnancyId'), vitalsCtrl.getTrend);

// ── DELIVERIES ────────────────────────────────────────────────
router.patch('/deliveries/:id', authenticate, authorizePermission('clinical:deliveries:write'), deliveryCtrl.update);
router.post('/deliveries', authenticate, authorizePermission('clinical:deliveries:write'), deliveryCtrl.create);
router.get('/deliveries/patient/:patientId', authenticate, requireOwnPatient, deliveryCtrl.getByPatient);
router.post('/deliveries/:deliveryId/labor-progress', authenticate, authorizePermission('clinical:deliveries:write'), deliveryCtrl.addLaborProgress);
router.get('/deliveries/:deliveryId/labor-progress', authenticate, ownLinkedRecord('deliveries','deliveryId'), deliveryCtrl.getLaborProgress);

// Clinical chart workflows: patient ownership is enforced on every read.
router.get('/emr/labs/:patientId', authenticate, requireOwnPatient, clinical.list('labs'));
router.post('/emr/labs', authenticate, authorizePermission('clinical:labs:write'), clinical.create('labs'));
router.get('/emr/ultrasounds/:patientId', authenticate, requireOwnPatient, clinical.list('ultrasounds'));
router.post('/emr/ultrasounds', authenticate, authorizePermission('clinical:ultrasounds:write'), clinical.create('ultrasounds'));
router.get('/emr/prescriptions/:patientId', authenticate, requireOwnPatient, clinical.list('prescriptions'));
router.post('/emr/prescriptions', authenticate, authorizePermission('clinical:prescriptions:write'), clinical.create('prescriptions'));
router.get('/postpartum/:patientId', authenticate, requireOwnPatient, clinical.list('postpartum'));
router.post('/postpartum', authenticate, authorizePermission('clinical:postpartum:write'), clinical.create('postpartum'));
router.get('/immunizations/:patientId', authenticate, requireOwnPatient, clinical.list('immunizations'));
router.post('/immunizations', authenticate, authorizePermission('clinical:immunizations:write'), clinical.create('immunizations'));
router.get('/newborns/:patientId', authenticate, requireOwnPatient, clinical.list('newborns'));
router.post('/newborns', authenticate, authorizePermission('clinical:deliveries:write'), clinical.create('newborns'));
router.get('/pediatric/:patientId', authenticate, requireOwnPatient, clinical.list('pediatric'));
router.post('/pediatric', authenticate, authorizePermission('clinical:vitals:write'), clinical.create('pediatric'));

router.get('/billing', authenticate, authorize('admin','doctor'), billingWorkflow.list);
router.get('/billing/:id', authenticate, authorize('admin','doctor'), billingWorkflow.detail);
router.post('/billing', authenticate, authorizePermission('finance:billing:write'), billingWorkflow.create);
router.patch('/billing/:id/pay', authenticate, authorizePermission('finance:billing:write'), billingWorkflow.pay);
router.patch('/billing/:id/reconcile', authenticate, authorizePermission('finance:billing:write'), billingWorkflow.reconcile);

// ── INVENTORY ─────────────────────────────────────────────────
router.get('/inventory', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM inventory ORDER BY category, item_name');
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.post('/inventory', authenticate, authorizePermission('operations:inventory:write'), async (req, res, next) => {
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

router.patch('/inventory/:id/adjust', authenticate, authorizePermission('operations:inventory:write'), async (req, res, next) => {
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
router.get('/education', authenticate, educationWorkflow.list);
router.post('/education', authenticate, authorizePermission('content:education:write'), educationWorkflow.save);
router.patch('/education/:id', authenticate, authorizePermission('content:education:write'), educationWorkflow.save);

// ── REPORTS ───────────────────────────────────────────────────
router.get('/reports/dashboard', authenticate, authorize('admin','doctor','midwife','nurse'), reportCtrl.getDashboard);
router.get('/reports/patient-dashboard', authenticate, authorize('patient'), reportCtrl.getPatientDashboard);
router.get('/reports/births/monthly', authenticate, authorize('admin','doctor','midwife','nurse'), reportCtrl.getBirthsMonthly);
router.get('/reports/audit-logs', authenticate, authorize('admin'), reportCtrl.getAuditLogs);

// ── USERS (admin) ─────────────────────────────────────────────
router.post('/users', authenticate, authorize('admin'), requireStepUp('critical'), authCtrl.register);
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
         ac.status AS credential_status,
         ac.kind AS credential_kind,
         ac.document_type AS credential_document_type,
         ac.expires_at::text AS credential_expires_at,
         ac.revision AS credential_revision,
         (octet_length(ac.document_bytes) > 0) AS credential_has_document,
         sr.id AS staff_registry_id,
         sr.professional_title AS staff_professional_title,
         sr.department AS staff_department,
         sr.license_number AS staff_license_number,
         sr.license_type AS staff_license_type,
         sr.license_status AS staff_license_status,
         sr.credential_notes AS staff_credential_notes,
         sr.profile_photo_url AS staff_profile_photo_url,
         sr.specialization AS staff_specialization,
         sr.years_experience AS staff_years_experience,
         sr.education_background AS staff_education_background,
         sr.professional_qualifications AS staff_professional_qualifications,
         sr.certifications AS staff_certifications,
         sr.training_summary AS staff_training_summary,
         sr.public_profile_summary AS staff_public_profile_summary,
         sr.credential_expires_at AS staff_credential_expires_at,
         sr.verified_at AS staff_verified_at,
         sr.last_reviewed_at AS staff_last_reviewed_at,
         verifier.first_name || ' ' || verifier.last_name AS staff_verified_by_name,
         CASE
           WHEN u.is_active = false THEN 'inactive'
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '5 minutes' THEN 'online'
           WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '60 minutes' THEN 'recent'
           ELSE 'offline'
         END AS activity_status
       FROM users u
       LEFT JOIN staff_registry sr ON sr.user_id = u.id
       LEFT JOIN account_credentials ac ON ac.user_id = u.id
       LEFT JOIN users verifier ON verifier.id = sr.verified_by
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

router.patch('/users/:id/toggle', authenticate, authorize('admin'), requireStepUp('critical'), async (req, res, next) => {
  try {
    workflowValidation.uuid(req.params.id);
    if (req.params.id === req.user.id) return res.status(409).json({success:false,message:'You cannot deactivate your own administrator account.'});
    const result = await query(
      `UPDATE users SET is_active = NOT is_active, refresh_token = NULL, sessions_revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND NOT EXISTS (
         SELECT 1 FROM account_security_requests WHERE user_id = $1 AND purpose = 'delete' AND confirmed_at IS NOT NULL
       ) RETURNING id, email, role, is_active`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(409).json({ success: false, message: 'Account not found or a verified deletion request requires a separate clinic review.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get('/staff/registry', authenticate, authorize('admin'), staffCtrl.listRegistry);
router.get('/staff/registry/me', authenticate, authorize('admin','doctor','midwife','nurse'), staffCtrl.getMine);
router.get('/staff/registry/me/documents', authenticate, authorize('admin','doctor','midwife','nurse'), staffDocumentCtrl.listMine);
router.post('/staff/registry/me/documents', authenticate, authorize('admin','doctor','midwife','nurse'), uploadDocument.single('file'), staffDocumentCtrl.uploadMine);
router.get('/staff/registry/documents/expiring', authenticate, authorize('admin'), staffDocumentCtrl.listExpiring);
router.get('/staff/registry/:staffId/documents', authenticate, authorize('admin'), staffDocumentCtrl.listForStaff);
router.post('/staff/registry/:staffId/documents', authenticate, authorize('admin'), uploadDocument.single('file'), staffDocumentCtrl.uploadForStaff);
router.patch('/staff/documents/:id/review', authenticate, authorize('admin'), staffDocumentCtrl.reviewDocument);
router.patch('/staff/registry/:userId/license', authenticate, authorize('admin'), requireStepUp('license-change'), staffCtrl.updateLicense);
router.get('/notifications', authenticate, notificationCtrl.getMine);
router.get('/notifications/settings', authenticate, notificationCtrl.getSettings);
router.patch('/notifications/:id/read', authenticate, notificationCtrl.markRead);
router.post('/notifications', authenticate, authorize('admin','doctor','midwife','nurse'), notificationCtrl.create);

// ── INTERACTION CENTER ────────────────────────────────────────────────────────
router.get('/interactions/directory', authenticate, interactionCtrl.getDirectory);
router.get('/interactions/threads', authenticate, interactionCtrl.getThreads);
router.post('/interactions/threads', authenticate, interactionCtrl.createThread);
router.post('/interactions/teleconsults', authenticate, authorize('admin','doctor','midwife','nurse','patient'), interactionCtrl.createTeleconsultSession);
router.get('/interactions/teleconsults/review', authenticate, authorize('admin'), interactionCtrl.getTeleconsultReview);
router.get('/interactions/teleconsults/:id/availability', authenticate, authorize('admin'), interactionCtrl.getTeleconsultAvailability);
router.post('/interactions/teleconsults/:id/accept', authenticate, authorize('admin'), interactionCtrl.acceptTeleconsultSession);
router.get('/interactions/teleconsults/video/status', authenticate, interactionCtrl.getTeleconsultVideoStatus);
router.post('/interactions/teleconsults/:id/video/join', authenticate, interactionCtrl.joinTeleconsultVideo);
router.patch('/interactions/teleconsults/:id', authenticate, authorize('admin','doctor','midwife','nurse'), interactionCtrl.updateTeleconsultSession);
router.get('/interactions/threads/:id', authenticate, interactionCtrl.getThreadById);
router.post('/interactions/threads/:id/messages', authenticate, interactionCtrl.addMessage);
router.post('/interactions/messages/:id/promote', authenticate, authorize('admin','doctor','midwife','nurse'), requireStepUp('clinical-note'), interactionCtrl.promoteMessageToRecord);
router.patch('/interactions/threads/:id/read', authenticate, interactionCtrl.markThreadRead);
router.get('/interactions/tasks', authenticate, interactionCtrl.getTasks);
router.post('/interactions/tasks', authenticate, interactionCtrl.createTask);
router.patch('/interactions/tasks/:id', authenticate, interactionCtrl.updateTask);

// ── OPERATIONS (backup & restore) ─────────────────────────────────────────────
router.get('/admin/backup-status', authenticate, authorize('admin'), operationsCtrl.getBackupStatus);
router.post('/admin/clinic-export', authenticate, authorize('admin'), requireStepUp('backup-restore'), operationsCtrl.exportClinicData);
router.post('/admin/backup', authenticate, authorize('admin'), requireStepUp('backup-restore'), operationsCtrl.createBackup);
router.post('/admin/restore', authenticate, authorize('admin'), requireStepUp('backup-restore'), operationsCtrl.restoreBackup);
router.get('/admin/backup-logs', authenticate, authorize('admin'), operationsCtrl.getBackupLogs);

module.exports = router;

