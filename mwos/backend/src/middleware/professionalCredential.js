const { query } = require('../config/database');

const PROFESSIONAL_ROLES = new Set(['doctor', 'nurse', 'midwife']);

const isCredentialSelfServiceRoute = (req) => {
  const ownAccount = req.path.startsWith('/account/');
  const ownStaffProfile = /^\/staff\/registry\/me(?:\/documents)?\/?$/.test(req.path);
  const ownNotifications = (req.method === 'GET' && /^\/notifications(?:\/settings)?\/?$/.test(req.path))
    || (req.method === 'PATCH' && /^\/notifications\/[^/]+\/read\/?$/.test(req.path));
  return ownAccount || ownStaffProfile || ownNotifications;
};

const manilaDateKey = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

// PostgreSQL DATE values are calendar dates. node-postgres can return them as
// Date at local midnight, so converting through UTC can shift the expiry day.
const credentialDateKey = (value) => {
  const key = value instanceof Date && Number.isFinite(value.getTime())
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : typeof value === 'string' ? value : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return key;
};

const PROFESSIONAL_CREDENTIAL_COLUMNS = `
  u.role AS credential_role,
  ac.kind AS account_credential_kind,
  ac.status AS account_credential_status,
  ac.license_number AS account_credential_license_number,
  ac.expires_at AS account_credential_expires_at,
  (ac.document_bytes IS NOT NULL AND octet_length(ac.document_bytes) > 0) AS account_credential_has_document`;

const isCurrentProfessionalCredential = (row, now = new Date()) => {
  if (!row || !PROFESSIONAL_ROLES.has(row.credential_role || row.role)) return false;
  const licenseNumber = typeof row.license_number === 'string' ? row.license_number.trim() : '';
  const proofNumber = typeof row.account_credential_license_number === 'string' ? row.account_credential_license_number.trim() : '';
  const registryExpiry = credentialDateKey(row.credential_expires_at);
  const proofExpiry = credentialDateKey(row.account_credential_expires_at);
  return row.license_status === 'verified'
    && row.account_credential_kind === 'professional_license'
    && row.account_credential_status === 'verified'
    && row.account_credential_has_document === true
    && Boolean(licenseNumber) && licenseNumber === proofNumber
    && Boolean(registryExpiry) && registryExpiry === proofExpiry
    && registryExpiry >= manilaDateKey(now);
};

const loadProfessionalCredential = async (userId, executor = { query }) => {
  const result = await executor.query(
    `SELECT sr.license_status, sr.license_number, sr.credential_expires_at,
       ${PROFESSIONAL_CREDENTIAL_COLUMNS}
     FROM users u
     LEFT JOIN staff_registry sr ON sr.user_id = u.id
     LEFT JOIN account_credentials ac ON ac.user_id = u.id
     WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

const requireCurrentProfessionalCredential = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  // Administrative accounts and patient identities have separate requirements.
  // This middleware is mounted only after the account's own credential and
  // security routes, so a pending clinician can still sign in and submit proof.
  if (!PROFESSIONAL_ROLES.has(req.user.role)) return next();
  try {
    const credential = await loadProfessionalCredential(req.user.id);
    if (!isCurrentProfessionalCredential(credential)) {
      return res.status(403).json({
        success: false, code: 'PROFESSIONAL_CREDENTIAL_REQUIRED',
        message: 'A current professional license reviewed by the clinic is required. Open Account settings to submit or renew your credential.',
        requestId: req.requestId || null,
      });
    }
    req.professionalCredential = { userId: req.user.id, checked: true };
    return next();
  } catch (error) { return next(error); }
};

module.exports = {
  PROFESSIONAL_ROLES, PROFESSIONAL_CREDENTIAL_COLUMNS, credentialDateKey,
  manilaDateKey, isCurrentProfessionalCredential, loadProfessionalCredential,
  requireCurrentProfessionalCredential,
  isCredentialSelfServiceRoute,
};
