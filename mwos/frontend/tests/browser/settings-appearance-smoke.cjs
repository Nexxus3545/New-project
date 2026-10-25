// API requests are intercepted on both local and deployed builds. No real account writes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const deployed = process.env.MWOS_VERIFY_ORIGIN;
  if (deployed && deployed !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized verification target');
  const { preview } = await import('vite');
  const server = deployed ? null : await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4186, strictPort: true } });
  const origin = deployed || 'http://127.0.0.1:4186';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-settings-appearance');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [];

  async function fixture(role = 'patient') {
    let user = { id: 'test-user', role, firstName: 'Test', lastName: 'User', email: 'test@example.invalid', phone: '09171234567', careType: 'general' };
    const writes = [];
    const requests = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      if (!localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(user));
      if (!localStorage.getItem('accessToken')) localStorage.setItem('accessToken', 'test-only-not-a-real-session');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, PATCH, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      if (!url.pathname.includes('/api/')) return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      requests.push(endpoint);
      const reply = (data) => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (req.method() === 'PATCH' && endpoint === '/auth/preferences') {
        const body = req.postDataJSON();
        assert.deepEqual(Object.keys(body), ['uiPreferences']);
        writes.push(body);
        user = { ...user, uiPreferences: body.uiPreferences };
        return reply(user);
      }
      if (req.method() !== 'GET') throw new Error(`Unexpected intercepted write: ${req.method()} ${endpoint}`);
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false });
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, context, writes, requests, base: role === 'patient' ? '/my/settings' : '/settings', user: () => user };
  }

  async function checkFit(page, width) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page fits ${width}px`);
    const form = page.getByRole('form', { name: 'Appearance', exact: true });
    assert.ok(await form.evaluate((element) => element.scrollWidth <= element.clientWidth), `Appearance form fits ${width}px`);
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    assert.ok(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth), `Settings options fit ${width}px`);
    assert.equal(await page.getByRole('form', { name: 'Sign-in email', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Change password', exact: true }).count(), 0);
  }

  try {
    const app = await fixture();
    await app.page.goto(origin + app.base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await app.page.getByRole('form', { name: 'Sign-in email', exact: true }).waitFor();
    assert.equal(await app.page.getByRole('form', { name: 'Appearance', exact: true }).count(), 0);
    assert.equal(await app.page.getByRole('button', { name: 'Change password', exact: true }).count(), 1);
    const navigation = app.page.getByRole('navigation', { name: 'Settings sections' });
    assert.equal(await navigation.getByRole('link', { name: 'Account & security', exact: true }).getAttribute('aria-current'), 'page');
    await navigation.getByRole('link', { name: 'Appearance', exact: true }).click();
    await app.page.getByRole('form', { name: 'Appearance', exact: true }).waitFor();
    assert.equal(new URL(app.page.url()).search, '?tab=appearance');
    assert.equal(await navigation.getByRole('link', { name: 'Appearance', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await navigation.locator('[data-app-icon="appearance"]').count(), 1);
    for (const width of [1440, 1024, 768, 390, 320]) await checkFit(app.page, width);
    await checkFit(app.page, 1440);
    const form = app.page.getByRole('form', { name: 'Appearance', exact: true });
    await form.screenshot({ path: path.join(screenshots, 'appearance-desktop.png') });
    for (const [group, choice] of [['Theme mode', 'Dark'], ['Accent palette', 'Graphite'], ['Density', 'Compact'], ['Motion', 'Reduced motion']]) {
      const option = form.getByRole('group', { name: group, exact: true }).getByRole('button', { name: choice, exact: true });
      await option.click();
      assert.equal(await option.getAttribute('aria-pressed'), 'true');
    }
    const expected = { theme: 'dark', accent: 'slate', density: 'compact', surface: 'solid', motion: 'reduced' };
    assert.deepEqual(await app.page.evaluate(() => JSON.parse(localStorage.getItem('appearance'))), expected);
    for (const cssClass of ['dark', 'ui-compact', 'ui-motion-reduced']) {
      assert.ok(await app.page.locator('html').evaluate((element, name) => element.classList.contains(name), cssClass));
    }
    await form.getByRole('button', { name: 'Save appearance', exact: true }).click();
    await form.getByRole('status').getByText('Appearance preferences synced across your account.', { exact: true }).waitFor();
    assert.deepEqual(app.writes, [{ uiPreferences: expected }]);
    assert.equal(app.user().email, 'test@example.invalid');
    assert.equal(app.user().phone, '09171234567');
    await checkFit(app.page, 390);
    await form.getByRole('button', { name: 'Save appearance', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await form.getByRole('button', { name: 'Save appearance', exact: true }).isVisible(), true);
    await app.page.setViewportSize({ width: 390, height: 2000 });
    await form.screenshot({ path: path.join(screenshots, 'appearance-mobile-dark.png') });
    await app.page.setViewportSize({ width: 390, height: 1000 });
    await app.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await form.getByRole('group', { name: 'Theme mode', exact: true }).locator('button[aria-pressed="true"]').filter({ hasText: /^Dark$/ }).waitFor();
    assert.equal(await form.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true');
    await navigation.getByRole('link', { name: 'Account & security', exact: true }).click();
    await app.page.getByRole('form', { name: 'Sign-in email', exact: true }).waitFor();
    assert.equal(await form.count(), 0);
    await app.page.goBack();
    await form.waitFor();
    await app.page.goForward();
    await app.page.getByRole('form', { name: 'Sign-in email', exact: true }).waitFor();
    assert.equal(app.requests.some((endpoint) => endpoint === '/patients/me' || endpoint === '/documents/my'), false);
    assert.equal(app.writes.length, 1, 'Navigation never submits account or appearance changes');
    await app.page.goto(origin + '/my/profile', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await app.page.getByRole('heading', { name: 'Profile details', exact: true }).waitFor();
    assert.equal(await app.page.getByRole('navigation', { name: 'Settings sections' }).count(), 0);
    await app.context.close();
    for (const role of ['admin', 'nurse']) {
      const staff = await fixture(role);
      await staff.page.goto(origin + staff.base + '?tab=appearance', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await staff.page.getByRole('form', { name: 'Appearance', exact: true }).waitFor();
      await checkFit(staff.page, 390);
      await staff.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Account & security', exact: true }).click();
      await staff.page.getByRole('heading', { name: 'Step-up access', exact: true }).waitFor();
      await staff.context.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', origin, checks: ['separate settings navigation', 'desktop and mobile layouts', 'accessible selected options', 'live display preview', 'safe preference-only save', 'reload and back/forward', 'patient and staff settings'], data: 'isolated API fixtures; no real account writes', screenshots }));
  } finally { await browser.close(); if (server) await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
