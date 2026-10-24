// Local or deployed frontend, but every API call is mocked and all writes are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const { preview } = await import('vite');
  const output = path.join(os.tmpdir(), 'mwos-maternal-care-verification');
  await fs.mkdir(output, { recursive: true });
  const deployedOrigin = process.env.MWOS_VERIFY_ORIGIN;
  if (deployedOrigin && deployedOrigin !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized deployed verification target');
  const server = deployedOrigin ? null : await preview({ root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  const origin = deployedOrigin || 'http://127.0.0.1:4181';
  const browser = await chromium.launch({ headless: true, ...(process.env.MWOS_CHROME_BINARY ? { executablePath: process.env.MWOS_CHROME_BINARY } : {}) });
  const errors = [];
  const writes = [];

  async function fixture({ empty = false, auxiliaryFailure = false, reportsFailure = false } = {}) {
    const user = { id: 'test-user', role: 'patient', firstName: 'Maria', lastName: 'Test', email: 'test@example.invalid', careType: 'maternal' };
    const reading = { id: 'test-visit', visit_date: '2026-10-22', bp_systolic: 118, bp_diastolic: 76, weight_kg: '62.5', fetal_heart_rate: null, fetal_movement: null };
    const dashboard = empty ? {} : {
      nextAppointment: { scheduled_date: '2026-10-25', scheduled_time: '13:30:00', appointment_type: 'prenatal', status: 'scheduled' },
      activePregnancy: { edd: '2027-02-01', risk_level: 'low' }, latestVitals: reading,
      unreadMessages: 2, openCareTasks: 1, documentSummary: { total: 2, pending: 1, verified: 1 },
    };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, serviceWorkers: 'block' });
    await context.addInitScript(({ account, appOrigin }) => {
      if (location.origin !== appOrigin) return;
      localStorage.setItem('user', JSON.stringify(account));
      localStorage.setItem('accessToken', 'test-only-not-a-real-session');
    }, { account: user, appOrigin: origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, HEAD, OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.method() + ' ' + url.pathname); return route.abort(); }
      if (!url.pathname.includes('/api/')) return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
      if (request.method() !== 'GET') { writes.push(request.method() + ' ' + url.pathname); return route.abort(); }
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      const reply = (data, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, ...(status >= 400 ? { message: 'Test-only unavailable data' } : {}) }) });
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/reports/patient-dashboard') return reply(dashboard, reportsFailure ? 500 : 200);
      if (endpoint === '/patients/me') return reply({ id: 'test-patient', first_name: 'Maria', last_name: 'Test', care_type: 'maternal' });
      if (endpoint === '/vitals/patient/test-patient') return reply(empty ? [] : [reading, { id: 'older-visit', visit_date: '2026-10-20', bp_systolic: null, bp_diastolic: null }]);
      if (endpoint === '/interactions/tasks') return reply(empty ? [] : [{ id: 'follow-up', title: 'Bring your previous laboratory results', status: 'open', due_date: '2026-10-24' }, { id: 'closed', title: 'Cancelled task must stay hidden', status: 'cancelled' }], auxiliaryFailure ? 500 : 200);
      if (endpoint === '/requirements/my') return reply(empty ? [] : [{ id: 'test-requirement', requirementName: 'Previous laboratory results', serviceName: 'Prenatal visit', isRequired: true, submission: null }], auxiliaryFailure ? 500 : 200);
      if (endpoint === '/interactions/directory') return reply({ staff: [] });
      if (endpoint === '/ai/recommendations') return reply({ suggestions: [] });
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page };
  }

  const fits = async (page) => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must fit the viewport');
    assert.ok(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth), 'Content must not overflow inside the app shell');
  };

  try {
    const app = await fixture();
    await app.page.goto(origin + '/my/dashboard');
    const overview = app.page.getByRole('region', { name: 'Clinic care overview' });
    await overview.getByText('Bring your previous laboratory results', { exact: true }).waitFor();
    assert.equal(await overview.getByText('Cancelled task must stay hidden').count(), 0);
    assert.match(await overview.innerText(), /1:30 PM/);
    const readings = app.page.getByRole('region', { name: 'Last clinic measurements' });
    assert.equal(await readings.getByText('Not recorded', { exact: true }).count(), 2);
    assert.equal(await readings.getByText('118/76', { exact: true }).count(), 1);
    assert.equal(await app.page.getByText(/maternal monitor|live watch|moving vitals|maternal wave/i).count(), 0);
    await fits(app.page);
    await overview.screenshot({ path: path.join(output, 'maternal-care-desktop.png'), animations: 'disabled' });
    await readings.screenshot({ path: path.join(output, 'recorded-measurements.png'), animations: 'disabled' });
    await app.page.setViewportSize({ width: 390, height: 844 });
    await fits(app.page);
    await app.page.locator('main').evaluate((element) => { element.scrollTop = 0; });
    await app.page.screenshot({ path: path.join(output, 'maternal-care-mobile.png'), animations: 'disabled' });
    await app.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await app.page.evaluate(() => document.documentElement.classList.add('dark'));
    await app.page.screenshot({ path: path.join(output, 'maternal-care-dark.png'), animations: 'disabled' });
    await overview.getByRole('link', { name: 'Review requirements', exact: true }).click();
    await app.page.getByText('Previous laboratory results', { exact: true }).waitFor();
    await fits(app.page);
    await app.page.goto(origin + '/my/vitals');
    await app.page.getByRole('heading', { name: 'My clinic readings', exact: true }).waitFor();
    assert.equal(await app.page.getByRole('region', { name: 'Recorded visit history' }).getByText('Recorded BP classification: Not classified', { exact: true }).count(), 2);
    await fits(app.page);
    await app.page.goto(origin + '/my/reports');
    await app.page.getByRole('heading', { name: 'Recorded blood pressure history', exact: true }).waitFor();
    await app.page.locator('.recharts-wrapper').waitFor();
    await fits(app.page);
    await app.context.close();

    const empty = await fixture({ empty: true });
    await empty.page.goto(origin + '/my/dashboard');
    await empty.page.getByText('No visit scheduled', { exact: true }).waitFor();
    assert.equal(await empty.page.getByRole('region', { name: 'Last clinic measurements' }).getByText('Not recorded', { exact: true }).count(), 4);
    assert.equal(await empty.page.getByText('Active', { exact: true }).count(), 0);
    assert.equal(await empty.page.getByText(/Routine live|low risk watch/i).count(), 0);
    await empty.context.close();

    const failed = await fixture({ auxiliaryFailure: true });
    await failed.page.goto(origin + '/my/dashboard');
    await failed.page.getByText(/Requirements could not be loaded/).waitFor();
    await failed.page.getByText(/Follow-ups could not be loaded/).waitFor();
    assert.equal(await failed.page.getByText(/No open follow-up tasks/).count(), 0);
    await failed.context.close();

    const reports = await fixture({ reportsFailure: true });
    await reports.page.goto(origin + '/my/reports');
    await reports.page.getByRole('alert').filter({ hasText: 'Reports could not be loaded' }).waitFor();
    await reports.context.close();
    assert.deepEqual(writes, [], 'Verification must never write patient records');
    assert.deepEqual(errors, [], 'No unhandled browser errors');
    console.log(JSON.stringify({ result: 'passed', origin, data: 'isolated test fixtures; no real patient API access', checks: ['populated care planner', 'missing readings', 'no telemetry', '390px layout', 'dark/reduced motion', 'requirements navigation', 'saved BP report', 'empty record', 'partial API failure', 'report error state', 'no patient writes'], screenshots: output }));
  } finally {
    await browser.close();
    if (server) await server.httpServer.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
