// Every API call is isolated from live accounts, including on the production UI.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const deployed = process.env.MWOS_VERIFY_ORIGIN;
  if (deployed && deployed !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized verification target');
  const { preview } = await import('vite');
  const server = deployed ? null : await preview({ root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4187, strictPort: true } });
  const origin = deployed || 'http://127.0.0.1:4187';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-settings-center');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [];
  async function fixture(role = 'patient') {
    const user = { id: 'settings-test-user', role, firstName: 'Test', lastName: 'User', email: 'test@example.invalid', phone: '09171234567', patientId: 'settings-patient', careType: 'general' };
    const requests = [];
    let activityStatus = 'success';
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-not-a-real-session');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      if (!url.pathname.includes('/api/')) {
        if (url.origin !== origin && url.protocol !== 'data:') return route.abort();
        if (deployed && url.origin === origin) {
          // Retry only read-only public deployment resources, never account APIs.
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try { return await route.fulfill({ response: await route.fetch({ timeout: 30000, maxRetries: 1 }) }); }
            catch { if (attempt === 2) return route.abort('connectionfailed'); }
          }
        }
        return route.continue();
      }
      assert.equal(request.method(), 'GET', 'Settings navigation and device preferences must not write to account data');
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      requests.push(endpoint);
      const reply = (data) => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false });
      if (endpoint === '/account/activity') {
        if (activityStatus === 'error') return route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Private backend error' }) });
        return reply(activityStatus === 'empty' ? [] : [{ id: 'notice:1', action: 'GOOGLE_SIGN_IN', area: 'account', createdAt: '2026-10-24T00:00:00Z', new_values: { secret: 'MUST-NOT-RENDER' } }]);
      }
      if (endpoint === '/reports/patient-dashboard') return reply({ patientProfile: { care_type: 'general' }, documentSummary: {} });
      if (endpoint === '/ai/recommendations') return reply({ suggestions: [] });
      if (endpoint === '/interactions/directory') return reply({ staff: [] });
      if (endpoint === '/notifications') return reply([{ id: 'safety-notice', title: 'Important clinic reminder', body: 'Keep your appointment details current', is_read: false }]);
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const goto = (url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    page.setDefaultNavigationTimeout(90000);
    return { page, goto, context, requests, activity: (status) => { activityStatus = status; }, base: role === 'patient' ? '/my/settings' : '/settings' };
  }
  try {
    const app = await fixture();
    await app.goto(origin + app.base + '?tab=language');
    const menu = app.page.getByRole('navigation', { name: 'Settings sections' });
    for (const name of ['Account & security', 'Language', 'Privacy checkup', 'Privacy Center', 'Activity log', 'Content preferences', 'Appearance']) {
      assert.equal(await menu.getByRole('link', { name, exact: true }).count(), 1);
      assert.equal(await menu.getByRole('link', { name, exact: true }).locator('svg').count(), 1);
    }
    await app.page.getByRole('button', { name: 'Filipino', exact: true }).click();
    await menu.getByRole('link', { name: 'Wika', exact: true }).waitFor();
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await menu.getByRole('link', { name: 'Hitsura', exact: true }).waitFor();
    assert.equal(await app.page.getByRole('button', { name: 'Filipino', exact: true }).getAttribute('aria-pressed'), 'true');
    await app.page.getByRole('button', { name: 'English', exact: true }).click();
    await menu.getByRole('link', { name: 'Privacy checkup', exact: true }).click();
    await app.page.getByText('Saved; SMS ownership is not verified', { exact: true }).waitFor();
    await app.page.getByText('Not enabled', { exact: true }).waitFor();
    await menu.getByRole('link', { name: 'Privacy Center', exact: true }).click();
    await app.page.getByRole('link', { name: 'Contact clinic securely', exact: true }).waitFor();
    await menu.getByRole('link', { name: 'Activity log', exact: true }).click();
    await app.page.getByText('Google sign-in', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('MUST-NOT-RENDER').count(), 0);
    app.activity('error');
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await app.page.getByText('Activity could not be loaded. No history has been cleared.', { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(await app.page.getByText('No recorded activity is available yet.', { exact: true }).count(), 0);
    assert.equal(await app.page.getByText('Private backend error').count(), 0);
    app.activity('empty');
    await app.page.getByRole('button', { name: 'Retry', exact: true }).click();
    await app.page.getByText('No recorded activity is available yet.', { exact: true }).waitFor();
    await menu.getByRole('link', { name: 'Content preferences', exact: true }).click();
    await app.page.getByRole('checkbox', { name: 'Show clinic videos and community events', exact: true }).uncheck();
    await app.page.getByRole('checkbox', { name: 'Show health-tip previews', exact: true }).uncheck();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await app.page.setViewportSize({ width, height: 1200 });
      assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Settings fits ${width}px`);
      assert.ok(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth));
    }
    await app.page.screenshot({ path: path.join(screenshots, 'settings-mobile.png'), fullPage: true });
    await app.goto(origin + '/my');
    await app.page.getByText('Important clinic reminder', { exact: true }).waitFor();
    assert.equal(await app.page.getByRole('heading', { name: 'Health Tips & Education', exact: true }).count(), 0);
    assert.equal(await app.page.getByRole('heading', { name: 'Health Guidance', exact: true }).count(), 0);
    await app.goto(origin + app.base + '?tab=content');
    assert.equal(await app.page.getByRole('checkbox', { name: 'Show health-tip previews', exact: true }).isChecked(), false);
    await app.page.getByRole('checkbox', { name: 'Show clinic videos and community events', exact: true }).check();
    await app.page.getByRole('checkbox', { name: 'Show health-tip previews', exact: true }).check();
    await app.goto(origin + '/my');
    await app.page.getByRole('heading', { name: 'Health Tips & Education', exact: true }).waitFor();
    await app.page.getByRole('heading', { name: 'Health Guidance', exact: true }).waitFor();
    await app.context.close();
    const staff = await fixture('nurse');
    await staff.goto(origin + staff.base + '?tab=activity');
    await staff.page.getByText('Google sign-in', { exact: true }).waitFor();
    await staff.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Appearance', exact: true }).click();
    await staff.page.getByRole('form', { name: 'Appearance', exact: true }).waitFor();
    await staff.context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', origin, checks: ['seven icon menus', 'language and reload', 'privacy controls', 'activity success/error/retry/empty', 'no raw audit payloads', 'content visibility and safety alerts', 'five viewport widths', 'staff settings'], data: 'isolated API fixtures; no real account writes', screenshots }));
  } finally { await browser.close(); if (server) await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
