const { getClient, query } = require('../config/database');
const { publicStaffProfile, recordLicenseEvent, upsertStaffRegistry, normalizeLicenseStatus, fetchStaffProfileByUserId } = require('../utils/staff');
const { PROFESSIONAL_CREDENTIAL_COLUMNS, PROFESSIONAL_ROLES, credentialDateKey, manilaDateKey } = require('../middleware/professionalCredential');
const { recordSecurityAudit } = require('../utils/security');

const listRegistry = async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT
         sr.id AS staff_id,
         sr.user_id,
         u.email,
         u.role,
         u.first_name,
         u.last_name,
         u.phone,
         u.is_active,
         sr.professional_title,
         sr.department,
         sr.license_number,
         sr.license_type,
         sr.license_status,
         sr.credential_notes,
         sr.profile_photo_url,
         sr.specialization,
         sr.years_experience,
         sr.education_background,
         sr.professional_qualifications,
         sr.certifications,
         sr.training_summary,
         sr.public_profile_summary,
         sr.credential_expires_at,
         sr.verified_at,
         sr.last_reviewed_at,
         sr.created_at,
         sr.updated_at,
         ${PROFESSIONAL_CREDENTIAL_COLUMNS},
         verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM users u
       LEFT JOIN staff_registry sr ON sr.user_id = u.id
       LEFT JOIN account_credentials ac ON ac.user_id = u.id
       LEFT JOIN users verifier ON verifier.id = sr.verified_by
       WHERE u.role IN ('admin', 'doctor', 'midwife', 'nurse')
       ORDER BY u.role, u.last_name, u.first_name`
    );

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        userId: row.user_id,
        user: {
          id: row.user_id,
          email: row.email,
          role: row.role,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          isActive: row.is_active,
        },
        staffProfile: publicStaffProfile(row),
      })),
    });
  } catch (err) {
    next(err);
  }
};

const getMine = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         sr.*,
         ${PROFESSIONAL_CREDENTIAL_COLUMNS},
         verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM staff_registry sr
       INNER JOIN users u ON u.id = sr.user_id
       LEFT JOIN account_credentials ac ON ac.user_id = sr.user_id
       LEFT JOIN users verifier ON verifier.id = sr.verified_by
       WHERE sr.user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: publicStaffProfile(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
};

const updateLicense = async (req, res, next) => {
  const client = await getClient();
  let transactionOpen = false;

  try {
    const { userId } = req.params;
    const {
      status,
      professionalTitle,
      department,
      licenseNumber,
      licenseType,
      credentialNotes,
      profilePhotoUrl,
      specialization,
      yearsExperience,
      educationBackground,
      professionalQualifications,
      certifications,
      trainingSummary,
      publicProfileSummary,
      credentialExpiresAt,
    } = req.body;

    if (!['pending', 'verified', 'suspended', 'expired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be pending, verified, suspended, or expired',
        requestId: req.requestId || null,
      });
    }

    await client.query('BEGIN');
    transactionOpen = true;
    const targetUser = await client.query(
      'SELECT id, role, first_name, last_name FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        requestId: req.requestId || null,
      });
    }

    if (targetUser.rows[0].role === 'patient') {
      return res.status(400).json({
        success: false,
        message: 'Patient accounts do not use staff licenses',
        requestId: req.requestId || null,
      });
    }

    // A status toggle cannot replace the private evidence review workflow.
    // Lock in the same user -> credential -> staff order as submission/review.
    let evidence;
    if (PROFESSIONAL_ROLES.has(targetUser.rows[0].role)) {
      const proof = await client.query('SELECT status, license_number, expires_at FROM account_credentials WHERE user_id = $1 FOR SHARE', [userId]);
      evidence = proof.rows[0];
    }

    const existing = await client.query(
      `SELECT sr.*, verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM staff_registry sr
       LEFT JOIN users verifier ON verifier.id = sr.verified_by
       WHERE sr.user_id = $1
       LIMIT 1
       FOR UPDATE OF sr`,
      [userId]
    );

    const previousStatus = existing.rows[0]?.license_status || null;
    if (status === 'verified' && PROFESSIONAL_ROLES.has(targetUser.rows[0].role)) {
      const number = licenseNumber ?? existing.rows[0]?.license_number;
      const expiry = credentialDateKey(credentialExpiresAt ?? existing.rows[0]?.credential_expires_at);
      if (!evidence || evidence.status !== 'verified' || typeof number !== 'string' || !number.trim() || number.trim() !== evidence.license_number
          || !expiry || expiry < manilaDateKey() || expiry !== credentialDateKey(evidence.expires_at)) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({ success: false, code: 'CREDENTIAL_REVIEW_REQUIRED', message: 'Submit and review the professional ID in User Management before verifying this license.' });
      }
    }
    const verifiedAt = status === 'verified' ? new Date() : null;
    const verifiedBy = status === 'verified' ? req.user.id : existing.rows[0]?.verified_by || null;
    const lastReviewedAt = new Date();
    const staffProfile = await upsertStaffRegistry({
      client,
      userId,
      professionalTitle: professionalTitle || existing.rows[0]?.professional_title || targetUser.rows[0].role,
      department: department || existing.rows[0]?.department || 'Clinic Operations',
      licenseNumber: licenseNumber ?? existing.rows[0]?.license_number ?? null,
      licenseType: licenseType || existing.rows[0]?.license_type || 'Professional license',
      licenseStatus: normalizeLicenseStatus(status),
      credentialNotes: credentialNotes ?? existing.rows[0]?.credential_notes ?? null,
      profilePhotoUrl: profilePhotoUrl ?? existing.rows[0]?.profile_photo_url ?? null,
      specialization: specialization ?? existing.rows[0]?.specialization ?? null,
      yearsExperience: yearsExperience ?? existing.rows[0]?.years_experience ?? null,
      educationBackground: educationBackground ?? existing.rows[0]?.education_background ?? null,
      professionalQualifications: professionalQualifications ?? existing.rows[0]?.professional_qualifications ?? [],
      certifications: certifications ?? existing.rows[0]?.certifications ?? [],
      trainingSummary: trainingSummary ?? existing.rows[0]?.training_summary ?? null,
      publicProfileSummary: publicProfileSummary ?? existing.rows[0]?.public_profile_summary ?? null,
      credentialExpiresAt: credentialExpiresAt ?? existing.rows[0]?.credential_expires_at ?? null,
      verifiedBy,
      verifiedAt,
      lastReviewedAt,
    });

    const eventType = status === 'verified'
      ? 'verified'
      : status === 'suspended'
        ? 'suspended'
        : status === 'expired'
          ? 'expired'
          : existing.rows[0] ? 'note_added' : 'created';

    await recordLicenseEvent({
      client,
      staffId: staffProfile.staffId,
      eventType,
      previousStatus,
      nextStatus: status,
      notes: credentialNotes || null,
      performedBy: req.user.id,
    });

    await recordSecurityAudit({
      client,
      staffId: staffProfile.staffId,
      actionPerformed: 'LICENSE_STATUS_UPDATED',
      entityType: 'staff_registry',
      entityId: staffProfile.staffId,
      deviceIp: req.ip,
      authMethod: req.stepUp?.authMethod || 'SMS_OTP',
      credentialStrength: 'Step_Up',
      requestId: req.requestId || null,
      notes: credentialNotes || null,
      details: {
        previousStatus,
        nextStatus: status,
      },
    });

    const savedProfile = await fetchStaffProfileByUserId(userId, client);
    await client.query('COMMIT');
    transactionOpen = false;

    res.json({
      success: true,
      message: 'License status updated successfully',
      data: savedProfile,
    });
  } catch (err) {
    if (transactionOpen) await client.query('ROLLBACK');
    transactionOpen = false;
    next(err);
  } finally {
    // Handles early validation returns after the transaction was opened.
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
};

module.exports = {
  getMine,
  listRegistry,
  updateLicense,
};
