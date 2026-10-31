export const telehealthProviderLabel = person => person?.role === 'admin'
  ? 'Admin · Clinic coordinator'
  : person?.provider_label || (person?.role || 'Care team').replace(/\b\w/g, character => character.toUpperCase())
