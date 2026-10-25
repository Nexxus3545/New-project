// All API calls, including submissions, are intercepted. No real accounts or appointments are created.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const deployed = process.env.MWOS_VERIFY_ORIGIN;
  if (deployed && deployed !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized target');
  const { preview } = await import('vite');
  const server = deployed ? null : await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4183, strictPort: true } });
  const origin = deployed || 'http://127.0.0.1:4183';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const errors = [];
  const output = path.join(os.tmpdir(), 'mwos-general-care-verification');
  await fs.mkdir(output, { recursive: true });
  async function fixture({ signedIn = true, google = false } = {}) {
    let patient = { id: 'test-patient', first_name: 'Juan', last_name: 'Test', date_of_birth: '1995-01-01', gender: 'male', care_type: 'general', pregnancies: [] };
    let user = { id: 'test-user', firstName: 'Juan', lastName: 'Test', email: 'test@example.invalid', role: 'patient', patientId: google ? null : patient.id, patientGender: 'male', careType: 'general' };
    const writes = [];
    const appointments = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    if (signedIn) await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-not-a-real-token');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      if (!url.pathname.includes('/api/')) return url.origin === origin ? route.continue() : route.abort();
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      const reply = (data, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (['POST', 'PATCH'].includes(request.method())) {
        const body = request.postDataJSON();
        writes.push({ endpoint, body });
        if (endpoint === '/appointments' && request.method() === 'POST') {
          const saved = { id: `test-appointment-${appointments.length + 1}`, appointment_type: body.appointmentType, scheduled_date: body.scheduledDate, scheduled_time: body.scheduledTime, status: 'scheduled' };
          appointments.push(saved);
          return reply(saved, 201);
        }
        if (endpoint === '/patients/me' && request.method() === 'PATCH') {
          patient = { ...patient, gender: body.gender, care_type: body.careType };
          user = { ...user, patientGender: body.gender, careType: body.careType };
          return reply(patient);
        }
        if (endpoint === '/auth/register') {
          user = { ...user, patientGender: body.gender, careType: body.careType };
          return reply({ user, accessToken: 'test-token', refreshToken: 'test-refresh' });
        }
        if (endpoint === '/auth/oauth/exchange') return reply({ user, accessToken: 'test-token', refreshToken: 'test-refresh' });
        if (endpoint === '/auth/oauth/complete-profile') {
          user = { ...user, patientId: patient.id, patientGender: body.gender, careType: body.careType };
          return reply(user);
        }
        throw new Error(`Unexpected write intercepted: ${endpoint}`);
      }
      if (request.method() !== 'GET') return route.abort();
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/auth/providers') return reply({ google: false });
      if (endpoint === '/patients/me') return reply(patient);
      if (endpoint === '/appointments') return reply(appointments);
      if (endpoint === '/reports/patient-dashboard') return reply({ patientProfile: { gender: patient.gender, careType: patient.care_type }, activePregnancy: null, latestVitals: { pulse_rate: 72, temperature: 36.5 }, documentSummary: {} });
      if (endpoint === '/interactions/directory') return reply({ staff: [] });
      if (endpoint === '/ai/recommendations') return reply({ suggestions: [] });
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, context, writes };
  }
  try {
    const app = await fixture();
    await app.page.goto(origin + '/my/dashboard');
    await app.page.getByText('General clinic care', { exact: true }).waitFor();
    const nav = app.page.getByRole('navigation', { name: 'Patient modules' });
    assert.equal(await nav.getByRole('link', { name: 'My Pregnancy', exact: true }).count(), 0);
    assert.equal(await nav.getByRole('link', { name: 'Baby / Newborn', exact: true }).count(), 0);
    const readings = app.page.getByRole('region', { name: 'Last clinic measurements' });
    await readings.getByText('Pulse rate', { exact: true }).waitFor();
    assert.doesNotMatch(await readings.innerText(), /fetal/i);
    await app.page.goto(origin + '/my/appointments');
    await app.page.getByLabel('Appointment type', { exact: true }).waitFor();
    assert.equal(await app.page.getByLabel('Appointment type', { exact: true }).inputValue(), 'consultation');
    await app.page.getByLabel('Preferred date', { exact: true }).fill('2026-12-01');
    await app.page.getByLabel('Preferred time', { exact: true }).fill('09:00');
    await app.page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
    await app.page.getByRole('heading', { name: 'Your appointment request was saved' }).waitFor();
    assert.equal(app.writes[0].body.pregnancyId, null);
    assert.equal(app.writes[0].body.appointmentType, 'consultation');
    assert.equal(await app.page.getByRole('button', { name: 'Send appointment request', exact: true }).count(), 0);
    await app.page.getByRole('button', { name: 'Request another visit', exact: true }).click();
    await app.page.getByLabel('Visit category').selectOption('maternal');
    assert.equal(await app.page.getByLabel('Appointment type', { exact: true }).inputValue(), 'prenatal');
    await app.page.getByLabel('Preferred date', { exact: true }).fill('2026-12-02');
    await app.page.getByLabel('Preferred time', { exact: true }).fill('10:00');
    await app.page.getByRole('button', { name: 'Send appointment request', exact: true }).click();
    await app.page.getByRole('heading', { name: 'Your appointment request was saved' }).waitFor();
    assert.equal(app.writes[1].body.pregnancyId, null, 'First prenatal visits do not fabricate a pregnancy record');
    await app.page.goto(origin + '/my/profile');
    await app.page.getByLabel('Gender', { exact: true }).waitFor();
    await app.page.waitForFunction(() => document.querySelector('select[name="gender"]')?.value === 'male');
    assert.equal(await app.page.getByText('Pregnancy booklet number', { exact: true }).count(), 0);
    await app.page.getByLabel('Care type', { exact: true }).selectOption('maternal');
    await app.page.getByRole('button', { name: 'Save patient record', exact: true }).click();
    await app.page.getByText('Patient details and care type saved. Existing clinical records are unchanged.', { exact: true }).waitFor();
    await nav.getByRole('link', { name: 'My Pregnancy', exact: true }).waitFor();
    await app.page.getByLabel('Care type', { exact: true }).selectOption('general');
    await app.page.getByRole('button', { name: 'Save patient record', exact: true }).click();
    await nav.getByRole('link', { name: 'Clinic Readings', exact: true }).waitFor();
    await app.page.setViewportSize({ width: 390, height: 844 });
    await app.page.getByLabel('Gender', { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await app.page.screenshot({ path: path.join(output, 'general-profile-mobile.png') });
    await app.context.close();

    const registration = await fixture({ signedIn: false });
    await registration.page.goto(origin + '/register');
    await registration.page.locator('input[name="firstName"]').fill('Juan');
    await registration.page.locator('input[name="lastName"]').fill('Test');
    await registration.page.locator('input[name="dateOfBirth"]').fill('1995-01-01');
    await registration.page.getByLabel('Gender', { exact: false }).selectOption('male');
    assert.equal(await registration.page.getByLabel('Care type', { exact: true }).inputValue(), 'general');
    await registration.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await registration.page.locator('input[name="email"]').fill('test@example.invalid');
    await registration.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await registration.page.locator('input[name="password"]').fill('test-only-password');
    await registration.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await registration.page.getByRole('button', { name: 'Create account', exact: true }).click();
    await registration.page.waitForURL('**/my/dashboard');
    assert.equal(registration.writes.find((write) => write.endpoint === '/auth/register').body.gender, 'male');
    await registration.context.close();

    const google = await fixture({ signedIn: false, google: true });
    await google.page.goto(origin + '/oauth-callback?code=test-only-code');
    await google.page.getByRole('heading', { name: 'Complete your record' }).waitFor();
    await google.page.getByLabel('Gender', { exact: false }).selectOption('male');
    await google.page.locator('input[type="date"]').fill('1995-01-01');
    await google.page.getByRole('button', { name: 'Open my care portal', exact: true }).click();
    await google.page.waitForURL('**/my/dashboard');
    const completion = google.writes.find((write) => write.endpoint === '/auth/oauth/complete-profile').body;
    assert.equal(completion.gender, 'male');
    assert.equal(completion.careType, 'general');
    await google.context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', origin, checks: ['general male dashboard', 'neutral saved readings', 'general and first prenatal booking', 'submission receipt', 'existing profile saves', 'navigation updates', '390px layout', 'email registration', 'Google profile completion'], data: 'all API reads and writes mocked; no real records accessed', screenshots: output }));
  } finally { await browser.close(); if (server) await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
