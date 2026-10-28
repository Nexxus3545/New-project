// Synthetic browser fixture only: every API/external request is intercepted.
// Chromium fake devices ensure that no physical camera or microphone is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4198, strictPort: true } });
  const origin = 'http://127.0.0.1:4198';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errors = [];
  const clinicianId = '22222222-2222-4222-8222-222222222222';
  const patientUser = '11111111-1111-4111-8111-111111111111';
  const patientId = '55555555-5555-4555-8555-555555555555';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const threadId = '44444444-4444-4444-8444-444444444444';
  const meet = 'https://meet.google.com/abc-defg-hij';

  async function fixture({ role = 'admin', status = 'requested', meetingUrl = '', failPatch = false } = {}) {
    const user = { id: role === 'patient' ? patientUser : role === 'doctor' ? clinicianId : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firstName: 'Synthetic', lastName: role === 'patient' ? 'Patient' : 'Staff', role, email: 'test@example.invalid', careType: 'maternal', patientId: role === 'patient' ? patientId : undefined };
    const state = { session: { id: sessionId, thread_id: threadId, clinician_id: clinicianId, patient_id: patientId, status, meeting_provider: 'external', meeting_url: meetingUrl, meeting_code: meetingUrl ? 'abc-defg-hij' : null, start_at: status === 'scheduled' ? '2026-10-29T02:00:00.000Z' : null, end_at: null, reason: 'Test-only follow-up', updated_at: '2026-10-28T01:00:00Z' }, requests: [], external: [], sequence: 0 };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', permissions: ['camera', 'microphone'] });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-no-real-token');
      window.__deviceFixture = { calls: 0, stopped: 0 };
      document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a');
        if (link?.href === 'https://meet.google.com/abc-defg-hij') window.__deviceFixture.stoppedAtJoinDispatch = window.__deviceFixture.stopped;
      });
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.__deviceFixture.calls++;
        const stream = await capture(constraints);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => { window.__deviceFixture.stopped++; stop(); };
        }
        return stream;
      };
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const call = { endpoint, method: request.method(), body: request.method() === 'PATCH' ? request.postDataJSON() : undefined };
        state.requests.push(call);
        const reply = (data, code = 200, message) => route.fulfill({ status: code, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: code < 400, data, message }) });
        if (request.method() === 'PATCH' && endpoint === `/interactions/teleconsults/${sessionId}`) {
          if (failPatch) return reply(null, 403, 'Additional verification required by this test fixture.');
          const body = call.body;
          state.session = { ...state.session, status: body.status, meeting_url: ['completed', 'cancelled'].includes(body.status) ? '' : body.meetingUrl || state.session.meeting_url, meeting_code: ['completed', 'cancelled'].includes(body.status) ? null : 'abc-defg-hij', start_at: body.status === 'active' ? '2026-10-28T10:00:00.000Z' : body.startAt || state.session.start_at, end_at: body.status === 'completed' ? '2026-10-28T10:30:00.000Z' : null, updated_at: new Date(Date.UTC(2026, 9, 28, 1, ++state.sequence)).toISOString() };
          return reply(state.session);
        }
        if (request.method() !== 'GET') { errors.push('Unexpected write blocked: ' + request.method() + ' ' + endpoint); return route.abort(); }
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/interactions/directory') return reply({ staff: [{ id: clinicianId, first_name: 'Demo', last_name: 'Clinician', role: 'doctor' }], patients: [{ id: patientId, user_id: patientUser, first_name: 'Demo', last_name: 'Patient' }] });
        if (endpoint === '/interactions/threads') return reply([{ id: threadId, title: 'Demo video consultation', patient_id: patientId, patient_name: 'Demo Patient', teleconsult_status: state.session.status, thread_type: 'tele_consult', latest_message: 'Test-only follow-up' }]);
        if (endpoint === `/interactions/threads/${threadId}`) return reply({ id: threadId, title: 'Demo video consultation', patient_id: patientId, patient_name: 'Demo Patient', thread_type: 'tele_consult', teleconsult_session: state.session, messages: [] });
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      if (url.origin === origin || url.protocol === 'data:') return route.continue();
      state.external.push({ url: url.toString(), type: request.resourceType() });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'patient' ? '/my/telehealth' : '/telehealth'));
    await page.getByRole('heading', { name: 'Camera & microphone check', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Live video consultation', exact: true }).waitFor();
    return { context, page, state };
  }
  const join = (page) => page.getByRole('link', { name: 'Join Google Meet ↗', exact: true });
  const patches = (app) => app.state.requests.filter((call) => call.method === 'PATCH');

  try {
    const app = await fixture();
    const { page } = app;
    assert.equal(await page.evaluate(() => window.__deviceFixture.calls), 0, 'No devices start on page load');
    assert.equal(await join(page).count(), 0, 'Requested sessions cannot join');
    await page.getByRole('heading', { name: 'Clinic meeting controls', exact: true }).waitFor();
    await page.getByLabel('Google Meet room link', { exact: true }).fill(meet + '?authuser=0#ignored');
    await page.getByLabel('Confirmed date and time', { exact: true }).fill('2026-10-29T10:00');
    await page.getByRole('button', { name: 'Confirm consultation', exact: true }).click();
    await join(page).waitFor();
    assert.equal(patches(app).length, 1);
    const payload = patches(app)[0].body;
    assert.equal(patches(app)[0].endpoint, `/interactions/teleconsults/${sessionId}`);
    assert.equal(payload.status, 'scheduled'); assert.equal(payload.meetingUrl, meet);
    assert.ok(/^2026-10-29T\d{2}:00:00\.000Z$/.test(payload.startAt), 'Schedule is sent as full UTC timestamp');
    assert.equal(await join(page).getAttribute('href'), meet);
    assert.equal(await page.locator('iframe').count(), 0, 'No hidden conferencing iframe');

    await page.getByRole('button', { name: 'Check camera & microphone', exact: true }).click();
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__deviceFixture.calls), 1);
    await page.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await page.getByRole('button', { name: 'Unmute microphone', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).click();
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).click();

    const popupReady = app.context.waitForEvent('page');
    await join(page).click();
    const popup = await popupReady;
    assert.ok(await page.evaluate(() => window.__deviceFixture.stoppedAtJoinDispatch >= 2), 'Preview tracks stop during the join click before provider navigation');
    await page.waitForFunction(() => window.__deviceFixture.stopped >= 2);
    await page.getByRole('button', { name: 'Check camera & microphone', exact: true }).waitFor();
    await popup.close();
    assert.equal(app.state.external.some((request) => request.type === 'script'), false, 'No external conferencing SDK is loaded');

    await page.getByRole('button', { name: 'Mark consultation in progress', exact: true }).click();
    await page.getByRole('button', { name: 'Complete consultation', exact: true }).waitFor();
    assert.equal(patches(app).at(-1).body.status, 'active');
    assert.equal(await join(page).getAttribute('href'), meet);
    await page.getByRole('button', { name: 'Complete consultation', exact: true }).click();
    await page.getByText('This consultation is closed.', { exact: true }).waitFor();
    assert.equal(patches(app).at(-1).body.status, 'completed');
    assert.equal(await join(page).count(), 0);
    await app.context.close();

    const patient = await fixture({ role: 'patient', status: 'scheduled', meetingUrl: meet });
    await join(patient.page).waitFor();
    assert.equal(await patient.page.getByRole('heading', { name: 'Clinic meeting controls', exact: true }).count(), 0);
    assert.equal(await patient.page.getByLabel('Google Meet room link', { exact: true }).count(), 0);
    assert.equal(patches(patient).length, 0);
    await patient.context.close();

    for (const input of [{ status: 'requested', meetingUrl: meet }, { status: 'scheduled', meetingUrl: 'https://meet.google.com.evil.test/abc-defg-hij' }, { status: 'active', meetingUrl: 'javascript:alert(1)' }]) {
      const blocked = await fixture({ role: 'patient', ...input });
      assert.equal(await join(blocked.page).count(), 0, 'Unsafe or unconfirmed rooms cannot join');
      assert.equal(await blocked.page.locator('iframe').count(), 0);
      await blocked.context.close();
    }

    const failure = await fixture({ failPatch: true });
    await failure.page.getByLabel('Google Meet room link', { exact: true }).fill(meet);
    await failure.page.getByLabel('Confirmed date and time', { exact: true }).fill('2026-10-29T10:00');
    await failure.page.getByRole('button', { name: 'Confirm consultation', exact: true }).click();
    await failure.page.getByText('Additional verification required by this test fixture.', { exact: true }).waitFor();
    assert.equal(failure.state.session.status, 'requested'); assert.equal(await join(failure.page).count(), 0);
    await failure.context.close();

    const responsive = await fixture({ status: 'scheduled', meetingUrl: meet });
    for (const width of [320, 1440]) {
      await responsive.page.setViewportSize({ width, height: 1080 });
      assert.ok(await responsive.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`);
      await join(responsive.page).waitFor();
    }
    await responsive.page.getByRole('button', { name: 'Check camera & microphone', exact: true }).click();
    await responsive.page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor();
    await responsive.page.screenshot({ path: path.resolve(root, '../telehealth-video-preview.png'), fullPage: true });
    await responsive.page.getByRole('button', { name: 'Stop devices', exact: true }).click();
    await responsive.page.waitForFunction(() => window.__deviceFixture.stopped >= 2);
    await responsive.context.close();
    assert.deepEqual(errors, []);
    console.log('Telehealth video checks passed: explicit fake-device preview, camera/mic controls, stop on join, room confirmation, safe links, lifecycle, patient restrictions, failures, and 320-1440px layouts.');
    console.log('Synthetic screenshot: ' + path.resolve(root, '../telehealth-video-preview.png'));
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) if (page.url().startsWith(origin)) {
      console.error('Synthetic device diagnostics:', await page.evaluate(() => window.__deviceFixture).catch(() => null));
      console.error('Device section:', await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Camera & microphone check', exact: true }) }).innerText().catch(() => 'unavailable'));
    }
    for (const context of browser.contexts()) for (const page of context.pages()) if (page.url().startsWith(origin)) await page.screenshot({ path: path.resolve(root, '../telehealth-video-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); await new Promise((resolve) => server.httpServer.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
