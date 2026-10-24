const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];
const CARE_TYPES = ['general', 'maternal'];
const MATERNAL_APPOINTMENTS = ['prenatal', 'postnatal', 'postpartum', 'delivery'];
const APPOINTMENT_TYPES = ['consultation', 'follow_up', 'lab_review', ...MATERNAL_APPOINTMENTS];

const patientChoice = (value, allowed, label) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value.trim())) {
    const error = new Error(`Select a valid ${label}.`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
};

const normalizePatientCare = (payload = {}, { newPatient = false } = {}) => ({
  ...(Object.hasOwn(payload, 'gender') || newPatient
    ? { gender: patientChoice(payload.gender, GENDERS, 'gender') } : {}),
  ...(Object.hasOwn(payload, 'careType') || newPatient
    ? { careType: patientChoice(payload.careType, CARE_TYPES, 'care type') || (newPatient ? 'general' : null) } : {}),
});

module.exports = { normalizePatientCare, APPOINTMENT_TYPES, MATERNAL_APPOINTMENTS };
