const crypto = require('node:crypto');
const { isEmailConfigured } = require('./mailer');

const requiresGoogleEmailCode = () => process.env.GOOGLE_EMAIL_OTP_REQUIRED === 'true';
const googleEmailCodeReady = () => !requiresGoogleEmailCode() || (process.env.GOOGLE_EMAIL_DELIVERY_VERIFIED === 'true' && isEmailConfigured());
const assertEmailCodeRolloutDisabled = (env = process.env) => {
  if (env.GOOGLE_EMAIL_OTP_REQUIRED === 'true') {
    throw new Error('This notifications release requires GOOGLE_EMAIL_OTP_REQUIRED=false. Required email codes need a separate approved rollout after sender delivery and Android compatibility are verified.');
  }
};
const maskEmail = (email) => {
  const [name, host] = String(email || '').split('@');
  return host ? `${name.slice(0, 1)}***@${host}` : 'your Google email';
};
const hashEmailCode = (id, code) => {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('An OTP signing secret is required.');
  return crypto.createHmac('sha256', secret).update(`google-email:${id}:${code}`).digest('hex');
};
const createEmailCode = (id) => {
  const code = String(crypto.randomInt(100000, 1000000));
  return { code, hash: hashEmailCode(id, code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
};
const matchesEmailCode = (id, code, expected) => {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(hashEmailCode(id, code), 'hex'), Buffer.from(expected, 'hex'));
};
const emailSecurityStatus = () => ({ configured: isEmailConfigured(), deliveryVerified: process.env.GOOGLE_EMAIL_DELIVERY_VERIFIED === 'true', googleEmailCodeRequired: requiresGoogleEmailCode() });
module.exports = { requiresGoogleEmailCode, googleEmailCodeReady, assertEmailCodeRolloutDisabled, maskEmail, createEmailCode, matchesEmailCode, emailSecurityStatus };
