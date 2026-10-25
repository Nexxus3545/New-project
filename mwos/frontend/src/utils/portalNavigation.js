const patientDestinations = { appointment: '/my/appointments', team: '/my/doctors' }
const staffRoles = new Set(['admin', 'doctor', 'midwife', 'nurse'])

export const getPortalIntent = (search = '') => {
  const value = new URLSearchParams(search).get('intent')
  return Object.hasOwn(patientDestinations, value) ? value : ''
}

export const getPortalDestination = (user, intent = '') => {
  const knownIntent = Object.hasOwn(patientDestinations, intent) ? intent : ''
  if (!user) return `/login${knownIntent ? `?intent=${knownIntent}` : ''}`
  if (user.role === 'patient') return patientDestinations[knownIntent] || '/my/dashboard'
  return staffRoles.has(user.role) ? '/dashboard' : '/'
}
