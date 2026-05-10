const { query } = require('../config/database');

const categorizeBP = (systolic, diastolic) => {
  if (!systolic || !diastolic) return 'unknown';
  if (systolic >= 180 || diastolic >= 120) return 'hypertensive_crisis';
  if (systolic >= 140 || diastolic >= 90) return 'stage2_hypertension';
  if (systolic >= 130 || diastolic >= 80) return 'stage1_hypertension';
  if (systolic >= 120 && diastolic < 80) return 'elevated';
  return 'normal';
};

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

    const bpCategory = categorizeBP(bpSystolic, bpDiastolic);
    let bmi = null;
    if (weightKg && heightCm) {
      const heightM = heightCm / 100;
      bmi = (weightKg / (heightM * heightM)).toFixed(2);
    }

    const result = await query(
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

    const vitals = result.rows[0];
    const alerts = [];

    if (['stage2_hypertension', 'hypertensive_crisis'].includes(bpCategory)) {
      alerts.push({ type: 'critical', message: `High BP detected: ${bpSystolic}/${bpDiastolic} mmHg (${bpCategory.replace(/_/g,' ')})` });
    }
    if (fetalMovement === 'absent') {
      alerts.push({ type: 'critical', message: 'Absent fetal movement reported — immediate assessment required' });
    }
    if (fetalHeartRate && (fetalHeartRate < 110 || fetalHeartRate > 160)) {
      alerts.push({ type: 'warning', message: `Abnormal FHR: ${fetalHeartRate} bpm (normal: 110-160)` });
    }

    res.status(201).json({
      success: true,
      message: 'Vitals recorded successfully',
      data: vitals,
      alerts: alerts.length > 0 ? alerts : undefined,
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
