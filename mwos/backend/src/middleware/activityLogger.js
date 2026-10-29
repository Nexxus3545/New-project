const { query } = require('../config/database');

const ACTION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const normalizeBodyForAudit = (body, depth = 0) => {
  if (depth > 6) return '[truncated]';
  if (Buffer.isBuffer(body)) {
    return {
      bodyType: 'binary',
      sizeBytes: body.length,
    };
  }

  if (Array.isArray(body)) {
    return body.slice(0, 50).map((value) => normalizeBodyForAudit(value, depth + 1));
  }

  if (body && typeof body === 'object') {
    return Object.fromEntries(Object.entries(body).slice(0, 100).map(([key, value]) => [
      key,
      /password|token|secret|authorization/i.test(key) ? '[redacted]' : normalizeBodyForAudit(value, depth + 1),
    ]));
  }

  return depth === 0 ? body || {} : body;
};

const auditValuesForRequest = (req) => {
  // Identity evidence, license numbers and review notes remain in their private
  // record. Never duplicate a base64 ID file into the generic activity log.
  if (/\/credentials(?:\/|$)/.test(req.originalUrl)) {
    return { credentialAction: req.method === 'PATCH' ? 'reviewed' : 'submitted' };
  }
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
