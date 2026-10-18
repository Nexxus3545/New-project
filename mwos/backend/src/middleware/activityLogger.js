const { query } = require('../config/database');

const ACTION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const normalizeBodyForAudit = (body) => {
  if (Buffer.isBuffer(body)) {
    return {
      bodyType: 'binary',
      sizeBytes: body.length,
    };
  }

  if (Array.isArray(body)) {
    return body.slice(0, 50);
  }

  if (body && typeof body === 'object') {
    return body;
  }

  return body || {};
};

const auditValuesForRequest = (req) => {
  // Emergency GPS coordinates are operationally sensitive and must not be copied into audit payloads.
  if (req.originalUrl.includes('/emergency/location')) {
    return { locationShare: req.method === 'DELETE' ? 'stopped' : 'updated' };
  }

  return normalizeBodyForAudit(req.body);
};

const activityLogger = async (req, res, next) => {
  if (!ACTION_METHODS.has(req.method)) return next();
  if (!req.user) return next();

  res.on('finish', async () => {
    if (res.statusCode >= 400) return;

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, request_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.user.id,
          req.method,
          req.originalUrl.split('/')[2] || 'unknown',
          null,
          auditValuesForRequest(req),
          req.requestId || null,
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );
    } catch (err) {
      console.error('Activity logger failed:', err.message);
    }
  });

  next();
};

module.exports = { activityLogger };
