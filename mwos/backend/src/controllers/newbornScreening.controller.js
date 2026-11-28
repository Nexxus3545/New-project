const { query } = require('../config/database');
const { clinicalTransaction, linkedPatient } = require('../utils/clinicalWorkflow');
const v = require('../utils/workflowValidation');
const newbornStatuses = ['pending','collected','documented','follow_up_needed','referred'];
const hearingStatuses = ['pending','documented','follow_up_needed','referred'];

async function list(req, res, next) {
  try {
    const patientId = v.uuid(req.params.patientId, 'Patient');
    res.json({ success: true, data: (await query(`SELECT s.*, u.first_name || ' ' || u.last_name AS recorded_by_name, u.role AS entry_role
      FROM newborn_screenings s LEFT JOIN users u ON u.id=s.recorded_by WHERE s.patient_id=$1 ORDER BY s.screened_on DESC, s.created_at DESC`, [patientId])).rows });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const patientId = v.uuid(req.body.patientId, 'Patient');
    const newbornId = v.uuid(req.body.newbornId, 'Newborn');
    const screenedOn = v.date(req.body.screenedOn, 'Screening date');
    const newbornStatus = v.choice(req.body.newbornScreeningStatus, 'newborn screening status', newbornStatuses, 'pending');
    const hearingStatus = v.choice(req.body.hearingScreenStatus, 'hearing-screen status', hearingStatuses, 'pending');
    const followUpDate = v.date(req.body.followUpDate, 'Follow-up date', false);
    const notes = v.text(req.body.notes, 'Screening notes', 3000);
    const record = await clinicalTransaction(req, 'newborn_screenings', async (client) => {
      await linkedPatient(client, patientId, { newborn_records: newbornId });
      return (await client.query(`INSERT INTO newborn_screenings (patient_id,newborn_id,screened_on,newborn_screening_status,hearing_screen_status,follow_up_date,notes,recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [patientId,newbornId,screenedOn,newbornStatus,hearingStatus,followUpDate,notes,req.user.id])).rows[0];
    });
    res.status(201).json({ success: true, data: record });
  } catch (error) { next(error); }
}
module.exports = { list, create };
