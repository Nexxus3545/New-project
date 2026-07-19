const { query } = require('../config/database');

const normalizeLicenseStatus = (value) => {
  const allowed = new Set(['pending', 'verified', 'suspended', 'expired']);
  return allowed.has(value) ? value : 'pending';
};

const publicStaffProfile = (row) => {
  if (!row) return null;

  return {
    staffId: row.staff_id || row.id || null,
    userId: row.user_id || null,
    professionalTitle: row.professional_title || null,
    department: row.department || null,
    licenseNumber: row.license_number || null,
    licenseType: row.license_type || null,
    licenseStatus: row.license_status || 'pending',
    credentialNotes: row.credential_notes || null,
    verifiedAt: row.verified_at || null,
    verifiedById: row.verified_by || null,
    verifiedByName: row.verified_by_name || null,
    lastReviewedAt: row.last_reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    isVerified: row.license_status === 'verified',
  };
};

const fetchStaffProfileByUserId = async (userId) => {
  const result = await query(
    `SELECT
       sr.*,
       verifier.first_name || ' ' || verifier.last_name AS verified_by_name
     FROM staff_registry sr
     LEFT JOIN users verifier ON verifier.id = sr.verified_by
     WHERE sr.user_id = $1
     LIMIT 1`,
    [userId]
  );

  return publicStaffProfile(result.rows[0]);
};

const upsertStaffRegistry = async ({
  client,
  userId,
  professionalTitle = null,
  department = null,
  licenseNumber = null,
  licenseType = null,
  licenseStatus = 'pending',
  credentialNotes = null,
  verifiedBy = null,
  verifiedAt = null,
  lastReviewedAt = null,
}) => {
  const executor = client || { query };

  const result = await executor.query(
    `INSERT INTO staff_registry (
       user_id,
       professional_title,
       department,
       license_number,
       license_type,
       license_status,
       credential_notes,
       verified_by,
       verified_at,
       last_reviewed_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id) DO UPDATE SET
       professional_title = EXCLUDED.professional_title,
       department = EXCLUDED.department,
       license_number = EXCLUDED.license_number,
       license_type = EXCLUDED.license_type,
       license_status = EXCLUDED.license_status,
       credential_notes = EXCLUDED.credential_notes,
       verified_by = EXCLUDED.verified_by,
       verified_at = EXCLUDED.verified_at,
       last_reviewed_at = EXCLUDED.last_reviewed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      professionalTitle,
      department,
      licenseNumber,
      licenseType,
      normalizeLicenseStatus(licenseStatus),
      credentialNotes,
      verifiedBy,
      verifiedAt,
      lastReviewedAt,
    ]
  );

  return publicStaffProfile(result.rows[0]);
};

const recordLicenseEvent = async ({
  client,
  staffId,
  eventType,
  previousStatus = null,
  nextStatus = null,
  notes = null,
  performedBy = null,
}) => {
  const executor = client || { query };
  await executor.query(
    `INSERT INTO license_verification_events (
       staff_id,
       event_type,
       previous_status,
       next_status,
       notes,
       performed_by
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      staffId,
      eventType,
      previousStatus,
      nextStatus,
      notes,
      performedBy,
    ]
  );
};

module.exports = {
  fetchStaffProfileByUserId,
  normalizeLicenseStatus,
  publicStaffProfile,
  recordLicenseEvent,
  upsertStaffRegistry,
};
