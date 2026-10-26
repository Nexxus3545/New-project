export const PATIENT_APP_ONLY = 'PATIENT_APP_ONLY';
export const PATIENT_APP_MESSAGE = 'MWOS Mobile is for patient accounts. Admin, doctor, midwife and nurse accounts use the desktop clinic workspace.';

export const isPatientAppAccount = (user) => user?.role === 'patient';

export const requirePatientAppAccount = (user) => {
  if (!isPatientAppAccount(user)) {
    const error = new Error(PATIENT_APP_MESSAGE);
    error.code = PATIENT_APP_ONLY;
    throw error;
  }
  return user;
};
