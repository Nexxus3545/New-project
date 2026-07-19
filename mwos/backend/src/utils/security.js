const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { sendMail } = require('./mailer');
const { fetchStaffProfileByUserId } = require('./staff');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const STEP_UP_EXPIRY = process.env.STEP_UP_TOKEN_EXPIRES_IN || '15m';
const WEB_AUTHN_RP_NAME = process.env.WEBAUTHN_RP_NAME || 'TMC Copino MWOS';
const WEB_AUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';
const WEB_AUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || (() => {
  try {
    return new URL(WEB_AUTHN_ORIGIN).hostname;
  } catch {
    return 'localhost';
  }
})();
const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'mwos-otp-secret';
const STEP_UP_SECRET = process.env.JWT_STEP_UP_SECRET || process.env.JWT_SECRET || 'mwos-step-up-secret';
const WEBAUTHN_SESSION_SECRET = process.env.JWT_WEBAUTHN_SECRET || process.env.JWT_SECRET || 'mwos-webauthn-secret';
const SIGNATURE_SECRET = process.env.SIGNATURE_SECRET || process.env.JWT_SECRET || 'mwos-signature-secret';

const STEP_UP_PURPOSES = new Set([
  'critical',
  'billing',
  'backup-restore',
  'export-sensitive',
  'license-change',
  'record-delete',
  'clinical-signature',
]);

const AUTH_METHODS = new Set(['Password', 'Biometric', 'SMS_OTP', 'WebAuthn', 'Passkey']);
const CREDENTIAL_STRENGTHS = new Set(['Base', 'Step_Up', 'Clinical_Signature']);

const normalizePurpose = (purpose) => {
  const value = typeof purpose === 'string' ? purpose.trim().toLowerCase() : '';
  if (!value) return 'critical';
  if (STEP_UP_PURPOSES.has(value)) return value;
  return 'critical';
};

const normalizeAuthMethod = (value) => {
  if (AUTH_METHODS.has(value)) return value;
  return 'Password';
};

const normalizeCredentialStrength = (value) => {
  if (CREDENTIAL_STRENGTHS.has(value)) return value;
  return 'Base';
};

const sanitizeAuditAuthMethod = (value) => {
  if (!value) return null;
  return AUTH_METHODS.has(value) ? value : null;
};

const sanitizeAuditCredentialStrength = (value) => {
  if (!value) return null;
  return CREDENTIAL_STRENGTHS.has(value) ? value : null;
};

const encodeUuidToBuffer = (uuid) => Buffer.from(String(uuid).replace(/-/g, ''), 'hex');

const uuidToBase64Url = (uuid) => encodeUuidToBuffer(uuid).toString('base64url');

const generateOtpCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');

const hashOtpCode = (code) => crypto
  .createHmac('sha256', OTP_SECRET)
  .update(String(code))
  .digest('hex');

const maskPhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const getWebAuthnConfig = () => ({
  rpName: WEB_AUTHN_RP_NAME,
  rpId: WEB_AUTHN_RP_ID,
  origin: WEB_AUTHN_ORIGIN,
});

const issueStepUpToken = ({
  userId,
  role,
  purpose = 'critical',
  authMethod = 'SMS_OTP',
  credentialStrength = 'Step_Up',
  credentialId = null,
  challengeId = null,
}) => jwt.sign(
  {
    kind: 'step_up',
    userId,
    role,
    purpose: normalizePurpose(purpose),
    authMethod: normalizeAuthMethod(authMethod),
    credentialStrength: normalizeCredentialStrength(credentialStrength),
    credentialId,
    challengeId,
  },
  STEP_UP_SECRET,
  { expiresIn: STEP_UP_EXPIRY }
);

const verifyStepUpToken = (token, { userId, purpose = 'critical' } = {}) => {
  if (!token) {
    throw new Error('Step-up authentication required');
  }

  const decoded = jwt.verify(token, STEP_UP_SECRET);
  if (decoded.kind !== 'step_up') {
    throw new Error('Invalid step-up token');
  }
  if (userId && decoded.userId !== userId) {
    throw new Error('Step-up token does not match the active user');
  }

  const normalizedPurpose = normalizePurpose(purpose);
  if (decoded.purpose !== normalizedPurpose && decoded.purpose !== 'critical') {
    throw new Error('Step-up token purpose mismatch');
  }

  return decoded;
};

const issueWebAuthnSessionToken = ({
  type,
  userId,
  purpose = 'critical',
  challenge,
  rpId = WEB_AUTHN_RP_ID,
  origin = WEB_AUTHN_ORIGIN,
  email = null,
  credentialId = null,
}) => jwt.sign(
  {
    kind: 'webauthn_session',
    type,
    userId,
    purpose: normalizePurpose(purpose),
    challenge,
    rpId,
    origin,
    email,
    credentialId,
  },
  WEBAUTHN_SESSION_SECRET,
  { expiresIn: '10m' }
);

const verifyWebAuthnSessionToken = (token, expectedType) => {
  const decoded = jwt.verify(token, WEBAUTHN_SESSION_SECRET);
  if (decoded.kind !== 'webauthn_session') {
    throw new Error('Invalid WebAuthn session token');
  }
  if (expectedType && decoded.type !== expectedType) {
    throw new Error('WebAuthn session type mismatch');
  }
  return decoded;
};

const deliverOtp = async ({ user, code, purpose }) => {
  const text = [
    'MWOS step-up verification code:',
    code,
    '',
    `Purpose: ${purpose}`,
    'This code expires in 10 minutes.',
  ].join('\n');

  if (process.env.SMS_GATEWAY_URL) {
    if (!user.phone) {
      throw new Error('A phone number is required for SMS delivery');
    }

    const response = await fetch(process.env.SMS_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_GATEWAY_TOKEN ? { Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        to: user.phone,
        message: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS gateway rejected OTP delivery (${response.status})`);
    }

    return { channel: 'SMS', deliveryMode: 'gateway' };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMS delivery is not configured');
  }

  await sendMail({
    to: user.email,
    subject: 'MWOS step-up verification code',
    text,
    html: `<p>${text.replace(/\n/g, '<br />')}</p>`,
  });

  return { channel: 'SMS', deliveryMode: 'email-fallback' };
};

const createOtpChallenge = async ({
  client,
  staffId,
  purpose = 'critical',
  channel = 'SMS',
}) => {
  const executor = client || { query };
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const result = await executor.query(
    `INSERT INTO otp_challenges (
       staff_id, purpose, channel, code_hash, expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [staffId, normalizePurpose(purpose), channel, codeHash, expiresAt]
  );

  return { challenge: result.rows[0], code };
};

const verifyOtpChallenge = async ({
  client,
  staffId,
  purpose = 'critical',
  code,
}) => {
  const executor = client || { query };
  const challengeResult = await executor.query(
    `SELECT *
     FROM otp_challenges
     WHERE staff_id = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [staffId, normalizePurpose(purpose)]
  );

  const challenge = challengeResult.rows[0];
  if (!challenge) {
    return { verified: false, reason: 'No active challenge found' };
  }

  const nextAttempts = Number(challenge.attempt_count || 0) + 1;
  if (nextAttempts > 5) {
    await executor.query(
      'UPDATE otp_challenges SET attempt_count = $1, consumed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [nextAttempts, challenge.id]
    );
    return { verified: false, reason: 'Challenge locked after too many attempts' };
  }

  const isValid = hashOtpCode(code) === challenge.code_hash;
  await executor.query(
    'UPDATE otp_challenges SET attempt_count = $1, consumed_at = CASE WHEN $2 THEN NOW() ELSE consumed_at END, updated_at = NOW() WHERE id = $3',
    [nextAttempts, isValid, challenge.id]
  );

  return {
    verified: isValid,
    challenge,
    reason: isValid ? null : 'Invalid verification code',
  };
};

const getStaffSecurityContext = async (userId) => {
  const staffProfile = await fetchStaffProfileByUserId(userId);
  if (!staffProfile) {
    return null;
  }

  return staffProfile;
};

const recordSecurityAudit = async ({
  client,
  staffId = null,
  actionPerformed,
  entityType = null,
  entityId = null,
  deviceIp = null,
  authMethod = 'Password',
  credentialStrength = 'Base',
  requestId = null,
  notes = null,
  details = {},
}) => {
  const executor = client || { query };
  try {
    await executor.query(
      `INSERT INTO security_audit (
         staff_id, action_performed, entity_type, entity_id, device_ip,
         auth_method, credential_strength, request_id, notes, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        staffId,
        actionPerformed,
        entityType,
        entityId,
        deviceIp,
        normalizeAuthMethod(authMethod),
        normalizeCredentialStrength(credentialStrength),
        requestId,
        notes,
        details || {},
      ]
    );
  } catch (error) {
    console.error('Security audit failed:', error.message);
  }
};

const signClinicalRecord = async ({
  client,
  staffProfile,
  staffId,
  entityType,
  entityId,
  actionType,
  credentialStrength = 'Clinical_Signature',
  authMethod = 'SMS_OTP',
  requestId = null,
  signedAt = new Date(),
  notes = null,
}) => {
  const executor = client || { query };
  const profile = staffProfile || await getStaffSecurityContext(staffId);

  if (!profile) {
    throw new Error('Staff credential profile not found');
  }

  const licenseId = profile.licenseNumber || profile.license_number || profile.licenseId || null;
  if (!licenseId) {
    throw new Error('Licensed staff credential is required to sign chart entries');
  }

  const signedAtIso = signedAt instanceof Date ? signedAt.toISOString() : new Date(signedAt || Date.now()).toISOString();
  const signatureBase = JSON.stringify({
    staffId: profile.staffId || staffId,
    licenseId,
    entityType,
    entityId,
    actionType,
    credentialStrength: normalizeCredentialStrength(credentialStrength),
    authMethod: normalizeAuthMethod(authMethod),
    requestId,
    signedAt: signedAtIso,
  });
  const signatureHash = crypto
    .createHmac('sha256', SIGNATURE_SECRET)
    .update(signatureBase)
    .digest('hex');

  const result = await executor.query(
    `INSERT INTO digital_signatures (
       staff_id, license_id, entity_type, entity_id, action_type,
       credential_strength, auth_method, signature_hash, request_id, signed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      profile.staffId || staffId,
      String(licenseId),
      entityType,
      entityId,
      actionType,
      normalizeCredentialStrength(credentialStrength),
      normalizeAuthMethod(authMethod),
      signatureHash,
      requestId,
      signedAtIso,
    ]
  );

  await recordSecurityAudit({
    client,
    staffId: profile.staffId || staffId,
    actionPerformed: `SIGNATURE:${actionType}`,
    entityType,
    entityId,
    authMethod,
    credentialStrength,
    requestId,
    notes,
    details: {
      licenseId,
      signatureId: result.rows[0].id,
    },
  });

  return result.rows[0];
};

const getSecuritySignatures = async ({ entityType, entityId }) => {
  const result = await query(
    `SELECT ds.*,
            sr.professional_title,
            u.first_name || ' ' || u.last_name AS staff_name
     FROM digital_signatures ds
     LEFT JOIN staff_registry sr ON sr.id = ds.staff_id
     LEFT JOIN users u ON u.id = sr.user_id
     WHERE ds.entity_type = $1
       AND ds.entity_id = $2
     ORDER BY ds.signed_at DESC`,
    [entityType, entityId]
  );

  return result.rows;
};

const buildSecurityAuditFilters = ({
  staffId = null,
  actionPerformed = null,
  entityType = null,
  authMethod = null,
  credentialStrength = null,
  search = null,
  from = null,
  to = null,
}) => {
  const conditions = [];
  const params = [];
  let index = 1;

  if (staffId) {
    conditions.push(`sa.staff_id = $${index++}`);
    params.push(staffId);
  }

  if (actionPerformed) {
    conditions.push(`sa.action_performed = $${index++}`);
    params.push(actionPerformed);
  }

  if (entityType) {
    conditions.push(`sa.entity_type = $${index++}`);
    params.push(entityType);
  }

  const normalizedAuthMethod = sanitizeAuditAuthMethod(authMethod);
  if (normalizedAuthMethod) {
    conditions.push(`sa.auth_method = $${index++}`);
    params.push(normalizedAuthMethod);
  }

  const normalizedCredentialStrength = sanitizeAuditCredentialStrength(credentialStrength);
  if (normalizedCredentialStrength) {
    conditions.push(`sa.credential_strength = $${index++}`);
    params.push(normalizedCredentialStrength);
  }

  if (from) {
    conditions.push(`sa.created_at >= $${index++}`);
    params.push(from);
  }

  if (to) {
    conditions.push(`sa.created_at <= $${index++}`);
    params.push(to);
  }

  const trimmedSearch = typeof search === 'string' ? search.trim() : '';
  if (trimmedSearch) {
    const searchParam = `%${trimmedSearch}%`;
    conditions.push(`(
      sa.action_performed ILIKE $${index}
      OR COALESCE(sa.entity_type, '') ILIKE $${index}
      OR COALESCE(sa.notes, '') ILIKE $${index}
      OR COALESCE(u.first_name || ' ' || u.last_name, '') ILIKE $${index}
      OR COALESCE(CAST(sa.details AS TEXT), '') ILIKE $${index}
    )`);
    params.push(searchParam);
    index += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { whereClause, params };
};

const getSecurityAuditEntries = async ({
  staffId = null,
  actionPerformed = null,
  entityType = null,
  authMethod = null,
  credentialStrength = null,
  search = null,
  from = null,
  to = null,
  limit = 100,
  offset = 0,
}) => {
  const { whereClause, params } = buildSecurityAuditFilters({
    staffId,
    actionPerformed,
    entityType,
    authMethod,
    credentialStrength,
    search,
    from,
    to,
  });
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM security_audit sa
     LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
     LEFT JOIN users u ON u.id = sr.user_id
     ${whereClause}`,
    params
  );

  const result = await query(
    `SELECT sa.*,
            sr.professional_title,
            u.first_name || ' ' || u.last_name AS staff_name
     FROM security_audit sa
     LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
     LEFT JOIN users u ON u.id = sr.user_id
     ${whereClause}
     ORDER BY sa.created_at DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, safeLimit, safeOffset]
  );

  const total = Number(countResult.rows[0]?.total || 0);

  return {
    rows: result.rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
};

const getSecurityAuditSummary = async ({
  staffId = null,
  actionPerformed = null,
  entityType = null,
  authMethod = null,
  credentialStrength = null,
  search = null,
  from = null,
  to = null,
}) => {
  const { whereClause, params } = buildSecurityAuditFilters({
    staffId,
    actionPerformed,
    entityType,
    authMethod,
    credentialStrength,
    search,
    from,
    to,
  });

  const summaryResult = await query(
    `WITH filtered AS (
       SELECT sa.*
       FROM security_audit sa
       LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
       LEFT JOIN users u ON u.id = sr.user_id
       ${whereClause}
     )
     SELECT
       COUNT(*)::int AS total_events,
       COUNT(DISTINCT staff_id)::int AS unique_staff,
       COUNT(*) FILTER (WHERE credential_strength = 'Step_Up')::int AS step_up_events,
       COUNT(*) FILTER (WHERE credential_strength = 'Clinical_Signature')::int AS clinical_signature_events,
       COUNT(*) FILTER (WHERE action_performed LIKE 'SIGNATURE:%')::int AS signed_actions,
       COUNT(*) FILTER (WHERE action_performed ILIKE '%FAILED%' OR action_performed ILIKE '%DENIED%')::int AS failed_events
     FROM filtered`,
    params
  );

  const byAction = await query(
    `WITH filtered AS (
       SELECT sa.action_performed
       FROM security_audit sa
       LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
       LEFT JOIN users u ON u.id = sr.user_id
       ${whereClause}
     )
     SELECT action_performed, COUNT(*)::int AS count
     FROM filtered
     GROUP BY action_performed
     ORDER BY count DESC, action_performed ASC
     LIMIT 8`,
    params
  );

  const byAuthMethod = await query(
    `WITH filtered AS (
       SELECT sa.auth_method
       FROM security_audit sa
       LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
       LEFT JOIN users u ON u.id = sr.user_id
       ${whereClause}
     )
     SELECT auth_method, COUNT(*)::int AS count
     FROM filtered
     GROUP BY auth_method
     ORDER BY count DESC, auth_method ASC`,
    params
  );

  const byCredentialStrength = await query(
    `WITH filtered AS (
       SELECT sa.credential_strength
       FROM security_audit sa
       LEFT JOIN staff_registry sr ON sr.id = sa.staff_id
       LEFT JOIN users u ON u.id = sr.user_id
       ${whereClause}
     )
     SELECT credential_strength, COUNT(*)::int AS count
     FROM filtered
     GROUP BY credential_strength
     ORDER BY count DESC, credential_strength ASC`,
    params
  );

  return {
    ...summaryResult.rows[0],
    byAction: byAction.rows,
    byAuthMethod: byAuthMethod.rows,
    byCredentialStrength: byCredentialStrength.rows,
  };
};

const getRegisteredWebAuthnCredentials = async (staffId) => {
  const result = await query(
    `SELECT wc.*, ac.label AS auth_label, ac.external_credential_ref
     FROM webauthn_credentials wc
     INNER JOIN auth_credentials ac ON ac.id = wc.auth_credential_id
     WHERE wc.staff_id = $1
       AND ac.is_active = true
     ORDER BY wc.created_at DESC`,
    [staffId]
  );

  return result.rows;
};

const getWebAuthnCredentialById = async (credentialId) => {
  const result = await query(
    `SELECT wc.*, ac.is_active, ac.label AS auth_label
     FROM webauthn_credentials wc
     INNER JOIN auth_credentials ac ON ac.id = wc.auth_credential_id
     WHERE wc.credential_id = $1
     LIMIT 1`,
    [credentialId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.credential_id,
    publicKey: Buffer.from(row.credential_public_key, 'base64'),
    counter: Number(row.counter || 0),
    transports: Array.isArray(row.transports) ? row.transports : [],
    row,
  };
};

const storeWebAuthnCredential = async ({
  client,
  staffId,
  credential,
  publicKey,
  label = null,
  authenticator = null,
}) => {
  const executor = client || { query };
  const authCredentialResult = await executor.query(
    `INSERT INTO auth_credentials (
       staff_id, credential_type, external_credential_ref, public_key, label, last_verified_at, is_active
     ) VALUES ($1, $2, $3, $4, $5, NOW(), true)
     RETURNING *`,
    [
      staffId,
      'WebAuthn',
      credential.id,
      publicKey,
      label,
    ]
  );

  const credentialResult = await executor.query(
    `INSERT INTO webauthn_credentials (
       auth_credential_id, staff_id, credential_id, credential_public_key, counter,
       transports, credential_device_type, credential_backed_up, attestation_format, label
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      authCredentialResult.rows[0].id,
      staffId,
      credential.id,
      publicKey,
      credential.counter || 0,
      JSON.stringify(credential.transports || []),
      authenticator?.credentialDeviceType || 'singleDevice',
      Boolean(authenticator?.credentialBackedUp),
      authenticator?.fmt || null,
      label,
    ]
  );

  return {
    authCredential: authCredentialResult.rows[0],
    webauthnCredential: credentialResult.rows[0],
  };
};

module.exports = {
  AUTH_METHODS,
  CREDENTIAL_STRENGTHS,
  OTP_EXPIRY_MINUTES,
  STEP_UP_PURPOSES,
  WEB_AUTHN_ORIGIN,
  WEB_AUTHN_RP_ID,
  WEB_AUTHN_RP_NAME,
  createOtpChallenge,
  deliverOtp,
  encodeUuidToBuffer,
  generateOtpCode,
  getRegisteredWebAuthnCredentials,
  getSecurityAuditEntries,
  getSecurityAuditSummary,
  getSecuritySignatures,
  getStaffSecurityContext,
  getWebAuthnCredentialById,
  hashOtpCode,
  issueStepUpToken,
  issueWebAuthnSessionToken,
  maskPhone,
  normalizeAuthMethod,
  normalizeCredentialStrength,
  normalizePurpose,
  recordSecurityAudit,
  signClinicalRecord,
  sanitizeAuditAuthMethod,
  sanitizeAuditCredentialStrength,
  storeWebAuthnCredential,
  uuidToBase64Url,
  verifyOtpChallenge,
  verifyStepUpToken,
  verifyWebAuthnSessionToken,
};
