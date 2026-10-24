const { query } = require('../config/database');
const { sendMail } = require('../utils/mailer');
const { emailSecurityStatus } = require('../utils/googleEmailVerification');

const getMine = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT n.id, n.title, n.body, n.type, n.channel, n.is_read, n.metadata, n.created_at, n.read_at,
              e.delivery_status AS email_status
       FROM notifications n
       LEFT JOIN notification_email_events e ON e.notification_id = n.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read, read_at`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { userId, title, body, type, channel, metadata } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ success: false, message: 'userId, title and body are required' });
    }

    const userResult = await query('SELECT id, email, first_name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const targetUser = userResult.rows[0];

    const result = await query(
      `INSERT INTO notifications (user_id, title, body, type, channel, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        title,
        body,
        type || 'info',
        channel || 'in_app',
        metadata || {},
        req.user.id,
      ]
    );

    if ((channel || 'in_app') === 'email') {
      await sendMail({
        to: targetUser.email,
        subject: `[MWOS] ${title}`,
        text: body,
      }).catch((err) => {
        console.error('Email notification failed:', String(err.code || 'EMAIL_FAILED').slice(0, 40));
      });
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const getSettings = (_req, res) => res.json({ success: true, data: emailSecurityStatus() });

module.exports = { getMine, markRead, create, getSettings };
