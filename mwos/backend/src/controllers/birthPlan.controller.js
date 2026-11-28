const { query, getClient } = require('../config/database');
const { clinicalTransaction, linkedPatient } = require('../utils/clinicalWorkflow');
const v = require('../utils/workflowValidation');

const statusValues = ['draft', 'submitted', 'reviewed', 'active', 'completed', 'archived'];
const placeValues = ['clinic', 'hospital', 'undecided', 'other'];

const readValues = (body, { allowStatus = true } = {}) => ({
  planningStatus: allowStatus ? v.choice(body.planningStatus, 'birth-plan status', statusValues, 'draft') : undefined,
  preferredBirthPlace: v.choice(body.preferredBirthPlace, 'preferred birth place', placeValues, 'clinic'),
  supportPersonName: v.text(body.supportPersonName, 'Support person name', 200),
  supportPersonContact: v.text(body.supportPersonContact, 'Support person contact', 80),
  transportPlan: v.text(body.transportPlan, 'Transport plan', 3000),
  emergencyContactConfirmed: body.emergencyContactConfirmed === true,
  comfortPreferences: v.text(body.comfortPreferences, 'Comfort preferences', 3000),
  newbornCarePreferences: v.text(body.newbornCarePreferences, 'Newborn-care preferences', 3000),
  questionsForClinic: v.text(body.questionsForClinic, 'Questions for the clinic', 3000),
});

async function listByPatient(req, res, next) {
  try {
    const patientId = v.uuid(req.params.patientId, 'Patient');
    const result = await query(`SELECT b.*, u.first_name || ' ' || u.last_name AS reviewed_by_name
      FROM birth_plans b LEFT JOIN users u ON u.id=b.reviewed_by
      WHERE b.patient_id=$1 ORDER BY b.updated_at DESC`, [patientId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

async function save(req, res, next) {
  try {
    const patientId = v.uuid(req.body.patientId, 'Patient');
    const pregnancyId = v.uuid(req.body.pregnancyId, 'Pregnancy');
    const values = readValues(req.body);
    const record = await clinicalTransaction(req, 'birth_plans', async (client) => {
      await linkedPatient(client, patientId, { pregnancies: pregnancyId });
      const pregnancy = (await client.query('SELECT status FROM pregnancies WHERE id=$1 FOR UPDATE', [pregnancyId])).rows[0];
      if (!pregnancy || pregnancy.status !== 'active') v.fail('A birth plan can only be recorded for an active pregnancy.');
      const existing = (await client.query('SELECT * FROM birth_plans WHERE pregnancy_id=$1 FOR UPDATE', [pregnancyId])).rows[0];
      const columns = ['planning_status','preferred_birth_place','support_person_name','support_person_contact','transport_plan','emergency_contact_confirmed','comfort_preferences','newborn_care_preferences','questions_for_clinic'];
      const data = [values.planningStatus, values.preferredBirthPlace, values.supportPersonName, values.supportPersonContact, values.transportPlan, values.emergencyContactConfirmed, values.comfortPreferences, values.newbornCarePreferences, values.questionsForClinic];
      if (existing) {
        return (await client.query(`UPDATE birth_plans SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')}, updated_at=NOW() WHERE id=$10 RETURNING *`, [...data, existing.id])).rows[0];
      }
      return (await client.query(`INSERT INTO birth_plans (${columns.join(',')},patient_id,pregnancy_id,created_by)
        VALUES (${data.map((_, index) => `$${index + 1}`).join(',')},$10,$11,$12) RETURNING *`, [...data, patientId, pregnancyId, req.user.id])).rows[0];
    });
    res.status(201).json({ success: true, data: record });
  } catch (error) { next(error); }
}

async function review(req, res, next) {
  try {
    const id = v.uuid(req.params.id, 'Birth plan');
    const clinicianReview = v.text(req.body.clinicianReview, 'Clinician review', 3000, true);
    const planningStatus = v.choice(req.body.planningStatus, 'birth-plan status', ['reviewed', 'active', 'completed', 'archived'], 'reviewed');
    const record = await clinicalTransaction(req, 'birth_plans', async (client) => {
      const existing = (await client.query('SELECT * FROM birth_plans WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!existing) v.fail('Birth plan not found.', 404);
      return (await client.query(`UPDATE birth_plans SET clinician_review=$1, planning_status=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`, [clinicianReview, planningStatus, req.user.id, id])).rows[0];
    });
    res.json({ success: true, data: record });
  } catch (error) { next(error); }
}

async function mine(req, res, next) {
  try {
    const result = await query(`SELECT b.*, u.first_name || ' ' || u.last_name AS reviewed_by_name
      FROM birth_plans b JOIN patients p ON p.id=b.patient_id LEFT JOIN users u ON u.id=b.reviewed_by
      WHERE p.user_id=$1 ORDER BY b.updated_at DESC`, [req.user.id]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

async function submitMine(req, res, next) {
  let client;
  try {
    const values = readValues(req.body, { allowStatus: false });
    const requestedStatus = v.choice(req.body.planningStatus, 'birth-plan status', ['draft', 'submitted'], 'draft');
    client = await getClient(); await client.query('BEGIN');
    const pregnancy = (await client.query(`SELECT g.id, p.id AS patient_id FROM pregnancies g
      JOIN patients p ON p.id=g.patient_id WHERE g.id=$1 AND p.user_id=$2 AND g.status='active' FOR UPDATE`, [v.uuid(req.body.pregnancyId, 'Pregnancy'), req.user.id])).rows[0];
    if (!pregnancy) v.fail('Select one of your active pregnancy records.', 403);
    const existing = (await client.query('SELECT id FROM birth_plans WHERE pregnancy_id=$1 FOR UPDATE', [pregnancy.id])).rows[0];
    const columns = ['planning_status','preferred_birth_place','support_person_name','support_person_contact','transport_plan','emergency_contact_confirmed','comfort_preferences','newborn_care_preferences','questions_for_clinic'];
    const data = [requestedStatus, values.preferredBirthPlace, values.supportPersonName, values.supportPersonContact, values.transportPlan, values.emergencyContactConfirmed, values.comfortPreferences, values.newbornCarePreferences, values.questionsForClinic];
    const record = existing
      ? (await client.query(`UPDATE birth_plans SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')}, clinician_review=NULL, reviewed_by=NULL, reviewed_at=NULL, updated_at=NOW() WHERE id=$10 RETURNING *`, [...data, existing.id])).rows[0]
      : (await client.query(`INSERT INTO birth_plans (${columns.join(',')},patient_id,pregnancy_id,created_by) VALUES (${data.map((_, index) => `$${index + 1}`).join(',')},$10,$11,$12) RETURNING *`, [...data, pregnancy.patient_id, pregnancy.id, req.user.id])).rows[0];
    await client.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_values,request_id) VALUES ($1,'BIRTH_PLAN_SUBMITTED','birth_plans',$2,$3,$4)`, [req.user.id, record.id, { planningStatus: requestedStatus, selfService: true }, req.requestId || null]);
    await client.query('COMMIT'); res.status(201).json({ success: true, data: record });
  } catch (error) { if (client) await client.query('ROLLBACK'); next(error); } finally { client?.release(); }
}

module.exports = { listByPatient, save, review, mine, submitMine };
