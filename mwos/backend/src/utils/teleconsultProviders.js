const { PROFESSIONAL_CREDENTIAL_COLUMNS, isCurrentProfessionalCredential } = require('../middleware/professionalCredential');

const CLINICAL_PROVIDER_ROLES = ['doctor', 'midwife', 'nurse'];
const providerLabel = (role) => role === 'admin' ? 'Admin · Clinic coordinator' : role.charAt(0).toUpperCase() + role.slice(1);

// Account roles never change. Only active professionals with current, reviewed
// credentials can replace the administrative fallback for new requests.
const getTeleconsultProviders = async (client) => {
  const result = await client.query(`SELECT u.id, u.first_name, u.last_name, u.role, u.avatar_url,
      sr.license_status, sr.license_number, sr.credential_expires_at,
      ${PROFESSIONAL_CREDENTIAL_COLUMNS}
    FROM users u
    LEFT JOIN staff_registry sr ON sr.user_id = u.id
    LEFT JOIN account_credentials ac ON ac.user_id = u.id
    WHERE u.is_active = true AND u.role = ANY($1)
    ORDER BY u.role, u.last_name, u.first_name, u.id`,
  [['admin', ...CLINICAL_PROVIDER_ROLES]]);
  const clinicians = result.rows.filter(row => isCurrentProfessionalCredential(row));
  const available = clinicians.length ? clinicians : result.rows.filter(row => row.role === 'admin');
  // Return only public directory fields, never license numbers or documents.
  return available.map(({ id, first_name, last_name, role, avatar_url }) => ({
    id, first_name, last_name, role, avatar_url,
    provider_kind: role === 'admin' ? 'coordination' : 'clinical',
    provider_label: providerLabel(role),
  }));
};

const isTeleconsultProviderAvailable = async (client, person, { existingAssignment = false } = {}) => {
  if (!person?.is_active) return false;
  // Existing coordinator requests can be completed after a clinician joins.
  if (existingAssignment && person.role === 'admin') return true;
  if (!['admin', ...CLINICAL_PROVIDER_ROLES].includes(person.role)) return false;
  return (await getTeleconsultProviders(client)).some(provider => provider.id === person.id);
};

module.exports = { CLINICAL_PROVIDER_ROLES, getTeleconsultProviders, isTeleconsultProviderAvailable };
