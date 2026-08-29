const { query } = require('../config/database');

const buildRecommendation = (type, title, description, meta = {}) => ({
  id: `${type}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type,
  title,
  description,
  ...meta,
});

const getPatientRecommendations = async (req, userId) => {
  const patientResult = await query(
    `SELECT p.*, pr.status AS pregnancy_status, pr.risk_level AS pregnancy_risk
     FROM patients p
     LEFT JOIN pregnancies pr ON pr.patient_id = p.id AND pr.status = 'active'
     WHERE p.user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (patientResult.rows.length === 0) {
    return { suggestions: [], featuredMedia: [] };
  }

  const patient = patientResult.rows[0];
  const [documents, prescriptions, providers, media] = await Promise.all([
    query('SELECT document_type, verification_status FROM patient_documents WHERE patient_id = $1', [patient.id]),
    query('SELECT medication_name, frequency FROM prescriptions WHERE patient_id = $1 ORDER BY prescribed_date DESC LIMIT 5', [patient.id]),
    query(
      `SELECT id, role, first_name || ' ' || last_name AS full_name
       FROM users
       WHERE role IN ('doctor', 'midwife') AND is_active = true
       ORDER BY role, last_name
       LIMIT 4`
    ),
    query(
      `SELECT id, title, category, media_type, COALESCE(media_url, video_url) AS media_url, poster_url, description
       FROM media_feed_posts
       WHERE is_published = true
       ORDER BY created_at DESC
       LIMIT 8`
    ),
  ]);

  const uploadedTypes = new Set(documents.rows.map((row) => row.document_type));
  const suggestions = [];

  if (!uploadedTypes.has('PhilHealth ID')) {
    suggestions.push(buildRecommendation('document', 'Upload your PhilHealth ID', 'Adding your PhilHealth ID helps billing and verification move faster.', { priority: 'high', route: '/my/profile' }));
  }

  if (!uploadedTypes.has('Birthing ID')) {
    suggestions.push(buildRecommendation('document', 'Upload your Birthing ID', 'Your birthing ID keeps admissions and care records aligned.', { priority: 'high', route: '/my/profile' }));
  }

  if (patient.risk_level === 'high' || patient.pregnancy_risk === 'high') {
    suggestions.push(buildRecommendation('health-tip', 'High-risk pregnancy guidance', 'You have a high-risk profile. Review warning signs, follow-up plans, and emergency contact steps.', { priority: 'high', category: 'safety' }));
  }

  if (prescriptions.rows.length > 0) {
    const meds = prescriptions.rows.slice(0, 2).map((row) => row.medication_name).join(', ');
    suggestions.push(buildRecommendation('medicine', 'Medication reminder', `Remember the current medication plan for ${meds}.`, { priority: 'medium' }));
  }

  providers.rows.forEach((provider) => {
    suggestions.push(buildRecommendation('provider', `Suggested ${provider.role}`, `${provider.full_name} is available in the care directory for follow-up support.`, { priority: 'low', providerId: provider.id }));
  });

  const featuredMedia = media.rows.filter((row) => {
    if (patient.risk_level === 'high') {
      return ['safety', 'health-tip', 'announcement'].includes(row.category);
    }
    return ['health-tip', 'nutrition', 'announcement'].includes(row.category);
  });

  return { suggestions, featuredMedia };
};

const getStaffRecommendations = async () => {
  const [pendingDocs, lowStock, highRiskPatients, media] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM patient_documents WHERE verification_status = 'pending'`),
    query(`SELECT COUNT(*)::int AS count FROM inventory WHERE quantity <= reorder_level AND category = 'medication'`),
    query(`SELECT COUNT(*)::int AS count FROM patients WHERE risk_level = 'high'`),
    query(
      `SELECT id, title, category, media_type, COALESCE(media_url, video_url) AS media_url, poster_url, description
       FROM media_feed_posts
       WHERE is_published = true
       ORDER BY created_at DESC
       LIMIT 8`
    ),
  ]);

  const suggestions = [
    buildRecommendation('verification', 'Review pending document uploads', `${pendingDocs.rows[0].count} patient document upload(s) still need verification.`, { priority: 'high', route: '/dashboard' }),
    buildRecommendation('inventory', 'Check medicine stock', `${lowStock.rows[0].count} medicine item(s) are low or out of stock.`, { priority: 'medium', route: '/inventory' }),
    buildRecommendation('care', 'Watch high-risk patients', `${highRiskPatients.rows[0].count} patient(s) currently carry a high-risk flag.`, { priority: 'high', route: '/patients' }),
  ];

  return { suggestions, featuredMedia: media.rows };
};

const getRecommendations = async (req, res, next) => {
  try {
    const payload = req.user.role === 'patient'
      ? await getPatientRecommendations(req, req.user.id)
      : await getStaffRecommendations();

    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
};

const search = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const like = `%${q}%`;
    const results = [];

    const [media, medicines] = await Promise.all([
      query(
        `SELECT id, title, category, 'media' AS result_type
         FROM media_feed_posts
         WHERE is_published = true
           AND (title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
         ORDER BY created_at DESC
         LIMIT 8`,
        [like]
      ),
      query(
        `SELECT id, item_name AS title, category, 'medicine' AS result_type
         FROM inventory
         WHERE category = 'medication'
           AND (item_name ILIKE $1 OR description ILIKE $1 OR dosage ILIKE $1)
         ORDER BY item_name ASC
         LIMIT 8`,
        [like]
      ),
    ]);

    results.push(...media.rows, ...medicines.rows);

    if (req.user.role === 'patient') {
      const records = await query(
        `SELECT p.id, ('Patient record: ' || p.first_name || ' ' || p.last_name) AS title, 'patient-record' AS category, 'record' AS result_type
         FROM patients p
         WHERE p.user_id = $1
           AND (
             p.first_name ILIKE $2 OR
             p.last_name ILIKE $2 OR
             COALESCE(p.philhealth_id, '') ILIKE $2 OR
             COALESCE(p.birthing_id, '') ILIKE $2
           )
         LIMIT 4`,
        [req.user.id, like]
      );
      results.push(...records.rows);
    } else {
      const [patients, inventory] = await Promise.all([
        query(
          `SELECT id, first_name || ' ' || last_name AS title, 'patient' AS category, 'patient' AS result_type
           FROM patients
           WHERE first_name ILIKE $1
              OR last_name ILIKE $1
              OR COALESCE(patient_code, '') ILIKE $1
              OR COALESCE(birthing_id, '') ILIKE $1
              OR COALESCE(philhealth_id, '') ILIKE $1
           ORDER BY last_name ASC
           LIMIT 8`,
          [like]
        ),
        query(
          `SELECT id, item_name AS title, category, 'inventory' AS result_type
           FROM inventory
           WHERE item_name ILIKE $1 OR COALESCE(description, '') ILIKE $1
           ORDER BY item_name ASC
           LIMIT 8`,
          [like]
        ),
      ]);

      results.push(...patients.rows, ...inventory.rows);
    }

    res.json({ success: true, data: results.slice(0, 20) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRecommendations,
  search,
};
