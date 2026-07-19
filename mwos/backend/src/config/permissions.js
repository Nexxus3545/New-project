const ROLE_PERMISSION_MATRIX = {
  admin: ['*'],
  doctor: [
    'patients:read',
    'patients:write',
    'appointments:write',
    'clinical:vitals:write',
    'clinical:deliveries:write',
    'clinical:labs:write',
    'clinical:ultrasounds:write',
    'clinical:postpartum:write',
    'clinical:immunizations:write',
    'clinical:prescriptions:write',
    'clinical:documents:review',
    'pharmacy:write',
    'content:education:write',
    'content:media:write',
    'finance:billing:write',
    'reports:read',
    'communication:write',
  ],
  midwife: [
    'patients:read',
    'patients:write',
    'appointments:write',
    'clinical:vitals:write',
    'clinical:deliveries:write',
    'clinical:postpartum:write',
    'clinical:immunizations:write',
    'clinical:documents:review',
    'content:education:write',
    'content:media:write',
    'communication:write',
    'reports:read',
  ],
  nurse: [
    'patients:read',
    'appointments:write',
    'clinical:vitals:write',
    'clinical:labs:write',
    'clinical:immunizations:write',
    'clinical:documents:review',
    'operations:inventory:write',
    'pharmacy:write',
    'communication:write',
    'reports:read',
  ],
  patient: [
    'patients:self:read',
    'patients:self:update',
    'appointments:self:write',
    'documents:self:upload',
    'communication:self:write',
    'education:read',
    'inventory:read',
    'pharmacy:read',
    'reports:self:read',
  ],
};

const SENSITIVE_PERMISSIONS = new Set([
  'patients:write',
  'clinical:vitals:write',
  'clinical:deliveries:write',
  'clinical:labs:write',
  'clinical:ultrasounds:write',
  'clinical:postpartum:write',
  'clinical:immunizations:write',
  'clinical:prescriptions:write',
  'clinical:documents:review',
  'operations:inventory:write',
  'pharmacy:write',
  'content:education:write',
  'content:media:write',
  'finance:billing:write',
]);

const LICENSE_STATUS_LABELS = {
  pending: 'Pending review',
  verified: 'Verified',
  suspended: 'Suspended',
  expired: 'Expired',
};

const normalizePermissionRows = (rows = []) => new Set(
  rows
    .filter((row) => row && row.is_allowed !== false)
    .map((row) => row.permission_key)
);

module.exports = {
  LICENSE_STATUS_LABELS,
  ROLE_PERMISSION_MATRIX,
  SENSITIVE_PERMISSIONS,
  normalizePermissionRows,
};
