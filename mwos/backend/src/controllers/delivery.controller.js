const { query } = require('../config/database');

const create = async (req, res, next) => {
  try {
    const {
      patientId, pregnancyId, deliveryDate, deliveryTime, deliveryType,
      gestationalAgeAtDelivery, newbornSex, birthWeightKg, apgar1min,
      apgar5min, newbornCondition, complications, placentaDelivery,
      bloodLossMl, notes
    } = req.body;

    if (!patientId || !pregnancyId || !deliveryDate) {
      return res.status(400).json({ success: false, message: 'Patient ID, pregnancy ID, and delivery date are required' });
    }

    const result = await query(
      `INSERT INTO deliveries (
        patient_id, pregnancy_id, delivery_date, delivery_time,
        delivery_type, gestational_age_at_delivery, birth_attendant,
        newborn_sex, birth_weight_kg, apgar_1min, apgar_5min,
        newborn_condition, complications, placenta_delivery,
        blood_loss_ml, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        patientId, pregnancyId, deliveryDate, deliveryTime || null,
        deliveryType || 'NSD', gestationalAgeAtDelivery || null, req.user.id,
        newbornSex || null, birthWeightKg || null, apgar1min || null,
        apgar5min || null, newbornCondition || null, complications || null,
        placentaDelivery || null, bloodLossMl || null, notes || null, req.user.id
      ]
    );

    // Update pregnancy status
    await query(
      'UPDATE pregnancies SET status = $1, updated_at = NOW() WHERE id = $2',
      ['delivered', pregnancyId]
    );

    res.status(201).json({ success: true, message: 'Delivery recorded', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const result = await query(
      `SELECT d.*,
        u.first_name || ' ' || u.last_name as birth_attendant_name
       FROM deliveries d
       LEFT JOIN users u ON u.id = d.birth_attendant
       WHERE d.patient_id = $1
       ORDER BY d.delivery_date DESC`,
      [patientId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const addLaborProgress = async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const {
      cervicalDilation, fetalStation, fetalHeartRate,
      contractionsPerMin, contractionDuration, bpSystolic, bpDiastolic,
      pulseRate, temperature, urineOutput, oxytocinUnits, notes
    } = req.body;

    // Check alert/action line
    const delivery = await query('SELECT delivery_date FROM deliveries WHERE id = $1', [deliveryId]);
    if (delivery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Delivery record not found' });
    }

    // Alert line: cervical dilation < 1cm/hr; action line: 4hrs behind alert
    const prevProgress = await query(
      'SELECT cervical_dilation, recorded_at FROM labor_progress WHERE delivery_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [deliveryId]
    );

    let alertFlag = false;
    let actionFlag = false;

    if (prevProgress.rows.length > 0 && cervicalDilation) {
      const prev = prevProgress.rows[0];
      const hoursDiff = (new Date() - new Date(prev.recorded_at)) / 3600000;
      const dilationRate = (cervicalDilation - prev.cervical_dilation) / hoursDiff;
      if (dilationRate < 1) alertFlag = true;
      if (dilationRate < 0.5) actionFlag = true;
    }

    if (fetalHeartRate && (fetalHeartRate < 110 || fetalHeartRate > 160)) alertFlag = true;
    if (bpSystolic >= 140 || bpDiastolic >= 90) alertFlag = true;

    const result = await query(
      `INSERT INTO labor_progress (
        delivery_id, cervical_dilation, fetal_station, fetal_heart_rate,
        contractions_per_10min, contraction_duration, bp_systolic, bp_diastolic,
        pulse_rate, temperature, urine_output, oxytocin_units,
        alert_flag, action_flag, notes, recorded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        deliveryId, cervicalDilation || null, fetalStation || null, fetalHeartRate || null,
        contractionsPerMin || null, contractionDuration || null, bpSystolic || null, bpDiastolic || null,
        pulseRate || null, temperature || null, urineOutput || null, oxytocinUnits || null,
        alertFlag, actionFlag, notes || null, req.user.id
      ]
    );

    const warnings = [];
    if (alertFlag) warnings.push({ type: 'alert', message: 'Alert line crossed — labor progress needs monitoring' });
    if (actionFlag) warnings.push({ type: 'action', message: 'Action line crossed — immediate intervention required' });

    res.status(201).json({
      success: true,
      message: 'Labor progress recorded',
      data: result.rows[0],
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    next(err);
  }
};

const getLaborProgress = async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const result = await query(
      'SELECT * FROM labor_progress WHERE delivery_id = $1 ORDER BY recorded_at ASC',
      [deliveryId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, getByPatient, addLaborProgress, getLaborProgress };
