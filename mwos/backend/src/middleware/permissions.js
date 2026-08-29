const { query } = require('../config/database');
const {
  ROLE_PERMISSION_MATRIX,
  SENSITIVE_PERMISSIONS,
  normalizePermissionRows,
} = require('../config/permissions');
const { resolveStepUpContext } = require('./stepUp');

const loadRolePermissions = async (role) => {
  const result = await query(
    'SELECT permission_key, is_allowed FROM role_permissions WHERE role = $1',
    [role]
  );

  if (result.rows.length > 0) {
    return normalizePermissionRows(result.rows);
  }

  return new Set(ROLE_PERMISSION_MATRIX[role] || []);
};

const loadPermissionOverrides = async (userId) => {
  const result = await query(
    `SELECT po.permission_key, po.effect
     FROM permission_overrides po
     INNER JOIN staff_registry sr ON sr.id = po.staff_id
     WHERE sr.user_id = $1
       AND (po.expires_at IS NULL OR po.expires_at > NOW())`,
    [userId]
  );

  return result.rows;
};

const loadStaffCredentialStatus = async (userId) => {
  const result = await query(
    'SELECT license_status FROM staff_registry WHERE user_id = $1',
    [userId]
  );

  return result.rows[0]?.license_status || null;
};

const authorizePermission = (permissionKey, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated',
          requestId: req.requestId || null,
        });
      }

      const permissions = await loadRolePermissions(req.user.role);
      for (const override of await loadPermissionOverrides(req.user.id)) {
        if (override.effect === 'grant') permissions.add(override.permission_key);
        if (override.effect === 'deny') permissions.delete(override.permission_key);
      }

      if (!permissions.has('*') && !permissions.has(permissionKey)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied for this action',
          requestId: req.requestId || null,
        });
      }

      const enforceCredentialCheck = options.requireVerifiedStaff ?? SENSITIVE_PERMISSIONS.has(permissionKey);
      if (enforceCredentialCheck && req.user.role !== 'patient') {
        const licenseStatus = await loadStaffCredentialStatus(req.user.id);
        if (licenseStatus !== 'verified') {
          return res.status(403).json({
            success: false,
            message: 'Staff credential verification is required for this action',
            requestId: req.requestId || null,
          });
        }
      }

      const enforceStepUp = options.requireStepUp ?? SENSITIVE_PERMISSIONS.has(permissionKey);
      if (enforceStepUp && req.user.role !== 'patient') {
        try {
          req.stepUp = resolveStepUpContext(req, options.stepUpPurpose || 'critical');
        } catch (stepUpErr) {
          return res.status(403).json({
            success: false,
            message: stepUpErr.message || 'Step-up authentication required',
            code: stepUpErr.message?.includes('purpose') ? 'STEP_UP_PURPOSE_MISMATCH' : 'STEP_UP_REQUIRED',
            requestId: req.requestId || null,
          });
        }
      }

      req.permissions = permissions;
      next();
    } catch (err) {
      console.error('Permission middleware error:', err);
      return res.status(500).json({
        success: false,
        message: 'Permission evaluation failed',
        requestId: req.requestId || null,
      });
    }
  };
};

module.exports = { authorizePermission };
