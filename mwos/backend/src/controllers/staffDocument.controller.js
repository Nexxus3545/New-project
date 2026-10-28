const { query } = require('../config/database');
const { uploadsRoot } = require('../middleware/uploads');
const { isIdentityDocumentType, removeRejectedIdentityFile, privateCredentialUploadError } = require('../utils/identityDocumentTypes');

const rejectIdentityUpload = async (req) => {
  if (!isIdentityDocumentType(req.body?.documentType)) return;
  await removeRejectedIdentityFile(req.file?.path, uploadsRoot);
  throw privateCredentialUploadError();
};

const allowedReviewStatuses = new Set(['pending_review', 'approved', 'rejected', 'archived']);

const toAssetUrl = (req, storedPath) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  return `${req.protocol}://${req.get('host')}${storedPath}`;
};

const mapDocument = (req, row) => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name || null,
  documentType: row.document_type,
  credentialTitle: row.credential_title || null,
  originalName: row.original_name || null,
  fileUrl: isIdentityDocumentType(row.document_type) ? null : toAssetUrl(req, row.file_url),
  credentialUploadRequired: isIdentityDocumentType(row.document_type),
  verificationStatus: row.verification_status,
  verificationNotes: row.verification_notes || null,
  uploadedByName: row.uploaded_by_name || null,
  reviewedByName: row.reviewed_by_name || null,
  reviewedAt: row.reviewed_at || null,
  expiresAt: row.expires_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fetchStaffIdForUser = async (userId) => {
  const result = await query('SELECT id FROM staff_registry WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.id || null;
};

const fetchStaffById = async (staffId) => {
  const result = await query(
    `SELECT sr.id, u.first_name || ' ' || u.last_name AS staff_name
     FROM staff_registry sr
     INNER JOIN users u ON u.id = sr.user_id
     WHERE sr.id = $1
     LIMIT 1`,
    [staffId]
  );
  return result.rows[0] || null;
};

const notifyAdminsIfExpiringSoon = async ({ staffId, documentType, credentialTitle, expiresAt, uploadedBy }) => {
  if (!expiresAt) return;

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

  if (daysUntilExpiry < 0 || daysUntilExpiry > 60) return;

  const admins = await query('SELECT id FROM users WHERE role = $1 AND is_active = true', ['admin']);
  await Promise.all(admins.rows.map((admin) => query(
    `INSERT INTO notifications (user_id, title, body, type, metadata, created_by)
     VALUES ($1, $2, $3, 'warning', $4, $5)`,
    [
      admin.id,
      'Staff credential nearing expiration',
      `${credentialTitle || documentType} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`,
      JSON.stringify({ staffId, documentType, credentialTitle, expiresAt }),
      uploadedBy,
    ]
  )));
};

const listDocuments = async (req, staffId) => {
  const result = await query(
    `SELECT
       sd.*,
       staff_user.first_name || ' ' || staff_user.last_name AS staff_name,
       uploader.first_name || ' ' || uploader.last_name AS uploaded_by_name,
       reviewer.first_name || ' ' || reviewer.last_name AS reviewed_by_name
     FROM staff_documents sd
     INNER JOIN staff_registry sr ON sr.id = sd.staff_id
     INNER JOIN users staff_user ON staff_user.id = sr.user_id
     LEFT JOIN users uploader ON uploader.id = sd.uploaded_by
     LEFT JOIN users reviewer ON reviewer.id = sd.reviewed_by
     WHERE sd.staff_id = $1
     ORDER BY
       CASE sd.verification_status
         WHEN 'pending_review' THEN 1
         WHEN 'rejected' THEN 2
         WHEN 'approved' THEN 3
         ELSE 4
       END,
       sd.expires_at ASC NULLS LAST,
       sd.created_at DESC`,
    [staffId]
  );

  return result.rows.map((row) => mapDocument(req, row));
};

const listMine = async (req, res, next) => {
  try {
    const staffId = await fetchStaffIdForUser(req.user.id);
    if (!staffId) {
      return res.status(404).json({ success: false, message: 'Staff profile not found' });
    }

    res.json({ success: true, data: await listDocuments(req, staffId) });
  } catch (err) {
    next(err);
  }
};

const listForStaff = async (req, res, next) => {
  try {
    const staff = await fetchStaffById(req.params.staffId);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff profile not found' });
    }

    res.json({ success: true, data: await listDocuments(req, req.params.staffId) });
  } catch (err) {
    next(err);
  }
};

const createDocumentRecord = async ({ req, staffId }) => {
  await rejectIdentityUpload(req);
  const { documentType, credentialTitle, expiresAt } = req.body;

  if (!documentType || !req.file) {
    const error = new Error('documentType and file are required');
    error.statusCode = 400;
    throw error;
  }

  const staff = await fetchStaffById(staffId);
  if (!staff) {
    const error = new Error('Staff profile not found');
    error.statusCode = 404;
    throw error;
  }

  const result = await query(
    `INSERT INTO staff_documents (
       staff_id, uploaded_by, document_type, credential_title, original_name,
       file_url, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      staffId,
      req.user.id,
      documentType.trim(),
      credentialTitle?.trim() || null,
      req.file.originalname,
      `/uploads/documents/${req.file.filename}`,
      expiresAt || null,
    ]
  );

  await notifyAdminsIfExpiringSoon({
    staffId,
    documentType: documentType.trim(),
    credentialTitle: credentialTitle?.trim() || null,
    expiresAt,
    uploadedBy: req.user.id,
  });

  return mapDocument(req, { ...result.rows[0], staff_name: staff.staff_name });
};

const uploadMine = async (req, res, next) => {
  try {
    await rejectIdentityUpload(req);
    const staffId = await fetchStaffIdForUser(req.user.id);
    if (!staffId) {
      return res.status(404).json({ success: false, message: 'Staff profile not found' });
    }

    const data = await createDocumentRecord({ req, staffId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const uploadForStaff = async (req, res, next) => {
  try {
    const data = await createDocumentRecord({ req, staffId: req.params.staffId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const reviewDocument = async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    if (!allowedReviewStatuses.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be pending_review, approved, rejected, or archived',
      });
    }

    const result = await query(
      `UPDATE staff_documents
       SET verification_status = $1,
           verification_notes = $2,
           reviewed_by = $3,
           reviewed_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, notes?.trim() || null, req.user.id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Staff document not found' });
    }

    res.json({ success: true, data: mapDocument(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const listExpiring = async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 60, 365));
    const result = await query(
      `SELECT
         sd.*,
         staff_user.first_name || ' ' || staff_user.last_name AS staff_name,
         uploader.first_name || ' ' || uploader.last_name AS uploaded_by_name,
         reviewer.first_name || ' ' || reviewer.last_name AS reviewed_by_name
       FROM staff_documents sd
       INNER JOIN staff_registry sr ON sr.id = sd.staff_id
       INNER JOIN users staff_user ON staff_user.id = sr.user_id
       LEFT JOIN users uploader ON uploader.id = sd.uploaded_by
       LEFT JOIN users reviewer ON reviewer.id = sd.reviewed_by
       WHERE sd.expires_at IS NOT NULL
         AND sd.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
         AND sd.verification_status <> 'archived'
       ORDER BY sd.expires_at ASC`,
      [days]
    );

    res.json({ success: true, data: result.rows.map((row) => mapDocument(req, row)) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listExpiring,
  listForStaff,
  listMine,
  reviewDocument,
  uploadForStaff,
  uploadMine,
};
