// Isolated API fixtures only. Never sends real emails or creates real appointments.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const deployed = process.env.MWOS_VERIFY_ORIGIN;
  if (deployed && deployed !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized target');
  const { preview } = await import('vite');
  const server = deployed ? null : await preview({ root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4184, strictPort: true } });
  const origin = deployed || 'http://127.0.0.1:4184';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const output = path.join(os.tmpdir(), 'mwos-google-email-verification');
  await fs.mkdir(output, { recursive: true });
  const errors = [];
  async function fixture({ emailStatus = 'accepted', unavailable = false } = {}) {
    const user = { id: 'test-user', role: 'patient', patientId: 'test-patient', firstName: 'Test', careType: 'general', email: 'test@example.invalid' };
    const writes = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 980 }, serviceWorkers: 'block' });
    await context.route('**/*', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      if (!url.pathname.includes('/api/')) return url.origin === origin && req.method() === 'GET' ? route.continue() : route.abort();
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      const reply = (data, status = 200, extra = {}) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, ...extra }) });
      if (req.method() === 'POST') {
        const body = req.postDataJSON(); writes.push({ endpoint, body });
        if (endpoint === '/auth/oauth/exchange') {
          assert.equal(body.code, 'test-only-oauth-proof');
          if (unavailable) return reply(null, 503, { code: 'EMAIL_UNAVAILABLE', message: 'Secure email verification is temporarily unavailable.' });
          if (!body.verificationCode) return reply({ verificationRequired: true, destination: 't***@example.invalid', expiresAt: new Date(Date.now() + 600000).toISOString() });
          if (body.verificationCode !== '123456') return reply(null, 400, { code: 'EMAIL_CODE_INVALID', message: 'The verification code is incorrect. Check your email and try again.' });
          return reply({ accessToken: 'test-session-token', refreshToken: 'test-refresh', user });
        }
        if (endpoint === '/appointments') return reply({ id: 'test-appointment', appointment_type: 'consultation', scheduled_date: body.scheduledDate, scheduled_time: body.scheduledTime, status: 'scheduled' }, 201, { notification: { inApp: true, email: emailStatus } });
        throw new Error(`Unexpected intercepted write: ${endpoint}`);
      }
      if (req.method() !== 'GET') return route.abort();
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/patients/me') return reply({ id: 'test-patient', gender: 'male', care_type: 'general', pregnancies: [] });
      if (endpoint === '/reports/patient-dashboard') return reply({ patientProfile: { careType: 'general' }, documentSummary: {} });
      if (endpoint === '/ai/recommendations') return reply({ suggestions: [] });
      if (endpoint === '/interactions/directory') return reply({ staff: [] });
      if (endpoint === '/notifications/settings') return reply({ configured: emailStatus !== 'unconfigured', googleEmailCodeRequired: true });
      if (endpoint === '/notifications') return reply([{ id: 'test-alert', type: 'info', title: 'Google sign-in security alert', body: 'Your patient access was authorized after Google identity and email-code verification.', metadata: { route: '/my/settings' }, email_status: emailStatus, created_at: new Date().toISOString() }]);
      return reply([]);
    });
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, writes };
  }
  async function login(app) {
    await app.page.goto(origin + '/oauth-callback?code=test-only-oauth-proof');
    await app.page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor();
    await app.page.waitForURL('**/oauth-callback');
    assert.equal(await app.page.evaluate(() => localStorage.getItem('accessToken')), null);
    assert.equal(await app.page.evaluate(() => localStorage.getItem('user')), null);
    await app.page.getByLabel('Six-digit email code').fill('000000');
    await app.page.getByRole('button', { name: 'Verify and continue' }).click();
    await app.page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    assert.equal(await app.page.evaluate(() => localStorage.getItem('accessToken')), null);
    await app.page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await app.page.screenshot({ path: path.join(output, 'email-code-mobile.png') });
    await app.page.getByLabel('Six-digit email code').fill('123456');
    await app.page.getByRole('button', { name: 'Verify and continue' }).click();
    await app.page.waitForURL('**/my/dashboard');
    assert.equal(await app.page.evaluate(() => localStorage.getItem('accessToken')), 'test-session-token');
    assert.ok(!await app.page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes('test-only-oauth-proof'))));
  }
  try {
    const app = await fixture(); await login(app);
    await app.page.goto(origin + '/my/notifications');
    await app.page.getByText('Google sign-in security alert', { exact: true }).waitFor();
    await app.page.getByText('Email accepted by sender; inbox delivery is not guaranteed.', { exact: true }).waitFor();
    await app.page.getByRole('link', { name: 'Review security settings' }).click();
    await app.page.getByRole('region', { name: 'Email and Google sign-in security' }).waitFor();
    await app.page.goto(origin + '/my/appointments');
    await app.page.getByLabel('Preferred date', { exact: true }).fill('2026-12-01');
    await app.page.getByLabel('Preferred time', { exact: true }).fill('09:00');
    await app.page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
    await app.page.getByText(/The email server accepted your appointment update/).waitFor();
    await app.context.close();
    const noSender = await fixture({ emailStatus: 'unconfigured' }); await login(noSender);
    await noSender.page.goto(origin + '/my/appointments');
    await noSender.page.getByLabel('Preferred date', { exact: true }).fill('2026-12-01');
    await noSender.page.getByLabel('Preferred time', { exact: true }).fill('09:00');
    await noSender.page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
    await noSender.page.getByText(/Your request is saved in MWOS. Email updates are not active/).waitFor();
    await noSender.context.close();
    const failed = await fixture({ unavailable: true });
    await failed.page.goto(origin + '/oauth-callback?code=test-only-oauth-proof');
    await failed.page.getByText('Secure email verification is temporarily unavailable.', { exact: true }).waitFor();
    assert.equal(await failed.page.evaluate(() => localStorage.getItem('accessToken')), null);
    await failed.context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', origin, checks: ['no session before code', 'invalid code retry', 'proof removed from URL/storage', '390px code form', 'verified session', 'security alert and settings', 'appointment email receipt', 'unconfigured sender is honest', 'verification failure remains locked'], data: 'all API calls mocked; zero real email or patient writes', screenshots: output }));
  } finally { await browser.close(); if (server) await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
