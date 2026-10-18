const { query } = require('../config/database');

const allowedSubmissionStatuses = new Set(['required', 'submitted', 'pending_review', 'approved', 'rejected', 'missing']);

const mapRequirementRow = (row) => ({
  id: row.id,
  serviceKey: row.service_key,
  serviceName: row.service_name,
  requirementName: row.requirement_name,
  description: row.description,
  isRequired: row.is_required,
  acceptedFileTypes: row.accepted_file_types || [],
  isActive: row.is_active,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPatientRequirementRow = (row) => ({
  ...mapRequirementRow(row),
  submission: {
    id: row.submission_id || null,
    status: row.submission_status || (row.is_required ? 'missing' : 'required'),
    documentId: row.document_id || null,
    documentName: row.document_name || null,
    documentUrl: row.document_url || null,
    reviewNotes: row.review_notes || null,
    submittedAt: row.submitted_at || null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at || null,
  },
});

const fetchPatientIdForUser = async (userId) => {
  const result = await query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.id || null;
};

const listServices = async (req, res, next) => {
  try {
    const { serviceKey, includeInactive } = req.query;
    const conditions = [];
    const params = [];
    let index = 1;

    if (serviceKey) {
      conditions.push(`service_key = $${index++}`);
      params.push(String(serviceKey).trim());
    }

    if (includeInactive !== 'true') {
      conditions.push('is_active = true');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT *
       FROM service_requirements
       ${where}
       ORDER BY service_name, is_required DESC, requirement_name`,
      params
    );

    res.json({ success: true, data: result.rows.map(mapRequirementRow) });
  } catch (err) {
    next(err);
  }
};

const getRequirementsForPatient = async (patientId) => {
  const result = await query(
    `SELECT
       sr.*,
       prs.id AS submission_id,
       prs.status AS submission_status,
       prs.document_id,
       prs.review_notes,
       prs.submitted_at,
       prs.reviewed_at,
       pd.original_name AS document_name,
       pd.file_url AS document_url,
       reviewer.first_name || ' ' || reviewer.last_name AS reviewed_by_name
     FROM service_requirements sr
     LEFT JOIN patient_requirement_submissions prs
       ON prs.requirement_id = sr.id AND prs.patient_id = $1
     LEFT JOIN patient_documents pd ON pd.id = prs.document_id
     LEFT JOIN users reviewer ON reviewer.id = prs.reviewed_by
     WHERE sr.is_active = true
     ORDER BY sr.service_name, sr.is_required DESC, sr.requirement_name`,
    [patientId]
  );

  return result.rows.map(mapPatientRequirementRow);
};

const getMine = async (req, res, next) => {
  try {
    const patientId = await fetchPatientIdForUser(req.user.id);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    res.json({ success: true, data: await getRequirementsForPatient(patientId) });
  } catch (err) {
    next(err);
  }
};

const getByPatient = async (req, res, next) => {
  try {
    const patientResult = await query('SELECT id FROM patients WHERE id = $1 LIMIT 1', [req.params.patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    res.json({ success: true, data: await getRequirementsForPatient(req.params.patientId) });
  } catch (err) {
    next(err);
  }
};

const upsertServiceRequirement = async (req, res, next) => {
  try {
    const {
      id,
      serviceKey,
      serviceName,
      requirementName,
      description,
      isRequired,
      acceptedFileTypes,
      isActive,
    } = req.body;

    if (!serviceKey || !serviceName || !requirementName) {
      return res.status(400).json({
        success: false,
        message: 'serviceKey, serviceName, and requirementName are required',
      });
    }

    const params = [
      String(serviceKey).trim(),
      String(serviceName).trim(),
      String(requirementName).trim(),
      description?.trim() || null,
      isRequired !== false,
      JSON.stringify(Array.isArray(acceptedFileTypes) ? acceptedFileTypes : []),
      isActive !== false,
      req.user.id,
    ];

    const result = id
      ? await query(
        `UPDATE service_requirements
         SET service_key = $1,
             service_name = $2,
             requirement_name = $3,
             description = $4,
             is_required = $5,
             accepted_file_types = $6::jsonb,
             is_active = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [...params.slice(0, 7), id]
      )
      : await query(
        `INSERT INTO service_requirements (
           service_key, service_name, requirement_name, description, is_required,
           accepted_file_types, is_active, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (service_key, requirement_name) DO UPDATE SET
           service_name = EXCLUDED.service_name,
           description = EXCLUDED.description,
           is_required = EXCLUDED.is_required,
           accepted_file_types = EXCLUDED.accepted_file_types,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
         RETURNING *`,
        params
      );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Requirement not found' });
    }

    res.status(id ? 200 : 201).json({ success: true, data: mapRequirementRow(result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const submitMine = async (req, res, next) => {
  try {
    const { requirementId } = req.params;
    const { documentId } = req.body;
    const patientId = await fetchPatientIdForUser(req.user.id);

    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    if (!documentId) {
      return res.status(400).json({ success: false, message: 'documentId is required before submitting a requirement' });
    }

    const documentResult = await query(
      'SELECT id FROM patient_documents WHERE id = $1 AND patient_id = $2 LIMIT 1',
      [documentId, patientId]
    );
    if (documentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document was not found in your patient record' });
    }

    const result = await query(
      `INSERT INTO patient_requirement_submissions (
         patient_id, requirement_id, document_id, status, submitted_at
       )
       VALUES ($1, $2, $3, 'submitted', NOW())
       ON CONFLICT (patient_id, requirement_id) DO UPDATE SET
         document_id = EXCLUDED.document_id,
         status = 'submitted',
         review_notes = NULL,
         submitted_at = NOW(),
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [patientId, requirementId, documentId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const reviewSubmission = async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    if (!allowedSubmissionStatuses.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be required, submitted, pending_review, approved, rejected, or missing',
      });
    }

    const result = await query(
      `UPDATE patient_requirement_submissions
       SET status = $1,
           review_notes = $2,
           reviewed_by = $3,
           reviewed_at = CASE WHEN $1 IN ('approved','rejected','missing') THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, notes?.trim() || null, req.user.id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Requirement submission not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getByPatient,
  getMine,
  listServices,
  reviewSubmission,
  submitMine,
  upsertServiceRequirement,
};
