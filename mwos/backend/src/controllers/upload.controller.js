const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../config/database');
const { uploadsRoot } = require('../middleware/uploads');
const { extractDocumentInsights } = require('../utils/ocr');

const tempUploadsRoot = path.join(uploadsRoot, '_chunk-sessions');

const TARGET_CONFIG = {
  patient_document: {
    allowedRoles: ['patient'],
    allowedMimeTypes: ['image/', 'application/pdf'],
    maxSizeBytes: 120 * 1024 * 1024,
    subdir: 'documents',
  },
  media_feed: {
    allowedRoles: ['admin', 'doctor', 'midwife'],
    allowedMimeTypes: ['video/', 'image/'],
    maxSizeBytes: 150 * 1024 * 1024,
    subdir: 'videos',
  },
  medicine_image: {
    allowedRoles: ['admin', 'doctor', 'nurse'],
    allowedMimeTypes: ['image/'],
    maxSizeBytes: 20 * 1024 * 1024,
    subdir: 'medicine-images',
  },
};

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
  return dirPath;
};

const sanitizeFileName = (fileName) => path.basename(fileName || 'upload.bin').replace(/[^\w.-]+/g, '-');

const isMimeTypeAllowed = (mimeType, allowedMimeTypes) => allowedMimeTypes.some((prefix) => (
  prefix.endsWith('/') ? mimeType.startsWith(prefix) : mimeType === prefix
));

const uniqueSortedChunks = (value) => {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0))).sort((left, right) => left - right);
};

const toAssetUrl = (req, storedPath) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  return `${req.protocol}://${req.get('host')}${storedPath}`;
};

const mapDocument = (req, row) => ({
  ...row,
  file_url: toAssetUrl(req, row.file_url),
});

const mapPost = (req, row) => ({
  ...row,
  media_url: toAssetUrl(req, row.media_url || row.video_url),
  video_url: toAssetUrl(req, row.video_url),
  thumbnail_url: toAssetUrl(req, row.thumbnail_url),
  poster_url: toAssetUrl(req, row.poster_url || row.thumbnail_url),
});

const formatSession = (req, row) => ({
  id: row.id,
  target_type: row.target_type,
  original_name: row.original_name,
  mime_type: row.mime_type,
  total_size: Number(row.total_size),
  total_chunks: row.total_chunks,
  chunk_size: row.chunk_size,
  received_chunks: uniqueSortedChunks(row.received_chunks),
  uploaded_chunks: uniqueSortedChunks(row.received_chunks).length,
  progress: row.total_chunks > 0
    ? Math.round((uniqueSortedChunks(row.received_chunks).length / row.total_chunks) * 100)
    : 0,
  status: row.status,
  metadata: row.metadata || {},
  finalized_asset_path: toAssetUrl(req, row.finalized_asset_path),
  completed_resource_type: row.completed_resource_type,
  completed_resource_id: row.completed_resource_id,
  error_message: row.error_message,
  created_at: row.created_at,
  updated_at: row.updated_at,
  last_chunk_at: row.last_chunk_at,
});

const getSessionById = async (sessionId) => {
  const result = await query('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
  return result.rows[0] || null;
};

const ensureSessionAccess = (req, session) => {
  if (!session) {
    return { ok: false, status: 404, message: 'Upload session not found' };
  }

  if (session.owner_user_id !== req.user.id) {
    return { ok: false, status: 403, message: 'You do not have access to this upload session' };
  }

  return { ok: true };
};

const updateSession = async (sessionId, patch) => {
  const fields = [];
  const values = [];
  let index = 1;

  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'metadata' || key === 'received_chunks') {
      fields.push(`${key} = $${index++}::jsonb`);
    } else {
      fields.push(`${key} = $${index++}`);
    }
    values.push(value);
  });

  values.push(sessionId);

  const result = await query(
    `UPDATE upload_sessions
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${index}
     RETURNING *`,
    values
  );

  return result.rows[0];
};

const markSessionFailed = async (sessionId, errorMessage) => updateSession(sessionId, {
  status: 'failed',
  error_message: errorMessage,
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

  if (updates.length === 0) return;

  values.push(patientId);
  await query(
    `UPDATE patients
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${index}`,
    values
  );
};

const assembleChunks = async (session) => {
  const config = TARGET_CONFIG[session.target_type];
  const targetDir = await ensureDir(path.join(uploadsRoot, config.subdir));
  const safeBase = sanitizeFileName(session.original_name);
  const finalName = `${Date.now()}-${safeBase}`;
  const finalPath = path.join(targetDir, finalName);

  await fs.promises.writeFile(finalPath, Buffer.alloc(0));

  for (let chunkIndex = 0; chunkIndex < session.total_chunks; chunkIndex += 1) {
    const chunkPath = path.join(session.temp_dir, `${chunkIndex}.part`);
    const chunk = await fs.promises.readFile(chunkPath);
    await fs.promises.appendFile(finalPath, chunk);
  }

  return {
    absolutePath: finalPath,
    relativePath: `/uploads/${config.subdir}/${finalName}`,
  };
};

const finalizePatientDocument = async (req, session, asset) => {
  const metadata = session.metadata || {};
  const documentType = String(metadata.documentType || '').trim();
  const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);

  if (patientResult.rows.length === 0) {
    const error = new Error('Patient profile not found');
    error.statusCode = 404;
    throw error;
  }

  const patientId = patientResult.rows[0].id;
  const ocr = await extractDocumentInsights(asset.absolutePath, session.mime_type, documentType);
  await applyExtractedFieldsToPatient(patientId, documentType, ocr.extractedData || {});

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
      documentType,
      session.original_name,
      asset.relativePath,
      ocr.status,
      ocr.text || null,
      JSON.stringify(ocr.extractedData || {}),
    ]
  );

  return {
    resourceType: 'patient_document',
    resourceId: result.rows[0].id,
    responseData: mapDocument(req, result.rows[0]),
  };
};

const finalizeMediaFeed = async (req, session, asset) => {
  const metadata = session.metadata || {};
  const mediaType = metadata.mediaType || (session.mime_type.startsWith('image/') ? 'image' : 'video');

  const result = await query(
    `INSERT INTO media_feed_posts (
       title, description, media_type, media_url, video_url, thumbnail_url, poster_url, category, is_published, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      String(metadata.title || '').trim(),
      metadata.description?.trim() || null,
      mediaType,
      asset.relativePath,
      asset.relativePath,
      metadata.thumbnailUrl?.trim() || null,
      metadata.posterUrl?.trim() || metadata.thumbnailUrl?.trim() || null,
      metadata.category?.trim() || 'general',
      metadata.isPublished !== false,
      req.user.id,
    ]
  );

  return {
    resourceType: 'media_feed',
    resourceId: result.rows[0].id,
    responseData: mapPost(req, result.rows[0]),
  };
};

const finalizeMedicineImage = async (req, _session, asset) => ({
  resourceType: 'medicine_image',
  resourceId: null,
  responseData: {
    image_url: toAssetUrl(req, asset.relativePath),
  },
});

const validateSessionRequest = (req) => {
  const targetType = String(req.body.targetType || '').trim();
  const config = TARGET_CONFIG[targetType];

  if (!config) {
    return { status: 400, message: 'Unsupported upload target type' };
  }

  if (!config.allowedRoles.includes(req.user.role)) {
    return { status: 403, message: 'You do not have permission to upload for this target' };
  }

  const originalName = sanitizeFileName(req.body.fileName || '');
  const mimeType = String(req.body.mimeType || '').trim();
  const totalSize = Number(req.body.totalSize);
  const totalChunks = Number(req.body.totalChunks);
  const chunkSize = Number(req.body.chunkSize);

  if (!originalName || !mimeType || !Number.isFinite(totalSize) || !Number.isInteger(totalChunks) || !Number.isInteger(chunkSize)) {
    return { status: 400, message: 'fileName, mimeType, totalSize, totalChunks, and chunkSize are required' };
  }

  if (totalSize <= 0 || totalChunks <= 0 || chunkSize <= 0) {
    return { status: 400, message: 'Upload size and chunk details must be greater than zero' };
  }

  if (totalSize > config.maxSizeBytes) {
    return { status: 400, message: `File exceeds the allowed size for ${targetType}` };
  }

  if (!isMimeTypeAllowed(mimeType, config.allowedMimeTypes)) {
    return { status: 400, message: `Unsupported file type for ${targetType}` };
  }

  const metadata = {
    documentType: req.body.documentType,
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    mediaType: req.body.mediaType,
    posterUrl: req.body.posterUrl,
    thumbnailUrl: req.body.thumbnailUrl,
    isPublished: req.body.isPublished === undefined ? true : req.body.isPublished !== 'false' && req.body.isPublished !== false,
  };

  if (targetType === 'patient_document' && !String(metadata.documentType || '').trim()) {
    return { status: 400, message: 'documentType is required for patient documents' };
  }

  if (targetType === 'media_feed' && !String(metadata.title || '').trim()) {
    return { status: 400, message: 'title is required for media feed uploads' };
  }

  return {
    status: 200,
    value: {
      targetType,
      originalName,
      mimeType,
      totalSize,
      totalChunks,
      chunkSize,
      metadata,
    },
  };
};

const createSession = async (req, res, next) => {
  try {
    const validation = validateSessionRequest(req);
    if (validation.status !== 200) {
      return res.status(validation.status).json({ success: false, message: validation.message });
    }

    const { targetType, originalName, mimeType, totalSize, totalChunks, chunkSize, metadata } = validation.value;
    const sessionId = crypto.randomUUID();
    const tempDir = await ensureDir(path.join(tempUploadsRoot, sessionId));

    const result = await query(
      `INSERT INTO upload_sessions (
         id, owner_user_id, target_type, original_name, mime_type,
         total_size, total_chunks, chunk_size, metadata, received_chunks, temp_dir, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, '[]'::jsonb, $10, 'pending')
       RETURNING *`,
      [
        sessionId,
        req.user.id,
        targetType,
        originalName,
        mimeType,
        totalSize,
        totalChunks,
        chunkSize,
        JSON.stringify(metadata),
        tempDir,
      ]
    );

    res.status(201).json({ success: true, data: formatSession(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const getSession = async (req, res, next) => {
  try {
    const session = await getSessionById(req.params.id);
    const access = ensureSessionAccess(req, session);

    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    res.json({ success: true, data: formatSession(req, session) });
  } catch (err) {
    next(err);
  }
};

const uploadChunk = async (req, res, next) => {
  try {
    const session = await getSessionById(req.params.id);
    const access = ensureSessionAccess(req, session);

    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (session.status !== 'pending' && session.status !== 'failed') {
      return res.status(409).json({ success: false, message: 'Upload session is not accepting new chunks' });
    }

    const chunkIndex = Number.parseInt(req.params.chunkIndex, 10);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.total_chunks) {
      return res.status(400).json({ success: false, message: 'Invalid chunk index' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, message: 'Chunk payload is required' });
    }

    const expectedMax = chunkIndex === session.total_chunks - 1
      ? session.chunk_size
      : session.chunk_size;

    if (req.body.length > expectedMax) {
      return res.status(400).json({ success: false, message: 'Chunk payload exceeds declared chunk size' });
    }

    await ensureDir(session.temp_dir);
    const chunkPath = path.join(session.temp_dir, `${chunkIndex}.part`);
    await fs.promises.writeFile(chunkPath, req.body);

    const receivedChunks = uniqueSortedChunks([...(session.received_chunks || []), chunkIndex]);
    const updated = await updateSession(session.id, {
      received_chunks: JSON.stringify(receivedChunks),
      status: 'pending',
      error_message: null,
      last_chunk_at: new Date().toISOString(),
    });

    res.json({ success: true, data: formatSession(req, updated) });
  } catch (err) {
    next(err);
  }
};

const completeSession = async (req, res, next) => {
  try {
    const session = await getSessionById(req.params.id);
    const access = ensureSessionAccess(req, session);

    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const receivedChunks = uniqueSortedChunks(session.received_chunks);
    if (receivedChunks.length !== session.total_chunks) {
      return res.status(409).json({ success: false, message: 'Upload is incomplete. Some chunks are still missing.' });
    }

    const inAssembly = await updateSession(session.id, {
      status: 'assembling',
      error_message: null,
    });

    const asset = await assembleChunks(inAssembly);
    let completion;

    if (inAssembly.target_type === 'patient_document') {
      completion = await finalizePatientDocument(req, inAssembly, asset);
    } else if (inAssembly.target_type === 'media_feed') {
      completion = await finalizeMediaFeed(req, inAssembly, asset);
    } else {
      completion = await finalizeMedicineImage(req, inAssembly, asset);
    }

    const completed = await updateSession(inAssembly.id, {
      status: 'completed',
      finalized_asset_path: asset.relativePath,
      completed_resource_type: completion.resourceType,
      completed_resource_id: completion.resourceId,
      error_message: null,
    });

    await fs.promises.rm(inAssembly.temp_dir, { recursive: true, force: true });

    res.status(201).json({
      success: true,
      data: {
        session: formatSession(req, completed),
        result: completion.responseData,
      },
    });
  } catch (err) {
    if (req.params.id) {
      await markSessionFailed(req.params.id, err.message).catch(() => {});
    }
    next(err);
  }
};

module.exports = {
  createSession,
  getSession,
  uploadChunk,
  completeSession,
};
