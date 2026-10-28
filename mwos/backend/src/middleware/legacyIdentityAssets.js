const { query } = require('../config/database');
const { isIdentityDocumentType } = require('../utils/identityDocumentTypes');

// Mounted at /uploads so encoded/case aliases of the documents directory are
// checked before express.static decodes the filesystem path.
function documentAssetPath(rawPath) {
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return { invalid: true }; }
  if (decoded.includes('\\') || /[\u0000-\u001f%]/.test(decoded)) return { invalid: true };
  const segments = decoded.split('/').slice(1);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '' || /[. ]$|:/.test(segment))) return { invalid: true };
  if (segments[0]?.toLowerCase() !== 'documents') return { documentPath: null };
  if (segments.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(segments[1])) return { invalid: true };
  return { documentPath: `/uploads/documents/${segments[1]}`.toLowerCase() };
}

const createLegacyIdentityAssetGuard = (execute = query) => async (req, res, next) => {
  const { invalid, documentPath } = documentAssetPath(req.path || '');
  const unavailable = (status = 404) => {
    res.set('Cache-Control', 'no-store');
    return res.status(status).json({ success: false, message: 'Document unavailable.' });
  };
  if (invalid) return unavailable();
  if (!documentPath) return next();
  try {
    const result = await execute(
      `SELECT document_type FROM patient_documents
       WHERE LOWER(SPLIT_PART(SPLIT_PART(regexp_replace(file_url, '^https?://[^/]+', '', 'i'), '?', 1), '#', 1)) = $1
       UNION ALL
       SELECT document_type FROM staff_documents
       WHERE LOWER(SPLIT_PART(SPLIT_PART(regexp_replace(file_url, '^https?://[^/]+', '', 'i'), '?', 1), '#', 1)) = $1`,
      [documentPath]
    );
    if (result.rows.some((row) => isIdentityDocumentType(row.document_type))) return unavailable();
    return next();
  } catch { return unavailable(503); }
};

module.exports = { documentAssetPath, createLegacyIdentityAssetGuard, legacyIdentityAssetGuard: createLegacyIdentityAssetGuard() };
