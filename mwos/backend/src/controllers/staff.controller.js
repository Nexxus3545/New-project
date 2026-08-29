const { getClient, query } = require('../config/database');
const { publicStaffProfile, recordLicenseEvent, upsertStaffRegistry, normalizeLicenseStatus } = require('../utils/staff');
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
         sr.verified_at,
         sr.last_reviewed_at,
         sr.created_at,
         sr.updated_at,
         verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM users u
       LEFT JOIN staff_registry sr ON sr.user_id = u.id
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
         verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM staff_registry sr
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

  try {
    const { userId } = req.params;
    const {
      status,
      professionalTitle,
      department,
      licenseNumber,
      licenseType,
      credentialNotes,
    } = req.body;

    if (!['pending', 'verified', 'suspended', 'expired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be pending, verified, suspended, or expired',
        requestId: req.requestId || null,
      });
    }

    const targetUser = await client.query(
      'SELECT id, role, first_name, last_name FROM users WHERE id = $1',
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

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT sr.*, verifier.first_name || ' ' || verifier.last_name AS verified_by_name
       FROM staff_registry sr
       LEFT JOIN users verifier ON verifier.id = sr.verified_by
       WHERE sr.user_id = $1
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    const previousStatus = existing.rows[0]?.license_status || null;
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

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'License status updated successfully',
      data: staffProfile,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getMine,
  listRegistry,
  updateLicense,
};
