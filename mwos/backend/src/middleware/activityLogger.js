const { query } = require('../config/database');

const ACTION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const activityLogger = async (req, res, next) => {
  if (!ACTION_METHODS.has(req.method)) return next();
  if (!req.user) return next();

  res.on('finish', async () => {
    if (res.statusCode >= 400) return;

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.id,
          req.method,
          req.originalUrl.split('/')[2] || 'unknown',
          null,
          req.body || {},
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
