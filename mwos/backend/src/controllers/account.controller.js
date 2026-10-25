const { query } = require('../config/database');

const areas = new Set(['appointments', 'documents', 'patients', 'vitals', 'interactions', 'notifications', 'account']);
const actions = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'GOOGLE_SIGN_IN']);

const getActivity = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user?.id) return res.status(401).json({ success: false, message: 'Sign in to view your activity.' });
  try {
    // Never expose audit payloads, clinical values, IPs, device IDs, or another user's history.
    const result = await query(
      `SELECT id, action, entity_type, created_at, reviewed_at FROM (
         (SELECT 'audit:' || id::text AS id, action, entity_type, created_at, NULL::text AS reviewed_at
          FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50)
         UNION ALL
         (SELECT 'notice:' || id::text AS id, 'GOOGLE_SIGN_IN' AS action, 'account' AS entity_type, created_at, metadata->>'reviewedAt' AS reviewed_at
          FROM notifications WHERE user_id = $1 AND metadata->>'event' = 'google_sign_in'
          ORDER BY created_at DESC, id DESC LIMIT 50)
       ) AS own_activity ORDER BY created_at DESC, id DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows.map((row) => ({
      id: row.id,
      action: actions.has(row.action) ? row.action : 'UPDATE',
      area: areas.has(row.entity_type) ? row.entity_type : 'clinic',
      createdAt: row.created_at,
      ...(row.action === 'GOOGLE_SIGN_IN' ? { securityReviewId: String(row.id).replace(/^notice:/, ''), reviewedAt: row.reviewed_at || null } : {}),
    })) });
  } catch (error) { next(error); }
};

module.exports = { getActivity };
