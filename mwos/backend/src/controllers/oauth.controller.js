const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getClient, query, testConnection } = require('../config/database');
const { isProviderConfigured } = require('../config/oauth');
const { generateUniqueCode } = require('../utils/identifiers');
const { generateSessionTokens } = require('../utils/tokens');
const { buildUserPayload } = require('./auth.controller');
const { MOBILE_CALLBACK, createState, readMobileState, codeHash, verifierChallenge } = require('../utils/oauthHandoff');
const { sendMail, isEmailConfigured } = require('../utils/mailer');
const { requiresGoogleEmailCode, maskEmail, createEmailCode, matchesEmailCode } = require('../utils/googleEmailVerification');
const { queueGoogleSignIn, deliverNotification } = require('../utils/notificationEvents');

const VALID_PROVIDERS = new Set(['google', 'facebook']);
const OAUTH_STATE_COOKIE = 'mwos_oauth_state';
const OAUTH_CODE_TTL_MS = 60 * 1000;
const DEFAULT_UI_PREFERENCES = {
  theme: 'light',
  accent: 'rose',
  density: 'comfortable',
  surface: 'solid',
  motion: 'full',
};

const getProvider = (value) => (VALID_PROVIDERS.has(value) ? value : null);

const getFrontendUrl = () => {
  const configured = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);

  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:3000';
  }
};

const frontendRedirect = (res, path, params = {}) => {
  const url = new URL(path, `${getFrontendUrl()}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return res.redirect(url.toString());
};

const getCookie = (req, name) => {
  const serialized = req.headers.cookie || '';
  const prefix = `${name}=`;
  return serialized
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length) || null;
};

const stateCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api',
  maxAge: 10 * 60 * 1000,
});

const safelyMatches = (left, right) => {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const loginRedirect = (req, res, params) => {
  if (!req.mobileOAuth) return frontendRedirect(res, '/login', params);
  const url = new URL(MOBILE_CALLBACK);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return res.redirect(url.toString());
};

const createOAuthError = (code, message) => {
  const error = new Error(message);
  error.oauthCode = code;
  return error;
};

const authUserFields = 'id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, is_active, created_at';
const prefixedAuthUserFields = (alias) => authUserFields
  .split(', ')
  .map((field) => `${alias}.${field}`)
  .join(', ');

const auditOAuthEvent = async (client, { userId, action, provider, req }) => {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, request_id, ip_address, user_agent)
     VALUES ($1, $2, 'users', $1, $3, $4, $5, $6)`,
    [
      userId,
      action,
      { provider },
      req.requestId || null,
      req.ip || null,
      req.get('user-agent') || null,
    ]
  );
};

const provisionPatientFromProvider = async (providerProfile, req) => {
  const provider = getProvider(providerProfile?.provider);
  const subject = typeof providerProfile?.subject === 'string' ? providerProfile.subject.trim() : '';
  const email = typeof providerProfile?.email === 'string' ? providerProfile.email.trim().toLowerCase() : '';
  const firstName = typeof providerProfile?.firstName === 'string' ? providerProfile.firstName.trim() : '';
  const lastName = typeof providerProfile?.lastName === 'string' ? providerProfile.lastName.trim() : '';

  if (!provider || !subject) {
    throw createOAuthError('oauth_failed', 'The identity provider did not return a valid account.');
  }

  const linked = await query(
    `SELECT ${prefixedAuthUserFields('u')}
     FROM oauth_identities oi
     JOIN users u ON u.id = oi.user_id
     WHERE oi.provider = $1 AND oi.provider_subject = $2`,
    [provider, subject]
  );

  if (linked.rows.length > 0) {
    const user = linked.rows[0];
    if (user.role !== 'patient') {
      throw createOAuthError('oauth_role_restricted', 'This sign-in method is available for patient accounts only.');
    }
    if (!user.is_active) {
      throw createOAuthError('oauth_account_inactive', 'This account is not active. Please contact the clinic.');
    }
    if (provider === 'google' && (!email || !providerProfile.emailVerified)) {
      throw createOAuthError('oauth_email_required', 'A verified Google email address is required.');
    }
    if (provider === 'google') {
      await query('UPDATE oauth_identities SET provider_email = $1, updated_at = NOW() WHERE user_id = $2 AND provider = $3', [email, user.id, provider]);
    }
    return { user, created: false };
  }

  if (!email || !providerProfile.emailVerified) {
    throw createOAuthError('oauth_email_required', 'A verified email address is required to create a patient account.');
  }
  if (!firstName || !lastName) {
    throw createOAuthError('oauth_profile_incomplete', 'Your provider profile needs a first and last name before it can create an account.');
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw createOAuthError(
      'oauth_account_exists',
      'This email already has an MWOS password account. Sign in with your password first to protect your account.'
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // The random, hashed value satisfies the legacy password column without creating a usable hidden password.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), 12);
    const inserted = await client.query(
      `INSERT INTO users (email, password, role, first_name, last_name, ui_preferences)
       VALUES ($1, $2, 'patient', $3, $4, $5)
       RETURNING ${authUserFields}`,
      [email, passwordHash, firstName, lastName, DEFAULT_UI_PREFERENCES]
    );
    const user = inserted.rows[0];

    await client.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_subject, provider_email)
       VALUES ($1, $2, $3, $4)`,
      [user.id, provider, subject, email]
    );

    await auditOAuthEvent(client, { userId: user.id, action: 'oauth_patient_registered', provider, req });
    await client.query('COMMIT');
    return { user, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw createOAuthError('oauth_account_exists', 'This account is already registered. Please sign in using your existing method.');
    }
    throw error;
  } finally {
    client.release();
  }
};

const createOneTimeCode = async (userId, challenge, providerProfile) => {
  const code = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + OAUTH_CODE_TTL_MS);
  await query(
    `INSERT INTO oauth_login_codes (user_id, code_hash, expires_at, provider, verified_email, email_otp_required)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, codeHash(code, challenge), expiresAt, providerProfile.provider, providerProfile.emailVerified ? providerProfile.email?.trim().toLowerCase() : null, providerProfile.provider === 'google' && requiresGoogleEmailCode()]
  );
  return code;
};

const providerStatus = async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const databaseReady = await testConnection();

  return res.json({
    success: true,
    data: {
      google: databaseReady && isProviderConfigured('google'),
      facebook: databaseReady && isProviderConfigured('facebook'),
    },
  });
};

const start = (providerName, passport) => async (req, res, next) => {
  const provider = getProvider(providerName);
  if (!provider || !isProviderConfigured(provider)) {
    return frontendRedirect(res, '/login', { oauth_error: `${provider || 'provider'}_unavailable` });
  }

  if (!await testConnection()) {
    return frontendRedirect(res, '/login', { oauth_error: 'oauth_service_unavailable' });
  }

  let state;
  try {
    state = createState(req.query);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  res.cookie(OAUTH_STATE_COOKIE, state, stateCookieOptions());
  return passport.authenticate(provider, {
    scope: provider === 'google' ? ['profile', 'email'] : ['email'],
    session: false,
    state,
  })(req, res, next);
};

const validateState = (providerName) => (req, res, next) => {
  const provider = getProvider(providerName);
  const expectedState = getCookie(req, OAUTH_STATE_COOKIE);
  const receivedState = typeof req.query.state === 'string' ? req.query.state : null;
  res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions());

  if (!provider || !safelyMatches(expectedState, receivedState)) {
    return frontendRedirect(res, '/login', { oauth_error: 'oauth_state_invalid' });
  }
  req.mobileOAuth = readMobileState(receivedState);
  return next();
};

const ensureConfigured = (providerName) => (req, res, next) => {
  const provider = getProvider(providerName);
  if (!provider || !isProviderConfigured(provider)) {
    return frontendRedirect(res, '/login', { oauth_error: `${provider || 'provider'}_unavailable` });
  }
  return next();
};

const finish = async (req, res, next) => {
  try {
    const { user, created } = await provisionPatientFromProvider(req.user, req);
    const code = await createOneTimeCode(user.id, req.mobileOAuth?.codeChallenge, req.user);
    if (req.mobileOAuth) return loginRedirect(req, res, { code });
    return frontendRedirect(res, '/oauth-callback', { code, new_account: created ? '1' : undefined });
  } catch (error) {
    if (error.oauthCode) {
      return loginRedirect(req, res, { oauth_error: error.oauthCode });
    }
    return next(error);
  }
};

const exchange = async (req, res, next) => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code) {
      return res.status(400).json({ success: false, message: 'Your sign-in link is incomplete. Please try again.' });
    }
    let challenge = '';
    if (req.body?.codeVerifier !== undefined) {
      try {
        challenge = verifierChallenge(req.body.codeVerifier);
      } catch {
        return res.status(400).json({ success: false, message: 'Your mobile sign-in proof is invalid. Start sign-in again.' });
      }
    }

    const client = await getClient();
    let user;
    let data;
    let emailCodeMessage;
    let eventId;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT c.id AS code_id, c.provider, c.verified_email, c.email_otp_required,
                c.email_otp_hash, c.email_otp_expires_at, c.email_otp_attempts, ${prefixedAuthUserFields('u')}
         FROM oauth_login_codes c
         JOIN users u ON u.id = c.user_id
         WHERE c.code_hash = $1 AND c.consumed_at IS NULL AND c.expires_at > NOW()
         FOR UPDATE`,
        [codeHash(code, challenge)]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'This sign-in link has expired. Please sign in again.' });
      }

      user = result.rows[0];
      if (!user.is_active) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'This account is not active. Please contact the clinic.' });
      }

      if (user.role !== 'patient') {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Google sign-in only authorizes patient access. Staff must use their clinic account.' });
      }

      let verified = !user.email_otp_required;
      if (user.email_otp_required) {
        if (challenge && req.body.emailVerificationSupported !== true) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, code: 'CLIENT_UPDATE_REQUIRED', message: 'Update the MWOS Android app or use the clinic website to complete the required email-code check.' });
        }
        if (!user.email_otp_hash) {
          if (!user.verified_email || !isEmailConfigured()) {
            await client.query('ROLLBACK');
            return res.status(503).json({ success: false, code: 'EMAIL_UNAVAILABLE', message: 'Secure email verification is temporarily unavailable. Please contact the clinic or try again later.' });
          }
          const generated = createEmailCode(user.code_id);
          await client.query(
            `UPDATE oauth_login_codes SET email_otp_hash = $1, email_otp_expires_at = $2,
             email_otp_sent_at = NOW(), expires_at = $2 WHERE id = $3`,
            [generated.hash, generated.expiresAt, user.code_id]
          );
          emailCodeMessage = { id: user.code_id, to: user.verified_email, code: generated.code };
          data = { verificationRequired: true, destination: maskEmail(user.verified_email), expiresAt: generated.expiresAt };
        } else if (req.body.verificationCode === undefined) {
          data = { verificationRequired: true, destination: maskEmail(user.verified_email), expiresAt: user.email_otp_expires_at };
        } else {
          const attempts = Number(user.email_otp_attempts || 0) + 1;
          const supplied = typeof req.body.verificationCode === 'string' ? req.body.verificationCode.trim() : '';
          const expired = !user.email_otp_expires_at || new Date(user.email_otp_expires_at) <= new Date();
          verified = !expired && attempts <= 5 && matchesEmailCode(user.code_id, supplied, user.email_otp_hash);
          await client.query(
            `UPDATE oauth_login_codes SET email_otp_attempts = $1,
             consumed_at = CASE WHEN $2 THEN NOW() ELSE consumed_at END WHERE id = $3`,
            [attempts, expired || (!verified && attempts >= 5), user.code_id]
          );
          if (!verified) {
            await client.query('COMMIT');
            return res.status(400).json({ success: false, code: expired || attempts >= 5 ? 'EMAIL_CODE_EXPIRED' : 'EMAIL_CODE_INVALID', message: expired || attempts >= 5 ? 'This verification attempt has ended. Start Google sign-in again for a new code.' : 'The verification code is incorrect. Check your email and try again.' });
          }
        }
      }

      if (verified) {
        const { accessToken, refreshToken } = generateSessionTokens(user.id, user.role);
        await client.query('UPDATE oauth_login_codes SET consumed_at = NOW() WHERE id = $1', [user.code_id]);
        await client.query(
          'UPDATE users SET refresh_token = $1, last_login_at = NOW(), last_seen_at = NOW(), updated_at = NOW() WHERE id = $2',
          [refreshToken, user.id]
        );
        await auditOAuthEvent(client, { userId: user.id, action: 'oauth_login', provider: user.provider || 'external', req });
        const userPayload = await buildUserPayload(user, client);
        if (user.provider === 'google') eventId = await queueGoogleSignIn(client, user, { eventId: user.code_id, verifiedEmail: user.verified_email, emailVerified: user.email_otp_required });
        data = { accessToken, refreshToken, user: userPayload };
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }

    if (emailCodeMessage) {
      try {
        await sendMail({ to: emailCodeMessage.to, subject: 'Your MWOS Google sign-in verification code', text: `Your MWOS sign-in code is ${emailCodeMessage.code}. It expires in 10 minutes and can be used once. Do not share this code. If you did not start this sign-in, ignore this email. Clinic staff will never ask for this code.` });
      } catch {
        await query('UPDATE oauth_login_codes SET consumed_at = NOW() WHERE id = $1', [emailCodeMessage.id]);
        return res.status(503).json({ success: false, code: 'EMAIL_DELIVERY_FAILED', message: 'Your verification email could not be sent. No sign-in session was created. Please start Google sign-in again later.' });
      }
    }
    if (eventId) data.notification = await deliverNotification(eventId);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const { normalizePatientCare } = require('../utils/patientCare');

const completePatientProfile = async (req, res, next) => {
  try {
    const { dateOfBirth, phone, city } = req.body || {};
    const normalizedBirthDate = typeof dateOfBirth === 'string' ? dateOfBirth.trim() : '';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() || null : null;
    const normalizedCity = typeof city === 'string' ? city.trim() || null : null;
    const patientCare = normalizePatientCare(req.body, { newPatient: true });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate) || Number.isNaN(Date.parse(`${normalizedBirthDate}T00:00:00Z`)) || normalizedBirthDate > new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ success: false, message: 'Enter a valid date of birth to complete your patient record.' });
    }

    const client = await getClient();
    let user;
    try {
      await client.query('BEGIN');
      const userResult = await client.query(`SELECT ${authUserFields} FROM users WHERE id = $1 FOR UPDATE`, [req.user.id]);
      user = userResult.rows[0];
      if (!user || user.role !== 'patient') {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Only patient accounts can complete this profile.' });
      }

      const existingPatient = await client.query('SELECT id FROM patients WHERE user_id = $1', [user.id]);
      if (existingPatient.rows.length === 0) {
        const patientCode = await generateUniqueCode({ table: 'patients', column: 'patient_code', prefix: 'MWOS-PAT', client });
        const birthingId = await generateUniqueCode({ table: 'patients', column: 'birthing_id', prefix: 'TMC-BIR', client });
        await client.query(
          `INSERT INTO patients (
             user_id, patient_code, birthing_id, first_name, last_name, date_of_birth, city, phone, email, created_by, gender, care_type
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [user.id, patientCode, birthingId, user.first_name, user.last_name, normalizedBirthDate, normalizedCity, normalizedPhone, user.email, user.id, patientCare.gender, patientCare.careType]
        );
      }

      const updatedUser = await client.query(
        `UPDATE users SET phone = COALESCE($1, phone), updated_at = NOW() WHERE id = $2 RETURNING ${authUserFields}`,
        [normalizedPhone, user.id]
      );
      user = updatedUser.rows[0];
      await auditOAuthEvent(client, { userId: user.id, action: 'oauth_patient_profile_completed', provider: 'external', req });
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      success: true,
      message: 'Your patient profile is ready.',
      data: await buildUserPayload(user),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  callback: (providerName, passport) => (req, res, next) => passport.authenticate(
    providerName,
    { session: false },
    (error, providerProfile) => {
      if (error) {
        if (req.mobileOAuth) return loginRedirect(req, res, { oauth_error: 'oauth_failed' });
        return next(error);
      }
      if (!providerProfile) return loginRedirect(req, res, { oauth_error: 'oauth_failed' });
      req.user = providerProfile;
      return finish(req, res, next);
    }
  )(req, res, next),
  completePatientProfile,
  ensureConfigured,
  exchange,
  finish,
  providerStatus,
  start,
  validateState,
  frontendRedirect,
};
