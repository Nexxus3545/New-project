const { query } = require('../config/database');
const { sendMail } = require('../utils/mailer');

const getMine = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, body, type, channel, is_read, metadata, created_at, read_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
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
        html: `<p>Hello ${targetUser.first_name || 'User'},</p><p>${body}</p>`,
      }).catch((err) => {
        console.error('Email notification failed:', err.message);
      });
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMine, markRead, create };
