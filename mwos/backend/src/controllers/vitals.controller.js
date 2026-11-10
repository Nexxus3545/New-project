const { query } = require('../config/database');
const { clinicalTransaction, linkedPatient } = require('../utils/clinicalWorkflow');
const v = require('../utils/workflowValidation');

const create = async (req, res, next) => {
  try {
    const {
      patientId, pregnancyId, appointmentId, visitDate,
      gestationalAgeWeeks, weightKg, heightCm, bpSystolic, bpDiastolic,
      pulseRate, temperature, respiratoryRate, fundalHeightCm,
      fetalHeartRate, fetalPresentation, fetalMovement, edema, notes
    } = req.body;

    if (!patientId || !visitDate) {
      return res.status(400).json({ success: false, message: 'Patient ID and visit date are required' });
    }

    v.uuid(patientId, 'Patient'); v.date(visitDate, 'Visit date');
    for (const [key,value,max] of [['weight',weightKg,500],['height',heightCm,250],['systolic',bpSystolic,350],['diastolic',bpDiastolic,250],['pulse',pulseRate,300],['temperature',temperature,50],['FHR',fetalHeartRate,300]]) v.number(value,key,0,max);
    // Store measurements for clinical review; no unapproved diagnostic classifier.
    const bpCategory = 'not_classified';
    let bmi = null;
    if (weightKg && heightCm) {
      const heightM = heightCm / 100;
      bmi = (weightKg / (heightM * heightM)).toFixed(2);
    }

    const vitals = await clinicalTransaction(req, 'vitals', async client => {
    await linkedPatient(client, patientId, { pregnancies: pregnancyId, appointments: appointmentId });
    const result = await client.query(
      `INSERT INTO vitals (
        patient_id, pregnancy_id, appointment_id, visit_date,
        gestational_age_weeks, weight_kg, height_cm, bmi,
        bp_systolic, bp_diastolic, bp_category, pulse_rate,
        temperature, respiratory_rate, fundal_height_cm,
        fetal_heart_rate, fetal_presentation, fetal_movement,
        edema, notes, recorded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        patientId, pregnancyId || null, appointmentId || null, visitDate,
        gestationalAgeWeeks || null, weightKg || null, heightCm || null, bmi,
        bpSystolic || null, bpDiastolic || null, bpCategory, pulseRate || null,
        temperature || null, respiratoryRate || null, fundalHeightCm || null,
        fetalHeartRate || null, fetalPresentation || null, fetalMovement || null,
        edema || null, notes || null, req.user.id
      ]
    );

    return result.rows[0];
    });

    res.status(201).json({
      success: true,
      message: 'Vitals recorded successfully',
      data: vitals,
      reviewRequired: true,
    });
  } catch (err) {
    next(err);
  }
};

const getByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT v.*, u.first_name || ' ' || u.last_name as recorded_by_name
       FROM vitals v
       LEFT JOIN users u ON u.id = v.recorded_by
       WHERE v.patient_id = $1
       ORDER BY v.visit_date DESC, v.created_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, limit, offset]
    );

    const count = await query('SELECT COUNT(*) FROM vitals WHERE patient_id = $1', [patientId]);

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count.rows[0].count) },
    });
  } catch (err) {
    next(err);
  }
};

const getTrend = async (req, res, next) => {
  try {
    const { pregnancyId } = req.params;
    const result = await query(
      `SELECT visit_date, bp_systolic, bp_diastolic, bp_category,
        weight_kg, fundal_height_cm, fetal_heart_rate, gestational_age_weeks
       FROM vitals WHERE pregnancy_id = $1
       ORDER BY visit_date ASC`,
      [pregnancyId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, getByPatient, getTrend };
