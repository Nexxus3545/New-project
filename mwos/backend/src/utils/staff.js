const { query } = require('../config/database');
const { PROFESSIONAL_CREDENTIAL_COLUMNS, isCurrentProfessionalCredential } = require('../middleware/professionalCredential');

const normalizeLicenseStatus = (value) => {
  const allowed = new Set(['pending', 'verified', 'suspended', 'expired']);
  return allowed.has(value) ? value : 'pending';
};

const publicStaffProfile = (row) => {
  if (!row) return null;

  return {
    staffId: row.staff_id || row.id || null,
    userId: row.user_id || null,
    role: row.credential_role || row.role || null,
    professionalTitle: row.professional_title || null,
    department: row.department || null,
    licenseNumber: row.license_number || null,
    licenseType: row.license_type || null,
    licenseStatus: row.license_status || 'pending',
    credentialNotes: row.credential_notes || null,
    profilePhotoUrl: row.profile_photo_url || null,
    specialization: row.specialization || null,
    yearsExperience: row.years_experience ?? null,
    educationBackground: row.education_background || null,
    professionalQualifications: row.professional_qualifications || [],
    certifications: row.certifications || [],
    trainingSummary: row.training_summary || null,
    publicProfileSummary: row.public_profile_summary || null,
    credentialExpiresAt: row.credential_expires_at || null,
    verifiedAt: row.verified_at || null,
    verifiedById: row.verified_by || null,
    verifiedByName: row.verified_by_name || null,
    lastReviewedAt: row.last_reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    isVerified: isCurrentProfessionalCredential(row),
  };
};

const fetchStaffProfileByUserId = async (userId, client) => {
  const executor = client || { query };
  const result = await executor.query(
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
  profilePhotoUrl = null,
  specialization = null,
  yearsExperience = null,
  educationBackground = null,
  professionalQualifications = [],
  certifications = [],
  trainingSummary = null,
  publicProfileSummary = null,
  credentialExpiresAt = null,
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
       profile_photo_url,
       specialization,
       years_experience,
       education_background,
       professional_qualifications,
       certifications,
       training_summary,
       public_profile_summary,
       credential_expires_at,
       verified_by,
       verified_at,
       last_reviewed_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (user_id) DO UPDATE SET
       professional_title = EXCLUDED.professional_title,
       department = EXCLUDED.department,
       license_number = EXCLUDED.license_number,
       license_type = EXCLUDED.license_type,
       license_status = EXCLUDED.license_status,
       credential_notes = EXCLUDED.credential_notes,
       profile_photo_url = EXCLUDED.profile_photo_url,
       specialization = EXCLUDED.specialization,
       years_experience = EXCLUDED.years_experience,
       education_background = EXCLUDED.education_background,
       professional_qualifications = EXCLUDED.professional_qualifications,
       certifications = EXCLUDED.certifications,
       training_summary = EXCLUDED.training_summary,
       public_profile_summary = EXCLUDED.public_profile_summary,
       credential_expires_at = EXCLUDED.credential_expires_at,
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
      profilePhotoUrl,
      specialization,
      yearsExperience,
      educationBackground,
      JSON.stringify(Array.isArray(professionalQualifications) ? professionalQualifications : []),
      JSON.stringify(Array.isArray(certifications) ? certifications : []),
      trainingSummary,
      publicProfileSummary,
      credentialExpiresAt,
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
