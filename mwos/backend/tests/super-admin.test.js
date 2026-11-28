const test = require('node:test');
const assert = require('node:assert/strict');
const { isSuperAdmin, isAdministrationRoute, requireSuperAdminForAdministration } = require('../src/middleware/superAdmin');
test('only the explicit administrator flag grants Super Admin access', () => {
  assert.equal(isSuperAdmin({role:'admin'}), false);
  assert.equal(isSuperAdmin({role:'doctor',is_super_admin:true}), false);
  assert.equal(isSuperAdmin({role:'admin',is_super_admin:true}), true);
});
test('account administration is restricted while self service remains accessible', () => {
  for (const path of ['/users','/users/x/toggle','/admin/backup','/credentials/users/x','/security/audit','/staff/registry','/staff/documents/x/review']) assert.equal(isAdministrationRoute(path),true,path);
  for (const path of ['/staff/registry/me','/staff/registry/me/documents','/credentials/mine','/account/security','/appointments']) assert.equal(isAdministrationRoute(path),false,path);
  let status, called=false;
  requireSuperAdminForAdministration({path:'/users',user:{role:'admin'}},{status(n){status=n;return this},json(){}},()=>{called=true});
  assert.equal(status,403);assert.equal(called,false);
});
