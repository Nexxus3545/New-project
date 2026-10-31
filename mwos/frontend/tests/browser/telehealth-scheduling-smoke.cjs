// Synthetic API fixtures: no real accounts, patients, video services, or devices.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const origin = 'http://127.0.0.1:4200';
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4200, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  const ids = { clinician: '22222222-2222-4222-8222-222222222222', patient: '55555555-5555-4555-8555-555555555555', patientUser: '11111111-1111-4111-8111-111111111111', session: '33333333-3333-4333-8333-333333333333', thread: '44444444-4444-4444-8444-444444444444' };
  const future = new Date(Date.now() + 7 * 86400000);
  const localDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  const preferred = `${localDate}T10:00`;
  const alternative = `${localDate}T11:00`;

  async function fixture({ role = 'admin', empty = false, reviewFailure = false, coordinator = false } = {}) {
    const user = { id: role === 'patient' ? ids.patientUser : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firstName: 'Synthetic', lastName: role === 'patient' ? 'Patient' : 'Admin', role, email: 'test@example.invalid', careType: 'maternal', patientId: role === 'patient' ? ids.patient : undefined };
    const record = { id: ids.session, thread_id: ids.thread, patient_id: ids.patient, patient_name: 'Demo Patient', clinician_id: ids.clinician, clinician_name: 'Demo Clinician', reason: 'Synthetic follow-up concern', status: 'requested', preferred_start_at: new Date(preferred).toISOString(), start_at: null, duration_minutes: 45, created_at: new Date().toISOString() };
    const state = { record, requests: [], available: false, conflictAtAccept: false, empty, reviewFailure, patientCreated: false, blockedExternal: [], devices: 0 };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'synthetic-no-real-token');
      window.__mediaRequests = 0;
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__mediaRequests++; throw new Error('Physical devices are forbidden in this scheduling fixture'); };
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const body = ['POST', 'PATCH'].includes(req.method()) ? req.postDataJSON() : undefined;
        state.requests.push({ endpoint, method: req.method(), body, search: url.search });
        const reply = (data, status = 200, message) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, message }) });
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/interactions/directory') {
          const staff = coordinator ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', first_name: 'Synthetic', last_name: 'Admin', role: 'admin', provider_kind: 'coordination', provider_label: 'Admin · Clinic coordinator' }]
            : [{ id: ids.clinician, first_name: 'Demo', last_name: 'Clinician', role: 'doctor' }];
          return reply({ staff, teleconsultProviders: staff, patients: [{ id: ids.patient, user_id: ids.patientUser, first_name: 'Demo', last_name: 'Patient' }] });
        }
        if (endpoint === '/interactions/teleconsults/review') {
          assert.equal(role, 'admin', 'Only the admin requests the review queue');
          return state.reviewFailure ? reply(null, 503, 'Synthetic review outage') : reply(state.empty ? [] : [state.record]);
        }
        if (endpoint.endsWith('/availability')) {
          const startAt = url.searchParams.get('startAt'), durationMinutes = Number(url.searchParams.get('durationMinutes'));
          return reply({ available: state.available, startAt, durationMinutes, conflicts: state.available ? [] : [{ kind: 'appointment', startAt, endAt: new Date(Date.parse(startAt) + 30 * 60000).toISOString() }] });
        }
        if (req.method() === 'POST' && endpoint.endsWith('/accept')) {
          if (state.conflictAtAccept) return reply(null, 409, 'Synthetic scheduling race');
          state.record = { ...state.record, status: 'scheduled', start_at: body.startAt, duration_minutes: body.durationMinutes };
          return reply(state.record);
        }
        if (req.method() === 'POST' && endpoint === '/interactions/teleconsults') {
          assert.ok(role === 'patient' || coordinator);
          state.patientCreated = true;
          state.record = { ...state.record, clinician_id: body.clinicianId, preferred_start_at: body.preferredStartAt, duration_minutes: body.durationMinutes };
          return reply({ thread: { id: ids.thread }, session: state.record }, 201);
        }
        const threads = state.patientCreated ? [{ id: ids.thread, title: 'Synthetic consultation', patient_id: ids.patient, patient_name: 'Demo Patient', teleconsult_status: state.record.status, thread_type: 'tele_consult', latest_message: state.record.reason }] : [];
        if (endpoint === '/interactions/threads') return reply(threads);
        if (endpoint === `/interactions/threads/${ids.thread}`) return reply({ ...threads[0], teleconsult_session: state.record, messages: [] });
        if (endpoint === '/interactions/teleconsults/video/status') return reply({ provider: 'daily', configured: true });
        if (req.method() !== 'GET') { errors.push(`Unexpected write blocked: ${req.method()} ${endpoint}`); return route.abort(); }
        return reply([]);
      }
      if (url.origin === origin || ['data:', 'about:'].includes(url.protocol)) return route.continue();
      state.blockedExternal.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'patient' ? '/my/telehealth' : '/telehealth'));
    await page.getByRole('heading', { name: 'Telehealth', exact: true }).waitFor();
    if (role === 'admin') await page.getByRole('heading', { name: 'Review consultation requests', exact: true }).waitFor();
    return { context, page, state };
  }
  const accept = (page) => page.getByRole('button', { name: 'Accept consultation', exact: true });
  const check = (page) => page.getByRole('button', { name: 'Check availability', exact: true });
  const acceptedWrites = (state) => state.requests.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/accept'));
  async function layout(page, width) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`);
  }

  try {
    const app = await fixture();
    const { page, state } = app;
    await page.getByLabel('Choose confirmed date and time', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Confirmed duration', { exact: true }).inputValue(), '45');
    assert.equal(await accept(page).isDisabled(), true, 'Admin must check availability first');
    assert.equal(await page.getByRole('heading', { name: 'No consultation selected', exact: true }).count(), 1, 'Review queue works without private thread membership');
    await check(page).click();
    await page.getByText('This time overlaps an existing booking. Choose another time.', { exact: true }).waitFor();
    assert.equal(await accept(page).isDisabled(), true, 'Busy time cannot be accepted');
    assert.equal(acceptedWrites(state).length, 0);
    await page.getByLabel('Choose confirmed date and time', { exact: true }).fill(alternative);
    state.available = true;
    await check(page).click();
    await page.getByText('This time is available. Availability will be checked again when you accept.', { exact: true }).waitFor();
    assert.equal(await accept(page).isEnabled(), true);
    await page.getByLabel('Confirmed duration', { exact: true }).selectOption('30');
    assert.equal(await accept(page).isDisabled(), true, 'Changing duration invalidates the previous check');
    await check(page).click();
    await page.getByText('This time is available. Availability will be checked again when you accept.', { exact: true }).waitFor();
    for (const width of [320, 390, 1440]) {
      await layout(page, width);
      await page.screenshot({ path: path.resolve(root, width === 1440 ? '../telehealth-scheduling-desktop.png' : '../telehealth-scheduling-phone.png'), fullPage: true });
    }
    await accept(page).click();
    await page.getByText('Consultation accepted. The patient and care team can use the confirmed schedule in MWOS.', { exact: true }).waitFor();
    assert.equal(acceptedWrites(state).length, 1);
    assert.equal(acceptedWrites(state)[0].body.durationMinutes, 30);
    assert.equal(Date.parse(acceptedWrites(state)[0].body.startAt), Date.parse(alternative + '+08:00'));
    assert.equal(state.record.status, 'scheduled');
    assert.equal(await page.getByText('Confirmed schedule', { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.__mediaRequests), 0);
    await app.context.close();

    const raced = await fixture();
    raced.state.available = true;
    raced.state.conflictAtAccept = true;
    await check(raced.page).click();
    await raced.page.getByText('This time is available. Availability will be checked again when you accept.', { exact: true }).waitFor();
    await accept(raced.page).click();
    await raced.page.getByText('This request or time slot is no longer available. Refresh the requests and check another time.', { exact: true }).waitFor();
    assert.equal(raced.state.record.status, 'requested', 'Race conflict cannot show acceptance');
    assert.equal(await accept(raced.page).isDisabled(), true);
    const beforeRefresh = raced.state.requests.filter((call) => call.endpoint.endsWith('/review')).length;
    await raced.page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await raced.page.waitForFunction(() => !document.querySelector('button')?.disabled);
    assert.ok(raced.state.requests.filter((call) => call.endpoint.endsWith('/review')).length > beforeRefresh);
    await raced.context.close();

    const patient = await fixture({ role: 'patient' });
    assert.equal(await patient.page.getByRole('heading', { name: 'Review consultation requests', exact: true }).count(), 0);
    await patient.page.getByRole('button', { name: 'Request consultation', exact: true }).first().click();
    await patient.page.getByLabel('Provider or clinic coordinator', { exact: true }).selectOption(ids.clinician);
    await patient.page.getByLabel('Preferred date and time (optional)', { exact: true }).fill(preferred);
    await patient.page.getByLabel('Consultation duration', { exact: true }).selectOption('60');
    await patient.page.getByLabel('Reason for consultation', { exact: true }).fill('Synthetic patient request');
    await layout(patient.page, 320);
    await patient.page.getByRole('button', { name: 'Submit request', exact: true }).click();
    await patient.page.getByRole('heading', { name: 'Live video consultation', exact: true }).waitFor();
    const create = patient.state.requests.find((call) => call.method === 'POST' && call.endpoint === '/interactions/teleconsults');
    assert.equal(create.body.durationMinutes, 60);
    assert.equal(Date.parse(create.body.preferredStartAt), Date.parse(preferred + '+08:00'));
    assert.equal(Object.hasOwn(create.body, 'sessionStatus'), false, 'Patient cannot self-approve');
    assert.equal(Object.hasOwn(create.body, 'startAt'), false, 'Preference is not a confirmed start');
    assert.equal(patient.state.record.status, 'requested');
    assert.equal(await patient.page.getByRole('button', { name: 'Join video consultation', exact: true }).isDisabled(), true);
    assert.equal(patient.state.requests.some((call) => call.endpoint.endsWith('/review')), false);
    await patient.context.close();

    for (const role of ['admin', 'patient']) {
      const fallback = await fixture({ role, coordinator: true, empty: true });
      await fallback.page.getByRole('button', { name: 'Request consultation', exact: true }).first().click();
      const provider = fallback.page.getByLabel('Provider or clinic coordinator', { exact: true });
      await fallback.page.waitForFunction(() => document.querySelector('#telehealth-request-clinician')?.value === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      assert.equal(await provider.locator('option:checked').textContent(), 'Synthetic Admin · Admin · Clinic coordinator');
      await fallback.page.getByText(/No verified clinical provider is available yet/).waitFor();
      if (role === 'admin') await fallback.page.getByLabel('Patient', { exact: true }).selectOption(ids.patient);
      await fallback.page.getByLabel('Reason for consultation', { exact: true }).fill('Synthetic coordinator assistance');
      await layout(fallback.page, 390);
      await fallback.page.screenshot({ path: path.join(process.env.TEMP, `mwos-coordinator-${role}.png`), fullPage: true });
      await fallback.page.getByRole('button', { name: 'Submit request', exact: true }).click();
      await fallback.page.getByRole('heading', { name: 'Live video consultation', exact: true }).waitFor();
      const created = fallback.state.requests.find(call => call.method === 'POST' && call.endpoint === '/interactions/teleconsults');
      assert.equal(created.body.clinicianId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      assert.equal(Object.hasOwn(created.body, 'sessionStatus'), false);
      assert.equal(role === 'admin' ? created.body.patientId : Object.hasOwn(created.body, 'patientId'), role === 'admin' ? ids.patient : false);
      await fallback.page.getByText('Admin · Clinic coordinator', { exact: true }).waitFor();
      await fallback.context.close();
    }

    const empty = await fixture({ empty: true });
    await empty.page.getByText('No consultation requests to review.', { exact: true }).waitFor();
    await empty.context.close();
    const failed = await fixture({ reviewFailure: true });
    await failed.page.getByText('Consultation requests could not refresh. Please try again.', { exact: true }).waitFor();
    assert.equal(await failed.page.getByText('No consultation requests to review.', { exact: true }).count(), 0, 'An outage is not presented as an empty queue');
    await failed.context.close();
    assert.deepEqual(errors, []);
    console.log('Telehealth scheduling browser checks passed: independent admin queue, preferred schedule and duration, busy/available checks, changed-selection invalidation, acceptance, race rejection, refresh, patient restrictions, empty/error states, devices off, and 320–1440px layouts.');
    console.log('Synthetic screenshots: ' + path.resolve(root, '../telehealth-scheduling-desktop.png') + ' and ' + path.resolve(root, '../telehealth-scheduling-phone.png'));
  } catch (error) {
    console.error('Browser page errors:', errors);
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.resolve(root, '../telehealth-scheduling-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); await new Promise((resolve) => server.httpServer.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
