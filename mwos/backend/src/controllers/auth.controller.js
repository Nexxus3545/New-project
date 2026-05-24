const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const { generateUniqueCode } = require('../utils/identifiers');
const { sendMail } = require('../utils/mailer');

const DEFAULT_UI_PREFERENCES = {
  theme: 'light',
  accent: 'rose',
  density: 'comfortable',
  surface: 'solid',
  motion: 'full',
};

const PREFERENCE_OPTIONS = {
  theme: ['system', 'light', 'dark'],
  accent: ['teal', 'rose', 'amber', 'cyan', 'slate'],
  density: ['comfortable', 'compact'],
  surface: ['solid', 'glass'],
  motion: ['full', 'reduced'],
};

const sanitizeUiPreferences = (input = {}) => {
  const normalized = { ...DEFAULT_UI_PREFERENCES };

  for (const [key, allowed] of Object.entries(PREFERENCE_OPTIONS)) {
    if (typeof input[key] === 'string' && allowed.includes(input[key])) {
      normalized[key] = input[key];
    }
  }

  return normalized;
};

const buildUserPayload = async (user) => {
  let patientId = null;
  if (user.role === 'patient') {
    const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [user.id]);
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }
  }

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
    createdAt: user.created_at,
  };
};

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId, role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
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

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

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

      if (role === 'patient') {
        const patientCode = await generateUniqueCode({ table: 'patients', column: 'patient_code', prefix: 'MWOS-PAT' });
        const birthingId = await generateUniqueCode({ table: 'patients', column: 'birthing_id', prefix: 'TMC-BIR' });

        await client.query(
          `INSERT INTO patients (
            user_id, patient_code, birthing_id, first_name, last_name, date_of_birth, city, phone, email, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
          ]
        );
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.role);
      await client.query('UPDATE users SET refresh_token = $1, last_seen_at = NOW() WHERE id = $2', [refreshToken, user.id]);
      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          accessToken,
          refreshToken,
          user: await buildUserPayload(user),
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
      'SELECT id, email, role, is_active, refresh_token FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
    }

    if (user.refresh_token !== token) {
      return res.status(401).json({ success: false, message: 'Refresh token reuse detected' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);
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
      'UPDATE users SET password = $1, refresh_token = NULL, updated_at = NOW() WHERE id = $2',
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
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const userResult = await query(
      'SELECT id, email, first_name FROM users WHERE email = $1',
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

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    await sendMail({
      to: user.email,
      subject: 'MWOS Password Reset Request',
      text: `Hi ${user.first_name}, reset your password using this link: ${resetUrl}`,
      html: `<p>Hi ${user.first_name},</p><p>Reset your password using this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p>`,
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

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = await query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const resetRow = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await query('UPDATE users SET password = $1, refresh_token = NULL, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      resetRow.user_id,
    ]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetRow.id]);

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
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
