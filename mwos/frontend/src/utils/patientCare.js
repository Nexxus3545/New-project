export const genderOptions = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Another gender' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
export const careOptions = [
  { value: 'general', label: 'General clinic care / checkups' },
  { value: 'maternal', label: 'Pregnancy / postnatal care' },
]
export const generalAppointments = [
  { value: 'consultation', label: 'General checkup' },
  { value: 'follow_up', label: 'General follow-up' },
  { value: 'lab_review', label: 'Laboratory result review' },
]
export const maternalAppointments = [
  { value: 'prenatal', label: 'Prenatal checkup' },
  { value: 'postnatal', label: 'Postnatal follow-up' },
]
export const isMaternalAppointment = (type) => ['prenatal', 'postnatal', 'postpartum', 'delivery'].includes(type)

// A care preference is not a pregnancy diagnosis. Keep actual active records accessible.
export function hasMaternalCare(profile = {}) {
  return profile.careType === 'maternal' || profile.care_type === 'maternal'
    || profile.hasActivePregnancy === true || Boolean(profile.activePregnancy || profile.active_pregnancy_id)
    || (profile.pregnancies || []).some((pregnancy) => pregnancy?.status === 'active')
}

export function appointmentLabel(type) {
  return [...generalAppointments, ...maternalAppointments].find((option) => option.value === type)?.label
    || String(type || 'Clinic visit').replaceAll('_', ' ')
}
