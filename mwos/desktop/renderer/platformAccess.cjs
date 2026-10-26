const DESKTOP_STAFF_ROLES = new Set(['admin', 'doctor', 'midwife', 'nurse']);
const DESKTOP_ACCESS_MESSAGE = 'MWOS Desktop is for Admin, Doctor, Midwife and Nurse accounts. Patients can use the mobile app or the web patient portal.';

const isDesktopStaffAccount = (user) => DESKTOP_STAFF_ROLES.has(user?.role);
const requireDesktopStaffAccount = (user) => {
  if (!isDesktopStaffAccount(user)) {
    const error = new Error(DESKTOP_ACCESS_MESSAGE);
    error.code = 'DESKTOP_STAFF_ONLY';
    throw error;
  }
  return user;
};

module.exports = { isDesktopStaffAccount, requireDesktopStaffAccount, DESKTOP_ACCESS_MESSAGE };
