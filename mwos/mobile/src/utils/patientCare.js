export const genderOptions = [
  { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' },
  { value: 'other', label: 'Another gender' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
export const careOptions = [
  { value: 'general', label: 'General clinic care / checkups' },
  { value: 'maternal', label: 'Pregnancy / postnatal care' },
]
export const isMaternalAppointment = (type) => ['prenatal', 'postnatal', 'postpartum', 'delivery'].includes(type)
export const hasMaternalCare = (profile = {}) => profile.care_type === 'maternal' || profile.careType === 'maternal'
  || Boolean(profile.activePregnancy) || (profile.pregnancies || []).some((pregnancy) => pregnancy?.status === 'active')

const savedNumber = (value) => (typeof value === 'number' || typeof value === 'string') && String(value).trim() && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null
export function savedMetrics(vitals, includeMaternal = false) {
  const systolic = savedNumber(vitals?.bp_systolic)
  const diastolic = savedNumber(vitals?.bp_diastolic)
  return [
    { label: 'Blood pressure (mmHg)', value: systolic && diastolic ? `${systolic}/${diastolic}` : 'Not recorded' },
    { label: 'Weight (kg)', value: savedNumber(vitals?.weight_kg) ?? 'Not recorded' },
    ...(includeMaternal ? [
      { label: 'Fetal heart rate (bpm)', value: savedNumber(vitals?.fetal_heart_rate) ?? 'Not recorded' },
      { label: 'Fetal movement', value: vitals?.fetal_movement || 'Not recorded' },
    ] : [
      { label: 'Pulse rate (bpm)', value: savedNumber(vitals?.pulse_rate) ?? 'Not recorded' },
      { label: 'Temperature (Celsius)', value: savedNumber(vitals?.temperature) ?? 'Not recorded' },
    ]),
  ]
}
