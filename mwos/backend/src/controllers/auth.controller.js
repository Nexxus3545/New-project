const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const { generateUniqueCode } = require('../utils/identifiers');
const { sendMail, isEmailConfigured } = require('../utils/mailer');
const { fetchStaffProfileByUserId, recordLicenseEvent, upsertStaffRegistry } = require('../utils/staff');
const { generateSessionTokens } = require('../utils/tokens');
const { issuedAfterRevocation } = require('../utils/sessionRevocation');
const { normalizePatientCare } = require('../utils/patientCare');
const { deliverOtp, generateOtpCode, hashOtpCode, maskPhone } = require('../utils/security');

const { DEFAULT_UI_PREFERENCES, sanitizeUiPreferences } = require('../utils/appearance');

const buildUserPayload = async (user, client) => {
  // Transaction callers must not acquire a second connection from a one-client pool.
  const executor = client || { query };
  const [patientResult, staffProfile] = await Promise.all([
    user.role === 'patient'
      ? executor.query(`SELECT id, gender, care_type,
          EXISTS (SELECT 1 FROM pregnancies pr WHERE pr.patient_id = patients.id AND pr.status = 'active') AS has_active_pregnancy
          FROM patients WHERE user_id = $1`, [user.id])
      : Promise.resolve({ rows: [] }),
    user.role === 'patient'
      ? Promise.resolve(null)
      : fetchStaffProfileByUserId(user.id, client),
  ]);

  const patientId = patientResult.rows[0]?.id || null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    avatarUrl: user.avatar_url || null,
    uiPreferences: sanitizeUiPreferences(user.ui_preferences || {}),
    patientId,
    patientGender: patientResult.rows[0]?.gender || null,
    careType: patientResult.rows[0]?.care_type || null,
    hasActivePregnancy: patientResult.rows[0]?.has_active_pregnancy === true,
    staffProfile,
    createdAt: user.created_at,
  };
};

const SMS_LOGIN_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const SMS_LOGIN_MAX_ATTEMPTS = 5;
const SMS_LOGIN_USER_FIELDS = 'id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, is_active, created_at';

const normalizePhilippineMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');

  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;

  return null;
};

const getPhoneVariants = (canonicalPhone) => [
  canonicalPhone,
  `0${canonicalPhone.slice(2)}`,
  `+${canonicalPhone}`,
];

const findActiveUserByPhone = (executor, canonicalPhone) => executor.query(
  `SELECT ${SMS_LOGIN_USER_FIELDS}
   FROM users
   WHERE is_active = TRUE
     AND regexp_replace(phone, '[^0-9]', '', 'g') = ANY($1::text[])
   LIMIT 1`,
  [getPhoneVariants(canonicalPhone)]
);

const requestSmsLogin = async (req, res, next) => {
  try {
    const phone = normalizePhilippineMobile(req.body?.phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid Philippine mobile number, such as 0917 123 4567.',
        requestId: req.requestId || null,
      });
    }

    if (!process.env.SMS_GATEWAY_URL) {
      return res.status(503).json({
        success: false,
        message: 'SMS sign-in is not available yet. Please use your email and password.',
        requestId: req.requestId || null,
        code: 'SMS_UNAVAILABLE',
      });
    }

    const userResult = await findActiveUserByPhone({ query }, phone);
    const user = userResult.rows[0];
    const genericMessage = 'If a mobile account matches this number, a verification code will arrive shortly.';

    // Keep account existence private: only a matching active account receives a code.
    if (!user) {
      return res.json({ success: true, message: genericMessage, data: {} });
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + SMS_LOGIN_EXPIRY_MINUTES * 60 * 1000);
    const challengeResult = await query(
      `INSERT INTO sms_login_challenges (user_id, phone, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [user.id, phone, hashOtpCode(code), expiresAt]
    );

    try {
      await deliverOtp({
        user: { ...user, phone: `+${phone}` },
        code,
        purpose: 'sign-in',
        context: 'sign-in',
      });
    } catch (deliveryError) {
      await query('UPDATE sms_login_challenges SET consumed_at = NOW() WHERE id = $1', [challengeResult.rows[0].id]);
      return res.status(503).json({
        success: false,
        message: 'We could not send an SMS code right now. Please use your email and password or try again shortly.',
        requestId: req.requestId || null,
        code: 'SMS_DELIVERY_FAILED',
      });
    }

    return res.json({
      success: true,
      message: genericMessage,
      data: {
        destination: maskPhone(user.phone),
        expiresInMinutes: SMS_LOGIN_EXPIRY_MINUTES,
      },
    });
  } catch (err) {
    next(err);
  }
};

const verifySmsLogin = async (req, res, next) => {
  const phone = normalizePhilippineMobile(req.body?.phone);
  const code = String(req.body?.code || '').trim();

  if (!phone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: 'Enter the mobile number and six-digit verification code.',
      requestId: req.requestId || null,
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const userResult = await findActiveUserByPhone(client, phone);
    const user = userResult.rows[0];

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'The verification code is invalid or has expired. Request a new code and try again.',
        requestId: req.requestId || null,
      });
    }

    const challengeResult = await client.query(
      `SELECT id, code_hash, attempt_count
       FROM sms_login_challenges
       WHERE user_id = $1
         AND phone = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [user.id, phone]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        message: 'The verification code is invalid or has expired. Request a new code and try again.',
        requestId: req.requestId || null,
      });
    }

    const attempts = Number(challenge.attempt_count || 0) + 1;
    const suppliedHash = hashOtpCode(code);
    const matches = crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(challenge.code_hash));

    if (!matches || attempts > SMS_LOGIN_MAX_ATTEMPTS) {
      await client.query(
        `UPDATE sms_login_challenges
         SET attempt_count = $1, consumed_at = CASE WHEN $2 THEN NOW() ELSE consumed_at END, updated_at = NOW()
         WHERE id = $3`,
        [attempts, attempts > SMS_LOGIN_MAX_ATTEMPTS, challenge.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        message: attempts > SMS_LOGIN_MAX_ATTEMPTS
          ? 'Too many incorrect codes. Request a new code and try again.'
          : 'The verification code is invalid or has expired. Request a new code and try again.',
        requestId: req.requestId || null,
      });
    }

    await client.query(
      'UPDATE sms_login_challenges SET attempt_count = $1, consumed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [attempts, challenge.id]
    );

    const { accessToken, refreshToken } = generateSessionTokens(user.id, user.role);
    await client.query(
      'UPDATE users SET refresh_token = $1, last_login_at = NOW(), last_seen_at = NOW(), updated_at = NOW() WHERE id = $2',
      [refreshToken, user.id]
    );
    const userPayload = await buildUserPayload(user, client);
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'SMS sign-in successful',
      data: {
        accessToken,
        refreshToken,
        user: userPayload,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const result = await query(
      `SELECT id, email, password, role, first_name, last_name, phone, avatar_url, ui_preferences, is_active, created_at
       FROM users
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateSessionTokens(user.id, user.role);

    await query(
      'UPDATE users SET refresh_token = $1, last_login_at = NOW(), last_seen_at = NOW(), updated_at = NOW() WHERE id = $2',
      [refreshToken, user.id]
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: await buildUserPayload(user),
      },
    });
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      role,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      city,
    } = req.body;

    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!['admin', 'doctor', 'midwife', 'nurse', 'patient'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const managedAccount = req.user?.role === 'admin';
    if (role !== 'patient' && !managedAccount) {
      return res.status(403).json({ success: false, message: 'Public registration is for patients only. Staff accounts must be created by an authorized clinic administrator.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (role === 'patient' && !dateOfBirth) {
      return res.status(400).json({ success: false, message: 'dateOfBirth is required for patient registration' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPhone = phone?.trim() || null;
    const normalizedCity = city?.trim() || null;
    const patientCare = role === 'patient' ? normalizePatientCare(req.body, { newPatient: true }) : {};

    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const client = await getClient();
    let user;

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO users (email, password, role, first_name, last_name, phone, ui_preferences)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, created_at`,
        [normalizedEmail, hashedPassword, role, normalizedFirstName, normalizedLastName, normalizedPhone, DEFAULT_UI_PREFERENCES]
      );

      user = result.rows[0];

      if (role !== 'patient') {
        const titleByRole = {
          admin: 'Clinic Administrator',
          doctor: 'Doctor',
          midwife: 'Midwife',
          nurse: 'Nurse',
        };

        const staffProfile = await upsertStaffRegistry({
          client,
          userId: user.id,
          professionalTitle: titleByRole[role] || role,
          department: 'Clinic Operations',
          licenseNumber: null,
          licenseType: 'Professional license',
          licenseStatus: 'pending',
          credentialNotes: 'Initial staff registry entry created during registration.',
          verifiedBy: null,
          verifiedAt: null,
          lastReviewedAt: new Date(),
        });

        await recordLicenseEvent({
          client,
          staffId: staffProfile.staffId,
          eventType: 'created',
          previousStatus: null,
          nextStatus: 'pending',
          notes: 'Initial staff registry entry created during registration.',
          performedBy: user.id,
        });
      }

      if (role === 'patient') {
        const patientCode = await generateUniqueCode({ table: 'patients', column: 'patient_code', prefix: 'MWOS-PAT', client });
        const birthingId = await generateUniqueCode({ table: 'patients', column: 'birthing_id', prefix: 'TMC-BIR', client });

        await client.query(
          `INSERT INTO patients (
            user_id, patient_code, birthing_id, first_name, last_name, date_of_birth, city, phone, email, created_by, gender, care_type
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            user.id,
            patientCode,
            birthingId,
            normalizedFirstName,
            normalizedLastName,
            dateOfBirth,
            normalizedCity,
            normalizedPhone,
            normalizedEmail,
            user.id,
            patientCare.gender,
            patientCare.careType,
          ]
        );
      }

      if (managedAccount) {
        const userPayload = await buildUserPayload(user, client);
        await client.query('COMMIT');
        return res.status(201).json({ success: true, message: 'Clinic account created. No sign-in session was issued.', data: { user: userPayload } });
      }

      const { accessToken, refreshToken } = generateSessionTokens(user.id, user.role);
      await client.query('UPDATE users SET refresh_token = $1, last_seen_at = NOW() WHERE id = $2', [refreshToken, user.id]);
      const userPayload = await buildUserPayload(user, client);
      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          accessToken,
          refreshToken,
          user: userPayload,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const result = await query(
      'SELECT id, email, role, is_active, refresh_token, sessions_revoked_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
    }

    if (user.refresh_token !== token || !issuedAfterRevocation(decoded, user.sessions_revoked_at)) {
      return res.status(401).json({ success: false, message: 'Refresh token reuse detected' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateSessionTokens(user.id, user.role);
    await query('UPDATE users SET refresh_token = $1, updated_at = NOW() WHERE id = $2', [newRefreshToken, user.id]);

    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await query('UPDATE users SET refresh_token = NULL, updated_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: await buildUserPayload(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone, avatarUrl } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'email, firstName and lastName are required' });
    }

    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.length > 2_000_000) {
      return res.status(400).json({ success: false, message: 'Avatar image is too large' });
    }

    const emailValue = email.toLowerCase().trim();
    if (emailValue !== req.user.email?.toLowerCase()) {
      const current = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      if (typeof req.body.currentPassword !== 'string' || !current.rows[0] || !await bcrypt.compare(req.body.currentPassword, current.rows[0].password)) {
        return res.status(403).json({ success: false, message: 'Verify your current MWOS password before changing the login email. Google-only users can set an MWOS password through recovery first.' });
      }
    }
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [emailValue, req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const result = await query(
      `UPDATE users
       SET email = $1,
           first_name = $2,
           last_name = $3,
           phone = $4,
           avatar_url = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, created_at`,
      [emailValue, firstName.trim(), lastName.trim(), phone?.trim() || null, avatarUrl || null, req.user.id]
    );

    const updatedUser = result.rows[0];
    if (updatedUser.role === 'patient') {
      await query(
        `UPDATE patients
         SET first_name = $1,
             last_name = $2,
             phone = $3,
             email = $4,
             updated_at = NOW()
         WHERE user_id = $5`,
        [updatedUser.first_name, updatedUser.last_name, updatedUser.phone, updatedUser.email, req.user.id]
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: await buildUserPayload(updatedUser),
    });
  } catch (err) {
    next(err);
  }
};

const updatePreferences = async (req, res, next) => {
  try {
    const uiPreferences = sanitizeUiPreferences(req.body?.uiPreferences || req.body || {});

    const result = await query(
      `UPDATE users
       SET ui_preferences = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, role, first_name, last_name, phone, avatar_url, ui_preferences, created_at`,
      [uiPreferences, req.user.id]
    );

    res.json({
      success: true,
      message: 'Appearance updated successfully',
      data: await buildUserPayload(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password = $1, refresh_token = NULL, sessions_revoked_at = NOW(), updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ success: true, message: 'Password changed successfully. Please sign in again.' });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email !== 'string' || !email.trim() || email.length > 254) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!isEmailConfigured()) return res.status(503).json({ success: false, message: 'Clinic email recovery is unavailable. Contact the clinic for assistance.' });

    const userResult = await query(
      `SELECT u.id, u.email, COALESCE(oi.provider_email, u.email) AS recovery_email
       FROM users u LEFT JOIN oauth_identities oi ON oi.user_id = u.id AND oi.provider = 'google'
       WHERE u.is_active = TRUE AND (LOWER(u.email) = $1 OR LOWER(oi.provider_email) = $1)
       ORDER BY (LOWER(oi.provider_email) = $1) DESC NULLS LAST LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const appUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
    const resetUrl = new URL('/reset-password', appUrl);
    if (!['https:', 'http:'].includes(resetUrl.protocol) || (process.env.NODE_ENV === 'production' && resetUrl.protocol !== 'https:')) throw new Error('A secure clinic recovery URL is required');
    resetUrl.searchParams.set('token', resetToken);

    await sendMail({
      to: user.recovery_email,
      subject: 'MWOS Password Reset Request',
      text: `Reset your MWOS password using this single-use link: ${resetUrl.toString()} . It expires in 30 minutes. This changes only your MWOS password, not your Google password. If this was not you, ignore this email and review your Google account security.`,
    });

    res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'token and newPassword are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const tokenResult = await query(
      `WITH consumed AS (
         UPDATE password_reset_tokens SET used_at = NOW()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id
       ) UPDATE users SET password = $2, refresh_token = NULL, sessions_revoked_at = NOW(), updated_at = NOW()
         WHERE id IN (SELECT user_id FROM consumed) AND is_active = TRUE RETURNING id`,
      [tokenHash, hashedPassword]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  buildUserPayload,
  login,
  requestSmsLogin,
  verifySmsLogin,
  register,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updateProfile,
  updatePreferences,
  changePassword,
};
