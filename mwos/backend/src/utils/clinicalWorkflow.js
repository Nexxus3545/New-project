const { getClient } = require('../config/database');
const { fetchStaffProfileByUserId } = require('./staff');
const { signClinicalRecord } = require('./security');
const { fail, uuid } = require('./workflowValidation');

async function linkedPatient(client, patientId, links = {}) {
  uuid(patientId, 'Patient');
  if (!(await client.query('SELECT id FROM patients WHERE id=$1', [patientId])).rows.length) fail('Patient not found.', 404);
  for (const [table, id] of Object.entries(links)) {
    if (!id) continue;
    if (!['pregnancies', 'deliveries', 'newborn_records', 'appointments'].includes(table)) throw new Error('Invalid record relation');
    uuid(id);
    if (!(await client.query(`SELECT id FROM ${table} WHERE id=$1 AND patient_id=$2`, [id, patientId])).rows.length) fail('The linked record does not belong to this patient.');
  }
}

async function clinicalTransaction(req, table, action) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const profile = req.user.role === 'admin' ? null : await fetchStaffProfileByUserId(req.user.id, client);
    if (req.user.role !== 'admin' && !profile?.isVerified) fail('A current verified professional credential is required.', 403);
    const record = await action(client);
    if (profile) await signClinicalRecord({ client, staffProfile: profile, staffId: req.user.id, entityType: table, entityId: record.id, actionType: req.method === 'PATCH' ? 'update' : 'create', authMethod: req.stepUp?.authMethod, requestId: req.requestId });
    // Admins may transcribe clinic records, but never acquire a clinical signature.
    await client.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, request_id) VALUES ($1,$2,$3,$4,$5,$6)', [req.user.id, 'RECORD_SAVED', table, record.id, { entryRole: req.user.role, clinicallySigned: Boolean(profile) }, req.requestId || null]);
    await client.query('COMMIT');
    return record;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
module.exports = { clinicalTransaction, linkedPatient };
