const nodemailer = require('nodemailer');

let transporter;

const isPreview = () => Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production');
const isEmailConfigured = () => !isPreview() && Boolean(process.env.EMAIL_HOST?.trim() && process.env.EMAIL_USER?.trim() && process.env.EMAIL_PASS?.trim() && process.env.EMAIL_FROM?.trim());

const emailUnavailable = () => Object.assign(new Error('Clinic email delivery is not configured.'), { code: 'EMAIL_NOT_CONFIGURED', statusCode: 503 });

const getTransporter = async () => {
  if (isPreview()) throw emailUnavailable();
  if (transporter) return transporter;

  const hasCustomSmtp = isEmailConfigured();

  if (hasCustomSmtp) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST.trim(),
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: Number(process.env.EMAIL_PORT || 587) === 465,
      requireTLS: Number(process.env.EMAIL_PORT || 587) !== 465,
      connectionTimeout: 4000,
      greetingTimeout: 3000,
      socketTimeout: 5000,
      dnsTimeout: 3000,
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_HOST.trim() === 'smtp.gmail.com' ? process.env.EMAIL_PASS.replace(/\s/g, '') : process.env.EMAIL_PASS,
      },
    });
    return transporter;
  }

  if (process.env.EMAIL_ALLOW_TEST_TRANSPORT !== 'true' || process.env.NODE_ENV === 'production' || process.env.VERCEL) throw emailUnavailable();
  const testAccount = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  return transporter;
};

const sendMail = async ({ to, subject, html, text }) => {
  const mailer = await getTransporter();
  const info = await mailer.sendMail({
    from: process.env.EMAIL_FROM || 'MWOS <no-reply@mwos.local>',
    to,
    subject,
    html,
    text,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (info.rejected?.length || !info.accepted?.length) {
    throw Object.assign(new Error('The email server did not accept the recipient.'), { code: 'EMAIL_REJECTED' });
  }
  return { messageId: info.messageId, previewUrl, accepted: true };
};

module.exports = { sendMail, isEmailConfigured };
