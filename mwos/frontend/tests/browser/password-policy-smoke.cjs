// Synthetic browser/API fixtures. No real accounts, passwords or external calls.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const origin = 'http://127.0.0.1:4203';
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4203, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const pageErrors = [];
  const passing = 'Synthetic-password1!';
  async function fixture(authenticated = false) {
    const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', firstName: 'Synthetic', lastName: 'Admin', email: 'synthetic@example.invalid', isActive: true, uiPreferences: {}, staffProfile: { isVerified: false, licenseStatus: 'pending' } };
    const requests = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Manila', serviceWorkers: 'block' });
    if (authenticated) await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('accessToken', 'synthetic-password-policy-token');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const body = ['POST', 'PATCH'].includes(request.method()) ? request.postDataJSON() : undefined;
        requests.push({ endpoint, method: request.method(), body });
        const reply = (data, status = 200, message) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, message }) });
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/auth/providers') return reply({ google: false });
        if (endpoint === '/auth/register') return reply(null, 400, 'Synthetic test stops before creating any account.');
        if (endpoint === '/auth/reset-password') return reply(null, 200, 'Synthetic reset accepted.');
        if (endpoint === '/auth/change-password') return reply(null, 200, 'Synthetic change accepted.');
        if (endpoint === '/auth/logout') return reply(null);
        if (request.method() !== 'GET') throw Error('Unexpected synthetic write ' + endpoint);
        if (endpoint === '/account/security') return reply({ emailAvailable: false });
        if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false, deliveryVerified: false });
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      if (url.origin === origin || ['about:', 'data:', 'blob:'].includes(url.protocol)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    return { context, page, requests };
  }
  const writes = (state, endpoint) => state.requests.filter((call) => call.method !== 'GET' && call.endpoint === endpoint);
  try {
    const registration = await fixture();
    const { page } = registration;
    await page.goto(origin + '/register');
    await page.locator('input[name="firstName"]').fill('Synthetic');
    await page.locator('input[name="lastName"]').fill('Patient');
    await page.locator('input[name="dateOfBirth"]').fill('2000-01-01');
    await page.locator('select[name="gender"]').selectOption('female');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('input[name="email"]').fill('synthetic@example.invalid');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const registrationPassword = page.getByLabel('Password', { exact: true });
    const proceed = page.getByRole('button', { name: 'Continue', exact: true });
    for (const invalid of ['lettersOnly', 'letters123', 'letters!!!', '12345678!', 'letters1 ', 'a1!']) {
      await registrationPassword.fill(invalid);
      assert.equal(await proceed.isDisabled(), true);
      assert.equal(writes(registration, '/auth/register').length, 0);
    }
    await registrationPassword.fill(passing);
    await page.getByText('Password meets the requirements.', { exact: true }).waitFor();
    assert.equal(await proceed.isEnabled(), true);
    await proceed.click();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByText('Synthetic test stops before creating any account.', { exact: true }).waitFor();
    assert.equal(writes(registration, '/auth/register').length, 1);
    assert.equal(writes(registration, '/auth/register')[0].body.password, passing);
    await registration.context.close();

    const reset = await fixture();
    await reset.page.goto(origin + '/reset-password?token=synthetic-token');
    const resetPassword = reset.page.getByLabel('New password', { exact: true });
    const resetButton = reset.page.getByRole('button', { name: 'Reset password', exact: true });
    await resetPassword.fill('letters123');
    assert.equal(await resetButton.isDisabled(), true);
    assert.equal(writes(reset, '/auth/reset-password').length, 0);
    await resetPassword.fill(passing);
    await resetButton.click();
    await reset.page.getByText('Synthetic reset accepted.', { exact: true }).waitFor();
    assert.equal(writes(reset, '/auth/reset-password')[0].body.newPassword, passing);
    await reset.context.close();

    const settings = await fixture(true);
    await settings.page.goto(origin + '/settings');
    await settings.page.getByLabel('Current password', { exact: true }).fill('legacy-password');
    await settings.page.getByLabel('New password', { exact: true }).fill('letters123');
    await settings.page.getByLabel('Confirm new password', { exact: true }).fill('letters123');
    const change = settings.page.getByRole('button', { name: 'Change password', exact: true });
    assert.equal(await change.isDisabled(), true);
    assert.equal(writes(settings, '/auth/change-password').length, 0);
    await settings.page.getByLabel('New password', { exact: true }).fill(passing);
    await settings.page.getByLabel('Confirm new password', { exact: true }).fill('Mismatch1!');
    assert.equal(await change.isDisabled(), true);
    await settings.page.getByText('The new passwords do not match.', { exact: true }).waitFor();
    await settings.page.getByLabel('Confirm new password', { exact: true }).fill(passing);
    assert.equal(await change.isEnabled(), true);
    for (const width of [320, 390, 1440]) {
      await settings.page.setViewportSize({ width, height: 1100 });
      await settings.page.getByLabel('New password', { exact: true }).scrollIntoViewIfNeeded();
      assert.ok(await settings.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Password controls fit the viewport');
    }
    await change.click();
    await settings.page.waitForURL(origin + '/login');
    assert.equal(writes(settings, '/auth/change-password').length, 1);
    assert.equal(writes(settings, '/auth/change-password')[0].body.newPassword, passing);
    await settings.context.close();
    assert.deepEqual(pageErrors, []);
    console.log('Password browser checks passed: weak registration/reset/change blocked before requests, live checklist, valid mixed password, matching confirmation, old current-password acceptance, and 320–1440px layouts. All APIs were synthetic.');
  } finally { await browser.close(); await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
