const { query } = require('../config/database');
const { extractDocumentInsights } = require('../utils/ocr');

const toAssetUrl = (req, storedPath) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  return `${req.protocol}://${req.get('host')}${storedPath}`;
};

const mapDocument = (req, row) => ({
  ...row,
  file_url: toAssetUrl(req, row.file_url),
});

const applyExtractedFieldsToPatient = async (patientId, documentType, extractedData) => {
  const updates = [];
  const values = [];
  let index = 1;

  if (documentType === 'PhilHealth ID' && extractedData.philhealthId) {
    updates.push(`philhealth_id = COALESCE(philhealth_id, $${index++})`);
    values.push(extractedData.philhealthId);
  }

  if (documentType === 'Birthing ID' && extractedData.birthingId) {
    updates.push(`birthing_id = COALESCE(birthing_id, $${index++})`);
    values.push(extractedData.birthingId);
  }

  if (documentType === 'Government ID' && extractedData.governmentIdNumber) {
    updates.push(`valid_id_type = COALESCE(valid_id_type, $${index++})`);
    values.push('Government ID');
    updates.push(`valid_id_number = COALESCE(valid_id_number, $${index++})`);
    values.push(extractedData.governmentIdNumber);
  }

  if (updates.length === 0) {
    return;
  }

  values.push(patientId);
  await query(
    `UPDATE patients
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${index}`,
    values
  );
};

const getMine = async (req, res, next) => {
  try {
    const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const result = await query(
      `SELECT pd.*, u.first_name || ' ' || u.last_name AS verified_by_name
       FROM patient_documents pd
       LEFT JOIN users u ON u.id = pd.verified_by
       WHERE pd.patient_id = $1
       ORDER BY pd.created_at DESC`,
      [patientResult.rows[0].id]
    );

    res.json({ success: true, data: result.rows.map((row) => mapDocument(req, row)) });
  } catch (err) {
    next(err);
  }
};

const uploadMine = async (req, res, next) => {
  try {
    const { documentType } = req.body;
    if (!documentType || !req.file) {
      return res.status(400).json({ success: false, message: 'documentType and file are required' });
    }

    const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const patientId = patientResult.rows[0].id;
    const ocr = await extractDocumentInsights(req.file.path, req.file.mimetype, documentType.trim());
    await applyExtractedFieldsToPatient(patientId, documentType.trim(), ocr.extractedData || {});

    const result = await query(
      `INSERT INTO patient_documents (
         patient_id, uploaded_by, document_type, original_name, file_url,
         ocr_status, ocr_text, ocr_extracted_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        patientId,
        req.user.id,
        documentType.trim(),
        req.file.originalname,
        `/uploads/documents/${req.file.filename}`,
        ocr.status,
        ocr.text || null,
        JSON.stringify(ocr.extractedData || {}),
      ]
    );

    res.status(201).json({ success: true, data: mapDocument(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const { patientId, status } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (patientId) {
      conditions.push(`pd.patient_id = $${idx++}`);
      params.push(patientId);
    }

    if (status) {
      conditions.push(`pd.verification_status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT pd.*,
          p.first_name || ' ' || p.last_name AS patient_name,
          u.first_name || ' ' || u.last_name AS uploader_name,
          v.first_name || ' ' || v.last_name AS verified_by_name
       FROM patient_documents pd
       LEFT JOIN patients p ON p.id = pd.patient_id
       LEFT JOIN users u ON u.id = pd.uploaded_by
       LEFT JOIN users v ON v.id = pd.verified_by
       ${where}
       ORDER BY pd.created_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows.map((row) => mapDocument(req, row)) });
  } catch (err) {
    next(err);
  }
};

const verify = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be verified, rejected, or pending' });
    }

    const result = await query(
      `UPDATE patient_documents
       SET verification_status = $1,
           verification_notes = $2,
           verified_by = $3,
           verified_at = CASE WHEN $1 = 'pending' THEN NULL ELSE NOW() END
       WHERE id = $4
       RETURNING *`,
      [status, notes?.trim() || null, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    res.json({ success: true, data: mapDocument(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMine,
  uploadMine,
  list,
  verify,
};
