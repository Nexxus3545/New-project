const { query } = require('../config/database');

const ACTION_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const auditValuesForRequest = (req) => {
  // Identity evidence, license numbers and review notes remain in their private
  // record. Never duplicate a base64 ID file into the generic activity log.
  if (/\/credentials(?:\/|$)/.test(req.originalUrl)) {
    return { credentialAction: req.method === 'GET' ? 'accessed' : req.method === 'PATCH' ? 'reviewed' : 'submitted' };
  }
  // Emergency GPS coordinates are operationally sensitive and must not be copied into audit payloads.
  if (req.originalUrl.includes('/emergency/location')) {
    return { locationShare: req.method === 'DELETE' ? 'stopped' : 'updated' };
  }

  // Keep clinical notes, messages, identifiers and submitted files in their
  // protected records. Generic audit history records the action, never copies
  // the request payload or query string.
  return {};
};

const activityLogger = async (req, res, next) => {
  if (!ACTION_METHODS.has(req.method)) return next();
  if (!req.user) return next();

  res.on('finish', async () => {
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, request_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.user.id,
          res.statusCode >= 500 ? `${req.method}_ERROR` : res.statusCode >= 400 ? `${req.method}_DENIED` : req.method,
          req.originalUrl.split('?')[0].replace(/^\/api(?:\/v1)?\//, '').split('/')[0] || 'unknown',
          null,
          { ...auditValuesForRequest(req), statusCode: res.statusCode },
          req.requestId || null,
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );
    } catch (err) {
      // Report an operational failure without exposing query values or medical content.
      console.error('AUDIT_WRITE_FAILED', { requestId: req.requestId || null, code: /^[A-Z0-9_]{2,40}$/.test(err.code || '') ? err.code : 'AUDIT_ERROR' });
    }
  });

  next();
};

module.exports = { activityLogger };
