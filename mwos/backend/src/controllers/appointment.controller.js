const { query, getClient } = require('../config/database');
const { APPOINTMENT_TYPES, MATERNAL_APPOINTMENTS } = require('../utils/patientCare');
const { queueAppointmentNotification, deliverNotification } = require('../utils/notificationEvents');

const getAll = async (req, res, next) => {
  try {
    const { status, date, patientId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }
    if (date) { conditions.push(`a.scheduled_date = $${idx++}`); params.push(date); }
    if (patientId) { conditions.push(`a.patient_id = $${idx++}`); params.push(patientId); }

    // Patients only see their own
    if (req.user.role === 'patient') {
      const pResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (pResult.rows.length > 0) {
        conditions.push(`a.patient_id = $${idx++}`);
        params.push(pResult.rows[0].id);
      } else {
        return res.json({ success: true, data: [], pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 } });
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await query(`SELECT COUNT(*) FROM appointments a ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT a.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone as patient_phone,
        u.first_name || ' ' || u.last_name as assigned_to_name
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN users u ON u.id = a.assigned_to
       ${where}
       ORDER BY a.scheduled_date ASC, a.scheduled_time ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const getToday = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone as patient_phone,
        p.risk_level,
        u.first_name || ' ' || u.last_name as assigned_to_name
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN users u ON u.id = a.assigned_to
       WHERE a.scheduled_date = CURRENT_DATE
       ORDER BY a.scheduled_time ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  let client;
  let committed = false;
  let appointment;
  let eventId;
  try {
    const { patientId, pregnancyId, assignedTo, appointmentType, scheduledDate, scheduledTime, notes } = req.body;

    if (!patientId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ success: false, message: 'Patient ID, date, and time are required' });
    }

    const type = appointmentType || 'consultation';
    if (!APPOINTMENT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'Select a supported appointment type' });
    }
    client = await getClient();
    await client.query('BEGIN');
    if (req.user.role === 'patient') {
      const ownPatient = await client.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (ownPatient.rows[0]?.id !== patientId) {
        return res.status(403).json({ success: false, message: 'You can only book appointments for your own patient record' });
      }
    }
    if (pregnancyId) {
      if (!MATERNAL_APPOINTMENTS.includes(type)) {
        return res.status(400).json({ success: false, message: 'General checkups must not be linked to a pregnancy' });
      }
      const pregnancy = await client.query('SELECT id FROM pregnancies WHERE id = $1 AND patient_id = $2', [pregnancyId, patientId]);
      if (!pregnancy.rows.length) {
        return res.status(400).json({ success: false, message: 'The pregnancy record does not belong to this patient' });
      }
    }

    // Check for conflicts
    const conflict = await client.query(
      `SELECT id FROM appointments
       WHERE assigned_to = $1 AND scheduled_date = $2 AND scheduled_time = $3 AND status NOT IN ('cancelled','no_show')`,
      [assignedTo, scheduledDate, scheduledTime]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Time slot already booked for this provider' });
    }

    const result = await client.query(
      `INSERT INTO appointments (patient_id, pregnancy_id, assigned_to, appointment_type, scheduled_date, scheduled_time, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patientId, pregnancyId || null, assignedTo || null, type, scheduledDate, scheduledTime, notes || null, req.user.id]
    );

    appointment = result.rows[0];
    eventId = await queueAppointmentNotification(client, appointment, req.user.id);
    await client.query('COMMIT');
    committed = true;
  } catch (err) {
    return next(err);
  } finally {
    if (client && !committed) await client.query('ROLLBACK').catch(() => {});
    client?.release();
  }
  const notification = await deliverNotification(eventId);
  return res.status(201).json({ success: true, message: 'Appointment scheduled', data: appointment, notification });
};

const update = async (req, res, next) => {
  let client;
  let committed = false;
  let appointment;
  let eventId;
  try {
    const { id } = req.params;
    const { status, notes, scheduledDate, scheduledTime } = req.body;

    if (status && !['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Select a valid appointment status' });
    }
    client = await getClient();
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.user.role === 'patient') {
      const ownPatient = await client.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (ownPatient.rows[0]?.id !== existing.rows[0].patient_id) {
        return res.status(403).json({ success: false, message: 'You can only update your own appointments' });
      }
      if (status && status !== 'cancelled') {
        return res.status(403).json({ success: false, message: 'Only clinic staff can confirm or complete an appointment' });
      }
    }

    const result = await client.query(
      `UPDATE appointments SET
        status = COALESCE($1, status),
        notes = COALESCE($2, notes),
        scheduled_date = COALESCE($3, scheduled_date),
        scheduled_time = COALESCE($4, scheduled_time),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status || null, notes || null, scheduledDate || null, scheduledTime || null, id]
    );

    appointment = result.rows[0];
    const previous = existing.rows[0];
    const dateKey = (value) => new Date(value).toISOString().slice(0, 10);
    const changed = previous.status !== appointment.status || dateKey(previous.scheduled_date) !== dateKey(appointment.scheduled_date)
      || String(previous.scheduled_time).slice(0, 5) !== String(appointment.scheduled_time).slice(0, 5);
    if (changed) eventId = await queueAppointmentNotification(client, appointment, req.user.id);
    await client.query('COMMIT');
    committed = true;
  } catch (err) {
    return next(err);
  } finally {
    if (client && !committed) await client.query('ROLLBACK').catch(() => {});
    client?.release();
  }
  const notification = await deliverNotification(eventId);
  return res.json({ success: true, message: 'Appointment updated', data: appointment, notification });
};

module.exports = { getAll, getToday, create, update };
