const { query } = require('../config/database');

const getAll = async (req, res, next) => {
  try {
    const { search, risk_level, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR p.philhealth_id ILIKE $${idx} OR p.phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (risk_level) {
      conditions.push(`p.risk_level = $${idx}`);
      params.push(risk_level);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM patients p ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT p.*, 
        pr.id as active_pregnancy_id,
        pr.edd, pr.status as pregnancy_status,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'scheduled') as upcoming_appointments
       FROM patients p
       LEFT JOIN pregnancies pr ON pr.patient_id = p.id AND pr.status = 'active'
       ${where}
       ORDER BY p.created_at DESC
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

const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.*,
        json_agg(DISTINCT pr.*) FILTER (WHERE pr.id IS NOT NULL) as pregnancies,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) as total_appointments
       FROM patients p
       LEFT JOIN pregnancies pr ON pr.patient_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*,
        json_agg(DISTINCT pr.*) FILTER (WHERE pr.id IS NOT NULL) as pregnancies
       FROM patients p
       LEFT JOIN pregnancies pr ON pr.patient_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const {
      userId, firstName, lastName, dateOfBirth, civilStatus, religion,
      nationality, address, city, phone, email, emergencyContactName,
      emergencyContactPhone, emergencyContactRelation, philhealthId,
      philhealthType, bloodType, allergies, existingConditions,
      currentMedications, obGyneHistory, riskLevel
    } = req.body;

    if (!firstName || !lastName || !dateOfBirth) {
      return res.status(400).json({ success: false, message: 'First name, last name, and date of birth are required' });
    }

    const result = await query(
      `INSERT INTO patients (
        user_id, first_name, last_name, date_of_birth, civil_status, religion,
        nationality, address, city, phone, email, emergency_contact_name,
        emergency_contact_phone, emergency_contact_relation, philhealth_id,
        philhealth_type, blood_type, allergies, existing_conditions,
        current_medications, ob_gyne_history, risk_level, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [
        userId || null, firstName, lastName, dateOfBirth, civilStatus || null,
        religion || null, nationality || 'Filipino', address || null, city || null,
        phone || null, email || null, emergencyContactName || null,
        emergencyContactPhone || null, emergencyContactRelation || null,
        philhealthId || null, philhealthType || null, bloodType || null,
        allergies || null, existingConditions || null, currentMedications || null,
        JSON.stringify(obGyneHistory || {}), riskLevel || 'low', req.user.id
      ]
    );

    res.status(201).json({ success: true, message: 'Patient registered successfully', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT id FROM patients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const fields = ['first_name','last_name','date_of_birth','civil_status','religion',
      'nationality','address','city','phone','email','emergency_contact_name',
      'emergency_contact_phone','emergency_contact_relation','philhealth_id','blood_type','allergies',
      'existing_conditions','current_medications','risk_level'];
    const keys = Object.keys(req.body).filter(k => {
      const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      return fields.includes(snake);
    });

    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const setClause = keys.map((k, i) => {
      const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      return `${snake} = $${i + 1}`;
    }).join(', ');

    const values = keys.map(k => req.body[k]);
    values.push(id);

    const result = await query(
      `UPDATE patients SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );

    res.json({ success: true, message: 'Patient updated successfully', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    req.params.id = patientResult.rows[0].id;
    return update(req, res, next);
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [patient, vitals, appointments, pregnancy] = await Promise.all([
      query('SELECT * FROM patients WHERE id = $1', [id]),
      query('SELECT * FROM vitals WHERE patient_id = $1 ORDER BY visit_date DESC LIMIT 5', [id]),
      query('SELECT * FROM appointments WHERE patient_id = $1 AND status = $2 ORDER BY scheduled_date ASC LIMIT 3', [id, 'scheduled']),
      query('SELECT * FROM pregnancies WHERE patient_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1', [id, 'active']),
    ]);

    if (patient.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    res.json({
      success: true,
      data: {
        patient: patient.rows[0],
        recentVitals: vitals.rows,
        upcomingAppointments: appointments.rows,
        activePregnancy: pregnancy.rows[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, getMe, create, update, updateMe, getSummary };
