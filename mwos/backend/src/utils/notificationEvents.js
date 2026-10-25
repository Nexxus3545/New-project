const crypto = require('node:crypto');
const { query } = require('../config/database');
const { sendMail, isEmailConfigured } = require('./mailer');

const portalUrl = (pathname) => {
  const configured = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
  const url = new URL(pathname, configured);
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('A secure clinic portal URL is required.');
  }
  return url.toString();
};

// Store the notification with the business transaction. Email is attempted only after commit/release.
async function queueNotification(client, { eventKey, userId, recipient, title, body, metadata, createdBy = null }) {
  const id = crypto.randomUUID();
  const result = await client.query(
    `INSERT INTO notification_email_events (id, event_key, user_id, recipient, subject, text_body, delivery_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [id, eventKey, userId, recipient || null, `TMC Copino MWOS: ${title}`, body, !recipient ? 'no_verified_recipient' : isEmailConfigured() ? 'pending' : 'unconfigured']
  );
  if (!result.rows.length) return null;
  const notice = await client.query(
    `INSERT INTO notifications (user_id, title, body, type, channel, metadata, created_by)
     VALUES ($1,$2,$3,'info','in_app',$4,$5) RETURNING id`,
    [userId, title, body, metadata || {}, createdBy]
  );
  await client.query('UPDATE notification_email_events SET notification_id = $1 WHERE id = $2', [notice.rows[0].id, id]);
  return id;
}

async function deliverNotification(id) {
  if (!id) return { email: 'not_requested' };
  try {
    const claimed = await query(
      `UPDATE notification_email_events SET delivery_status = 'sending', attempted_at = NOW()
       WHERE id = $1 AND delivery_status = 'pending' RETURNING recipient, subject, text_body`, [id]
    );
    if (!claimed.rows.length) {
      const result = await query('SELECT delivery_status FROM notification_email_events WHERE id = $1', [id]);
      return { inApp: true, email: result.rows[0]?.delivery_status || 'unknown' };
    }
    try {
      const event = claimed.rows[0];
      await sendMail({ to: event.recipient, subject: event.subject, text: event.text_body });
    } catch (error) {
      // Never log recipient addresses, message content, codes, or SMTP credentials.
      await query("UPDATE notification_email_events SET delivery_status = 'failed', error_code = $1 WHERE id = $2", [String(error.code || 'EMAIL_FAILED').slice(0, 40), id]);
      return { inApp: true, email: 'failed' };
    }
    // SMTP may have accepted the message even if recording its receipt fails.
    await query("UPDATE notification_email_events SET delivery_status = 'accepted', accepted_at = NOW() WHERE id = $1", [id]);
    return { inApp: true, email: 'accepted' };
  } catch {
    // A committed appointment/sign-in must not look unsuccessful because delivery logging failed.
    return { inApp: true, email: 'unknown' };
  }
}

async function queueGoogleSignIn(client, user, { eventId, verifiedEmail, emailVerified }) {
  const time = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  return queueNotification(client, {
    eventKey: `google-sign-in:${eventId}`, userId: user.id, recipient: verifiedEmail,
    title: 'Google sign-in security alert',
    body: `Was this you? A Google sign-in to your MWOS patient account completed on ${time} (Philippine time). Google identity verification${emailVerified ? ' and the additional email code check' : ''} succeeded. Patient access was authorized; this does not grant staff access. Review this sign-in and confirm with an email code: ${portalUrl('/my/settings?tab=activity')}. If this was not you, secure your Google account: https://myaccount.google.com/security . MWOS password recovery: ${portalUrl('/forgot-password')} . Change your MWOS password: ${portalUrl('/my/settings#change-password')} . Changing an MWOS password does not change your Google password. Never share verification codes.`,
    metadata: { event: 'google_sign_in', route: '/my/settings', emailCodeVerified: emailVerified === true },
  });
}

async function queueAppointmentNotification(client, appointment, createdBy) {
  const recipient = await client.query(
    `SELECT u.id, oi.provider_email AS email
     FROM patients p JOIN users u ON u.id = p.user_id AND u.is_active = true
     LEFT JOIN oauth_identities oi ON oi.user_id = u.id AND oi.provider = 'google'
     WHERE p.id = $1`, [appointment.patient_id]
  );
  if (!recipient.rows.length) return null;
  const date = new Date(appointment.scheduled_date).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' });
  const time = String(appointment.scheduled_time).slice(0, 5);
  const status = String(appointment.status).replaceAll('_', ' ');
  return queueNotification(client, {
    eventKey: `appointment:${appointment.id}:${appointment.updated_at || appointment.created_at}`,
    userId: recipient.rows[0].id, recipient: recipient.rows[0].email, createdBy,
    title: 'Appointment schedule update',
    body: `Your TMC Copino clinic appointment is ${status}. Schedule: ${date} at ${time} (Philippine time). Reference: ${appointment.id}. A scheduled request is not a confirmed visit until the clinic confirms it. Review the latest status securely: ${portalUrl('/my/appointments')}`,
    metadata: { event: 'appointment', appointmentId: appointment.id, route: '/my/appointments' },
  });
}

module.exports = { queueGoogleSignIn, queueAppointmentNotification, queueNotification, deliverNotification };
