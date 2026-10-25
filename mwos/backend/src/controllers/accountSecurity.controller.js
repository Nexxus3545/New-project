const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { getClient, query } = require('../config/database');
const { sendMail, isEmailConfigured } = require('../utils/mailer');
const { maskEmail } = require('../utils/googleEmailVerification');

const purposes = new Set(['deactivate', 'delete', 'sign_in_confirm', 'secure_account']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hashCode = (id, code) => {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Account security signing secret is required');
  return crypto.createHmac('sha256', secret).update(`account-security:${id}:${code}`).digest('hex');
};
const matches = (id, code, expected) => /^\d{6}$/.test(code) && /^[a-f0-9]{64}$/.test(expected) && crypto.timingSafeEqual(Buffer.from(hashCode(id, code), 'hex'), Buffer.from(expected, 'hex'));
const unavailable = (res) => res.status(503).json({ success: false, message: 'Clinic email verification is unavailable. Your account has not been changed. Contact the clinic for help.' });

const status = async (req, res, next) => {
  try {
    const result = await query("SELECT purpose, confirmed_at FROM account_security_requests WHERE user_id = $1 AND confirmed_at IS NOT NULL AND purpose IN ('deactivate','delete','reactivate') ORDER BY confirmed_at DESC LIMIT 1", [req.user.id]);
    res.json({ success: true, data: { emailAvailable: isEmailConfigured(), latestRequest: result.rows[0] || null } });
  } catch (error) { next(error); }
};

const requestCode = async (req, res, next) => {
  const recovery = req.path === '/account/reactivate/request';
  const purpose = recovery ? 'reactivate' : req.body?.purpose;
  const resourceId = ['sign_in_confirm', 'secure_account'].includes(purpose) ? req.body?.noticeId : null;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if ((!recovery && !purposes.has(purpose)) || (resourceId !== null && !uuid.test(resourceId || '')) || (recovery && (!email || email.length > 254))) {
    return res.status(400).json({ success: false, message: 'Choose a valid account action.' });
  }
  if (!isEmailConfigured()) return unavailable(res);
  let issued;
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    const owner = await client.query(`SELECT u.id, u.email, u.is_active, u.role, u.password,
      (SELECT provider_email FROM oauth_identities WHERE user_id = u.id AND provider = 'google' LIMIT 1) AS google_email
      FROM users u WHERE ${recovery ? 'LOWER(u.email) = $1 OR u.id IN (SELECT user_id FROM oauth_identities WHERE provider = \'google\' AND LOWER(provider_email) = $1)' : 'u.id = $1'} FOR UPDATE`, [recovery ? email : req.user.id]);
    const user = owner.rows[0];
    let allowed = Boolean(user && (recovery ? !user.is_active && user.role === 'patient' : user.is_active));
    if (user && ['deactivate', 'delete'].includes(purpose) && user.role !== 'patient') allowed = false;
    if (user && ['deactivate', 'delete'].includes(purpose) && !user.google_email &&
        (typeof req.body.currentPassword !== 'string' || !await bcrypt.compare(req.body.currentPassword, user.password))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Verify your current MWOS password before requesting account closure.' });
    }
    if (user && recovery) {
      const latest = await client.query("SELECT purpose FROM account_security_requests WHERE user_id = $1 AND confirmed_at IS NOT NULL AND purpose IN ('deactivate','delete','reactivate') ORDER BY confirmed_at DESC LIMIT 1", [user.id]);
      allowed = allowed && latest.rows[0]?.purpose === 'deactivate';
    }
    if (user && resourceId) {
      const notice = await client.query("SELECT id FROM notifications WHERE id = $1 AND user_id = $2 AND metadata->>'event' = 'google_sign_in'", [resourceId, user.id]);
      allowed = allowed && notice.rows.length > 0;
    }
    if (user && allowed) {
      const recent = await client.query("SELECT id FROM account_security_requests WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds' LIMIT 1", [user.id]);
      if (recent.rows.length) {
        await client.query('ROLLBACK');
        if (recovery) return res.json({ success: true, data: { requestId: crypto.randomUUID() }, message: 'If this account can be reactivated, a code has been emailed.' });
        return res.status(429).json({ success: false, message: 'Please wait one minute before requesting another code.' });
      }
      const id = crypto.randomUUID();
      const code = String(crypto.randomInt(100000, 1000000));
      await client.query('UPDATE account_security_requests SET consumed_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
      await client.query('INSERT INTO account_security_requests (id, user_id, purpose, resource_id, code_hash, expires_at) VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL \'10 minutes\')', [id, user.id, purpose, resourceId, hashCode(id, code)]);
      issued = { id, code, to: user.google_email || user.email };
    }
    await client.query('COMMIT');
  } catch (error) { await client?.query('ROLLBACK').catch(() => {}); return next(error); }
  finally { client?.release(); }
  // The public recovery response is deliberately identical for unknown/ineligible accounts.
  if (!issued && !recovery) return res.status(403).json({ success: false, message: 'This action is unavailable for this account or sign-in notice. Nothing has changed.' });
  if (!issued) return res.json({ success: true, data: { requestId: crypto.randomUUID() }, message: 'If this account can be reactivated, a code has been emailed.' });
  try {
    await sendMail({ to: issued.to, subject: 'TMC Copino MWOS account verification', text: `Your MWOS verification code for ${purpose.replaceAll('_', ' ')} is ${issued.code}. It expires in 10 minutes. Do not share it. Nothing changes until you enter this code in MWOS. If this was not you, ignore this message and review your account security.` });
  } catch {
    await query('UPDATE account_security_requests SET consumed_at = NOW() WHERE id = $1', [issued.id]);
    return unavailable(res);
  }
  return res.json({ success: true, data: { requestId: issued.id, ...(recovery ? {} : { destination: maskEmail(issued.to) }) }, message: recovery ? 'If this account can be reactivated, a code has been emailed.' : 'Check your email for the verification code.' });
};

const confirm = async (req, res, next) => {
  const recovery = req.path === '/account/reactivate/confirm';
  const id = req.body?.requestId;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!uuid.test(id || '') || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Enter the six-digit code from your email.' });
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    // Lock the user before the request, in the same order as issuance.
    const owner = await client.query(`SELECT u.id FROM users u JOIN account_security_requests r ON r.user_id = u.id WHERE r.id = $1 ${recovery ? "AND r.purpose = 'reactivate'" : 'AND u.id = $2'} FOR UPDATE OF u`, recovery ? [id] : [id, req.user.id]);
    const result = owner.rows.length ? await client.query('SELECT * FROM account_security_requests WHERE id = $1 FOR UPDATE', [id]) : { rows: [] };
    const item = result.rows[0];
    if (!item || item.consumed_at || Number(item.attempts) >= 5 || new Date(item.expires_at) <= new Date() || (recovery !== (item.purpose === 'reactivate'))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This verification request is invalid or expired. Request a new code.' });
    }
    if (!matches(id, code, item.code_hash)) {
      await client.query('UPDATE account_security_requests SET attempts = attempts + 1, consumed_at = CASE WHEN attempts >= 4 THEN NOW() ELSE NULL END WHERE id = $1', [id]);
      await client.query('COMMIT');
      return res.status(400).json({ success: false, message: 'The verification code is incorrect or has expired.' });
    }
    if (recovery) {
      const latest = await client.query("SELECT purpose FROM account_security_requests WHERE user_id = $1 AND confirmed_at IS NOT NULL AND purpose IN ('deactivate','delete','reactivate') ORDER BY confirmed_at DESC LIMIT 1", [item.user_id]);
      if (latest.rows[0]?.purpose !== 'deactivate') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'The clinic must review this account before it can be reopened.' });
      }
    }
    await client.query('UPDATE account_security_requests SET consumed_at = NOW(), confirmed_at = clock_timestamp() WHERE id = $1', [id]);
    const signOut = ['deactivate', 'delete', 'secure_account'].includes(item.purpose);
    if (signOut || recovery) await client.query('UPDATE users SET is_active = $1, refresh_token = NULL, sessions_revoked_at = NOW(), updated_at = NOW() WHERE id = $2', [!['deactivate', 'delete'].includes(item.purpose), item.user_id]);
    if (item.resource_id) await client.query("UPDATE notifications SET metadata = metadata || jsonb_build_object('reviewedAt', NOW(), 'reviewResult', $1::text) WHERE id = $2 AND user_id = $3", [item.purpose === 'sign_in_confirm' ? 'confirmed' : 'secured', item.resource_id, item.user_id]);
    await client.query("INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1,$2,'account',$1)", [item.user_id, `account_${item.purpose}`]);
    if (item.purpose === 'delete') await client.query(`INSERT INTO notifications (user_id, title, body, type, channel, metadata)
      SELECT id, 'Account deletion review requested', 'A verified user requested account deletion. Access is closed; clinical records have not been erased. Open the restricted account review queue.', 'info', 'in_app', jsonb_build_object('route','/settings?tab=account','event','account_deletion_request','requestId',$1::text)
      FROM users WHERE role = 'admin' AND is_active = TRUE`, [id]);
    await client.query('COMMIT');
    return res.json({ success: true, data: { purpose: item.purpose, signOut }, message: item.purpose === 'delete' ? 'Deletion request verified. Your login is closed while the clinic reviews retained records.' : recovery ? 'Your account is active again. Please sign in.' : item.purpose === 'deactivate' ? 'Your account has been deactivated. You can request reactivation by email.' : 'Sign-in security review saved.' });
  } catch (error) { await client?.query('ROLLBACK').catch(() => {}); next(error); }
  finally { client?.release(); }
};

const deletionQueue = async (_req, res, next) => {
  try {
    const result = await query("SELECT r.id, r.user_id, u.first_name, u.last_name, r.confirmed_at FROM account_security_requests r JOIN users u ON u.id = r.user_id WHERE r.purpose = 'delete' AND r.confirmed_at IS NOT NULL ORDER BY r.confirmed_at DESC LIMIT 100");
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
};

module.exports = { status, requestCode, confirm, deletionQueue };
