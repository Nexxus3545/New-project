const { query } = require('../config/database');
const { uuid } = require('../utils/workflowValidation');
const ownLinkedRecord = (table, parameter) => async (req, res, next) => {
  if (req.user.role !== 'patient') return next();
  try {
    uuid(req.params[parameter]);
    const result = await query(`SELECT r.id FROM ${table} r JOIN patients p ON p.id = r.patient_id WHERE r.id = $1 AND p.user_id = $2`, [req.params[parameter], req.user.id]);
    if (!result.rows.length) return res.status(403).json({ success: false, message: 'Access to this record is denied.' });
    next();
  } catch (error) { next(error); }
};
const ownPatientQuery = async (req, res, next) => {
  if (req.user.role !== 'patient') return next();
  try {
    const own = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
    if (!own.rows.length || (req.query.patientId && req.query.patientId !== own.rows[0].id)) return res.status(403).json({ success: false, message: 'Access to this patient record is denied.' });
    req.query.patientId = own.rows[0].id;
    next();
  } catch (error) { next(error); }
};
module.exports = { ownLinkedRecord, ownPatientQuery };
