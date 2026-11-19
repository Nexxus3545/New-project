const isSuperAdmin = user => user?.role === 'admin' && user.is_super_admin === true;

function isAdministrationRoute(path) {
  return /^\/(?:users|admin|security\/audit|credentials\/users)(?:\/|$)/.test(path)
    || path === '/account/deletion-requests' || path === '/reports/audit-logs'
    || (path.startsWith('/staff/') && !path.startsWith('/staff/registry/me'));
}

function requireSuperAdminForAdministration(req, res, next) {
  if (isAdministrationRoute(req.path) && !isSuperAdmin(req.user)) {
    return res.status(403).json({ success: false, code: 'SUPER_ADMIN_REQUIRED', message: 'Only the Super Admin can manage clinic accounts, credentials, audit access, and backups.' });
  }
  next();
}

module.exports = { isSuperAdmin, isAdministrationRoute, requireSuperAdminForAdministration };
