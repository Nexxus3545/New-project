// Synthetic identity/email fixtures only. Never close a real account or send email.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const { preview } = await import('vite');
  const origin = 'http://127.0.0.1:4192';
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4192, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-account-security');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [];
  const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const noticeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  async function fixture({ role = 'patient', available = true } = {}) {
    let user = { id: 'synthetic-account', role, email: 'fixture@example.invalid', firstName: 'Synthetic', lastName: 'Patient', patientId: 'synthetic-patient', careType: 'general', uiPreferences: { theme: 'light', accent: 'rose', density: 'comfortable', surface: 'solid', motion: 'full' } };
    const writes = [];
    let purpose, reviewed = false;
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript((user) => { localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('accessToken', 'synthetic-session'); }, user);
    await context.route('**/*', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.includes('/api/')) return url.origin === origin ? route.continue() : route.abort();
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
      const send = (data, status = 200, message = '') => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status === 200, data, message }) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      if (req.method() !== 'GET') {
        writes.push({ endpoint, body: req.postDataJSON() });
        if (endpoint === '/account/security/request') { purpose = req.postDataJSON().purpose; return send({ requestId, destination: 'f***@example.invalid' }); }
        if (endpoint === '/account/security/confirm') {
          if (req.postDataJSON().code !== '202602') return send(null, 400, 'The verification code is incorrect or has expired.');
          reviewed = purpose === 'sign_in_confirm';
          return send({ purpose, signOut: purpose !== 'sign_in_confirm' });
        }
        if (endpoint === '/account/reactivate/request') return send({ requestId }, 200, 'If this account can be reactivated, a code has been emailed.');
        if (endpoint === '/account/reactivate/confirm') return send({}, 200, 'Your account is active again. Please sign in.');
        if (endpoint === '/auth/logout') return send({});
        if (endpoint === '/auth/preferences') { user = { ...user, uiPreferences: req.postDataJSON().uiPreferences }; return send(user); }
        throw new Error(`Unexpected account mutation: ${endpoint}`);
      }
      if (endpoint === '/auth/me') return send(user);
      if (endpoint === '/account/security') return send({ emailAvailable: available });
      if (endpoint === '/account/activity') return send([{ id: `notice:${noticeId}`, action: 'GOOGLE_SIGN_IN', area: 'account', createdAt: '2026-10-25T01:00:00Z', securityReviewId: noticeId, reviewedAt: reviewed ? '2026-10-25T01:02:00Z' : null }]);
      if (endpoint === '/account/deletion-requests') { assert.equal(role, 'admin'); return send([{ id: requestId, first_name: 'Synthetic', last_name: 'Requester', confirmed_at: '2026-10-25T01:00:00Z' }]); }
      if (endpoint === '/notifications/settings') return send({ configured: available, googleEmailCodeRequired: false, deliveryVerified: false });
      if (endpoint === '/auth/providers') return send({ google: false });
      return send([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, writes };
  }
  const verifyCode = async (page, code = '202602') => {
    const form = page.getByRole('form', { name: /^Verify / });
    await form.getByRole('textbox').fill(code);
    await form.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  };
  try {
    const patient = await fixture();
    await patient.page.goto(origin + '/my/settings');
    const controls = patient.page.getByRole('region', { name: 'Manage account access' });
    await controls.getByRole('button', { name: 'Deactivate account', exact: true }).waitFor();
    for (const width of [1280, 1024, 768, 390, 320]) {
      await patient.page.setViewportSize({ width, height: 1000 });
      assert.ok(await patient.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Account settings fit ${width}px`);
    }
    await controls.getByRole('button', { name: 'Deactivate account', exact: true }).click();
    assert.equal(patient.writes.length, 0, 'Selecting an action is not submission');
    await controls.getByRole('button', { name: 'Send deactivation verification code', exact: true }).click();
    assert.equal(patient.writes.length, 1, 'Sending a code is not account closure');
    await verifyCode(patient.page, '111111');
    await patient.page.getByText('The verification code is incorrect or has expired.', { exact: true }).waitFor();
    assert.ok(await patient.page.evaluate(() => localStorage.getItem('accessToken')));
    await controls.screenshot({ path: path.join(screenshots, 'verification-mobile.png') });
    await verifyCode(patient.page);
    await patient.page.waitForURL('**/login?account=deactivated');
    await patient.page.getByText('Your account was deactivated after verification.', { exact: false }).waitFor();
    assert.equal(await patient.page.evaluate(() => localStorage.getItem('accessToken')), null);
    await patient.page.getByRole('link', { name: 'Request reactivation', exact: true }).click();
    await patient.page.waitForURL('**/reactivate-account');
    await patient.page.getByLabel('Existing account email', { exact: true }).fill('fixture@example.invalid');
    await patient.page.getByRole('button', { name: 'Send reactivation code', exact: true }).click();
    await patient.page.getByLabel('Email verification code', { exact: true }).fill('202602');
    await patient.page.getByRole('button', { name: 'Verify and reactivate', exact: true }).click();
    await patient.page.getByText('Your account is active again. Please sign in.', { exact: true }).waitFor();
    assert.equal(await patient.page.evaluate(() => localStorage.getItem('accessToken')), null);
    await patient.context.close();

    const deletion = await fixture();
    await deletion.page.goto(origin + '/my/settings');
    await deletion.page.getByRole('button', { name: 'Request account deletion', exact: true }).click();
    await deletion.page.getByText('The clinic will review retained records before any further deletion.', { exact: false }).waitFor();
    await deletion.page.getByRole('button', { name: 'Send deletion verification code', exact: true }).click();
    await verifyCode(deletion.page);
    await deletion.page.waitForURL('**/login?account=deletion-requested');
    await deletion.page.getByText('No medical records have been erased.', { exact: false }).waitFor();
    await deletion.context.close();

    const review = await fixture();
    await review.page.goto(origin + '/my/settings?tab=activity');
    await review.page.getByText('Was this you?', { exact: true }).waitFor();
    assert.equal(await review.page.getByRole('link', { name: 'Google account security', exact: true }).getAttribute('href'), 'https://myaccount.google.com/security');
    await review.page.getByRole('button', { name: 'Yes, verify it was me', exact: true }).click();
    await verifyCode(review.page);
    await review.page.getByText('Reviewed with an email code.', { exact: true }).waitFor();
    await review.page.getByRole('link', { name: 'Change MWOS password', exact: true }).click();
    await review.page.waitForURL('**/my/settings#change-password');
    await review.page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
    assert.ok(await review.page.locator('#change-password').evaluate((element) => element.getBoundingClientRect().top < 150));
    await review.page.getByRole('link', { name: 'Recover or set MWOS password', exact: true }).click();
    await review.page.getByRole('heading', { name: 'Forgot password', exact: true }).waitFor();
    await review.page.goto(origin + '/my/settings?tab=appearance');
    await review.page.getByRole('form', { name: 'Appearance', exact: true }).waitFor();
    await review.page.getByRole('button', { name: 'Save appearance', exact: true }).click();
    await review.page.getByText('Appearance preferences synced across your account.', { exact: true }).waitFor();
    assert.equal(await review.page.getByRole('group', { name: 'Surface style', exact: true }).count(), 0);
    assert.equal(review.writes.at(-1).body.uiPreferences.accent, 'blush');
    await review.context.close();

    const unavailable = await fixture({ available: false });
    await unavailable.page.goto(origin + '/my/settings');
    await unavailable.page.getByText('Email verification is not connected.', { exact: false }).waitFor();
    assert.equal(await unavailable.page.getByRole('button', { name: 'Deactivate account', exact: true }).count(), 0);
    assert.equal(unavailable.writes.length, 0);
    await unavailable.context.close();

    const admin = await fixture({ role: 'admin' });
    await admin.page.goto(origin + '/settings');
    await admin.page.getByRole('heading', { name: 'Verified deletion requests', exact: true }).waitFor();
    await admin.page.getByText('Synthetic Requester', { exact: false }).waitFor();
    assert.equal(await admin.page.getByRole('button', { name: 'Deactivate account', exact: true }).count(), 0);
    await admin.context.close();
    assert.deepEqual(errors, []);
    console.log(`Account security browser checks passed: verified closure, wrong-code retry, no erasure, reactivation, real recovery links, sign-in review, branded defaults, unavailable sender, restricted review queue, 320-1280px. Synthetic fixtures only. Screenshots: ${screenshots}`);
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
