const { query } = require('../config/database');
const { generateUniqueCode, toNullableNumber, calculateBmi } = require('../utils/identifiers');
const { normalizePatientCare } = require('../utils/patientCare');

const PATIENT_FIELD_MAP = {
  patientCode: 'patient_code',
  birthingId: 'birthing_id',
  firstName: 'first_name',
  middleName: 'middle_name',
  lastName: 'last_name',
  suffix: 'suffix',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  careType: 'care_type',
  civilStatus: 'civil_status',
  religion: 'religion',
  nationality: 'nationality',
  occupation: 'occupation',
  placeOfBirth: 'place_of_birth',
  address: 'address',
  barangay: 'barangay',
  city: 'city',
  province: 'province',
  postalCode: 'postal_code',
  phone: 'phone',
  email: 'email',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  emergencyContactRelation: 'emergency_contact_relation',
  philhealthId: 'philhealth_id',
  philhealthType: 'philhealth_type',
  pregnancyBookletNumber: 'pregnancy_booklet_number',
  credentialNotes: 'credential_notes',
  bloodType: 'blood_type',
  biometricHeightCm: 'biometric_height_cm',
  biometricWeightKg: 'biometric_weight_kg',
  biometricBmi: 'biometric_bmi',
  biometricNotes: 'biometric_notes',
  allergies: 'allergies',
  existingConditions: 'existing_conditions',
  currentMedications: 'current_medications',
  riskLevel: 'risk_level',
  obGyneHistory: 'ob_gyne_history',
};

const SEARCH_FIELDS = [
  'p.first_name',
  'p.last_name',
  'p.middle_name',
  'p.patient_code',
  'p.birthing_id',
  'p.philhealth_id',
  'p.valid_id_number',
  'p.phone',
];

const normalizeText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const normalizePatientDraft = (payload = {}) => {
  const draft = {};

  for (const key of Object.keys(PATIENT_FIELD_MAP)) {
    if (!(key in payload)) continue;

    if (['biometricHeightCm', 'biometricWeightKg', 'biometricBmi'].includes(key)) {
      draft[key] = toNullableNumber(payload[key]);
      continue;
    }

    if (key === 'obGyneHistory') {
      draft[key] = payload[key] ?? {};
      continue;
    }

    draft[key] = normalizeText(payload[key]);
  }

  return { ...draft, ...normalizePatientCare(payload) };
};

const ensureUniqueIdentifiers = async ({ patientCode, birthingId, excludeId = null }) => {
  if (patientCode) {
    const params = excludeId ? [patientCode, excludeId] : [patientCode];
    const sql = excludeId
      ? 'SELECT id FROM patients WHERE patient_code = $1 AND id <> $2 LIMIT 1'
      : 'SELECT id FROM patients WHERE patient_code = $1 LIMIT 1';
    const existing = await query(sql, params);
    if (existing.rows.length > 0) {
      const error = new Error('Patient code already exists');
      error.statusCode = 409;
      throw error;
    }
  }

  if (birthingId) {
    const params = excludeId ? [birthingId, excludeId] : [birthingId];
    const sql = excludeId
      ? 'SELECT id FROM patients WHERE birthing_id = $1 AND id <> $2 LIMIT 1'
      : 'SELECT id FROM patients WHERE birthing_id = $1 LIMIT 1';
    const existing = await query(sql, params);
    if (existing.rows.length > 0) {
      const error = new Error('Birthing ID already exists');
      error.statusCode = 409;
      throw error;
    }
  }
};

const deriveBiometricBmi = ({ heightCm, weightKg, explicitBmi, fallbackHeightCm, fallbackWeightKg, fallbackBmi }) => {
  if (explicitBmi !== undefined) {
    return explicitBmi;
  }

  const nextHeight = heightCm !== undefined ? heightCm : fallbackHeightCm;
  const nextWeight = weightKg !== undefined ? weightKg : fallbackWeightKg;
  const derived = calculateBmi(nextHeight, nextWeight);

  if (derived !== null) {
    return derived;
  }

  return heightCm === undefined && weightKg === undefined ? fallbackBmi : null;
};

const getAll = async (req, res, next) => {
  try {
    const v = require('../utils/workflowValidation');
    const page = v.number(req.query.page || 1, 'Page', 1, 100000, true, true);
    const limit = v.number(req.query.limit || 20, 'Page size', 1, 200, true, true);
    const params = [], conditions = [];
    const add = (sql,value) => { params.push(value); conditions.push(sql.replace('?', '$'+params.length)); };
    const search = v.text(req.query.search, 'Search', 200, false);
    if(search) {params.push('%'+search+'%'); conditions.push('('+SEARCH_FIELDS.map(f=>f+' ILIKE $'+params.length).join(' OR ')+')');}
    if(req.query.risk_level) add('p.risk_level = ?',v.choice(req.query.risk_level,'Risk',['low','moderate','high']));
    if(req.query.status) add('p.is_active = ?',v.choice(req.query.status,'Status',['active','inactive'])==='active');
    const prior = "EXISTS(SELECT 1 FROM appointments av WHERE av.patient_id=p.id AND av.status='completed') OR EXISTS(SELECT 1 FROM patient_visits pv WHERE pv.patient_id=p.id AND pv.status='completed')";
    if(req.query.patient_type) conditions.push((v.choice(req.query.patient_type,'Patient type',['new','returning'])==='new'?'NOT ':'')+'('+prior+')');
    if(req.query.pregnancy) conditions.push((v.choice(req.query.pregnancy,'Pregnancy',['active','none'])==='none'?'NOT ':'')+"EXISTS(SELECT 1 FROM pregnancies pg WHERE pg.patient_id=p.id AND pg.status='active')");
    const sorting = {registered:'p.created_at',name:'p.last_name',age:'age',last_visit:'last_visit'};
    const sort = sorting[v.choice(req.query.sort,'Sort',Object.keys(sorting),'registered')];
    const direction=v.choice(req.query.direction,'Direction',['asc','desc'],'desc').toUpperCase();
    const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
    const total=Number((await query('SELECT count(*) FROM patients p '+where,params)).rows[0].count);
    params.push(limit,(page-1)*limit);
    const result=await query(`SELECT p.*,EXTRACT(YEAR FROM age(CURRENT_DATE,p.date_of_birth))::int AS age,
      CASE WHEN (${prior}) THEN 'Returning' ELSE 'New' END AS patient_type,
      GREATEST((SELECT MAX(av.scheduled_date) FROM appointments av WHERE av.patient_id=p.id AND av.status='completed'),
        (SELECT MAX(pv.updated_at::date) FROM patient_visits pv WHERE pv.patient_id=p.id AND pv.status='completed')) AS last_visit,
      pr.id AS active_pregnancy_id,pr.edd,pr.status AS pregnancy_status,
      (SELECT d.delivery_code FROM deliveries d WHERE d.patient_id=p.id ORDER BY d.delivery_date DESC,d.created_at DESC LIMIT 1) AS latest_delivery_code,
      (SELECT count(*) FROM appointments a WHERE a.patient_id=p.id AND a.status IN('scheduled','confirmed','awaiting_payment','payment_review') AND a.scheduled_date>=CURRENT_DATE) AS upcoming_appointments
      FROM patients p LEFT JOIN LATERAL (SELECT id,edd,status FROM pregnancies WHERE patient_id=p.id AND status='active' ORDER BY created_at DESC LIMIT 1) pr ON true
      ${where} ORDER BY ${sort} ${direction} NULLS LAST,p.id LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    res.json({success:true,data:result.rows,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
  } catch(err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.*,
        json_agg(DISTINCT pr.*) FILTER (WHERE pr.id IS NOT NULL) AS pregnancies,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', d.id,
            'delivery_code', d.delivery_code,
            'delivery_date', d.delivery_date,
            'delivery_type', d.delivery_type,
            'status', d.status
          )
        ) FILTER (WHERE d.id IS NOT NULL) AS deliveries,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS total_appointments
       FROM patients p
       LEFT JOIN pregnancies pr ON pr.patient_id = p.id
       LEFT JOIN deliveries d ON d.patient_id = p.id
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
        json_agg(DISTINCT pr.*) FILTER (WHERE pr.id IS NOT NULL) AS pregnancies,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', d.id,
            'delivery_code', d.delivery_code,
            'delivery_date', d.delivery_date,
            'delivery_type', d.delivery_type,
            'status', d.status
          )
        ) FILTER (WHERE d.id IS NOT NULL) AS deliveries
       FROM patients p
       LEFT JOIN pregnancies pr ON pr.patient_id = p.id
       LEFT JOIN deliveries d ON d.patient_id = p.id
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
    const draft = normalizePatientDraft(req.body);

    if (!draft.firstName || !draft.lastName || !draft.dateOfBirth) {
      return res.status(400).json({ success: false, message: 'First name, last name, and date of birth are required' });
    }

    const patientCode = draft.patientCode || await generateUniqueCode({ table: 'patients', column: 'patient_code', prefix: 'MWOS-PAT' });
    const birthingId = draft.birthingId || await generateUniqueCode({ table: 'patients', column: 'birthing_id', prefix: 'TMC-BIR' });
    await ensureUniqueIdentifiers({ patientCode, birthingId });

    const biometricBmi = deriveBiometricBmi({
      heightCm: draft.biometricHeightCm,
      weightKg: draft.biometricWeightKg,
      explicitBmi: draft.biometricBmi,
    });

    const result = await query(
      `INSERT INTO patients (
        user_id, patient_code, birthing_id, first_name, middle_name, last_name, suffix, date_of_birth,
        civil_status, religion, nationality, occupation, place_of_birth, address, barangay, city,
        province, postal_code, phone, email, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relation, philhealth_id, philhealth_type, valid_id_type, valid_id_number,
        pregnancy_booklet_number, credential_notes, blood_type, biometric_height_cm,
        biometric_weight_kg, biometric_bmi, biometric_notes, allergies, existing_conditions,
        current_medications, ob_gyne_history, risk_level, created_by, gender, care_type
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
      )
      RETURNING *`,
      [
        req.body.userId || null,
        patientCode,
        birthingId,
        draft.firstName,
        draft.middleName || null,
        draft.lastName,
        draft.suffix || null,
        draft.dateOfBirth,
        draft.civilStatus || null,
        draft.religion || null,
        draft.nationality || 'Filipino',
        draft.occupation || null,
        draft.placeOfBirth || null,
        draft.address || null,
        draft.barangay || null,
        draft.city || null,
        draft.province || null,
        draft.postalCode || null,
        draft.phone || null,
        draft.email || null,
        draft.emergencyContactName || null,
        draft.emergencyContactPhone || null,
        draft.emergencyContactRelation || null,
        draft.philhealthId || null,
        draft.philhealthType || null,
        draft.validIdType || null,
        draft.validIdNumber || null,
        draft.pregnancyBookletNumber || null,
        draft.credentialNotes || null,
        draft.bloodType || null,
        draft.biometricHeightCm,
        draft.biometricWeightKg,
        biometricBmi,
        draft.biometricNotes || null,
        draft.allergies || null,
        draft.existingConditions || null,
        draft.currentMedications || null,
        JSON.stringify(draft.obGyneHistory || {}),
        draft.riskLevel || 'low',
        req.user.id,
        draft.gender || null,
        draft.careType || 'general',
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query(
      `SELECT id, biometric_height_cm, biometric_weight_kg, biometric_bmi
       FROM patients
       WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const draft = normalizePatientDraft(req.body);

    if (draft.patientCode !== undefined || draft.birthingId !== undefined) {
      await ensureUniqueIdentifiers({
        patientCode: draft.patientCode,
        birthingId: draft.birthingId,
        excludeId: id,
      });
    }

    const keys = Object.keys(draft);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const existingPatient = existing.rows[0];
    const updates = {};

    for (const key of keys) {
      const dbField = PATIENT_FIELD_MAP[key];
      if (!dbField) continue;

      if (key === 'obGyneHistory') {
        updates[dbField] = JSON.stringify(draft[key] || {});
      } else {
        updates[dbField] = draft[key];
      }
    }

    if (
      'biometricHeightCm' in draft ||
      'biometricWeightKg' in draft ||
      'biometricBmi' in draft
    ) {
      updates.biometric_bmi = deriveBiometricBmi({
        heightCm: draft.biometricHeightCm,
        weightKg: draft.biometricWeightKg,
        explicitBmi: draft.biometricBmi,
        fallbackHeightCm: existingPatient.biometric_height_cm,
        fallbackWeightKg: existingPatient.biometric_weight_kg,
        fallbackBmi: existingPatient.biometric_bmi,
      });
    }

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    const result = await query(
      `UPDATE patients
       SET ${setClause}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
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
