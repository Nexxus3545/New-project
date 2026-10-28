// Test-only synthetic APIs and Daily module. Product code imports the real SDK.
// Chromium fake devices ensure no physical camera or microphone is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const fakeSdk = `
const f = window.__dailyFixture;
export default { createFrame(parent, options) {
  f.created++;
  const iframe = document.createElement('iframe');
  iframe.srcdoc = '<!doctype html><html><body style="background:#111827;color:white;font:16px sans-serif;padding:20px">Synthetic consultation. No real devices or provider connection.</body></html>';
  Object.assign(iframe.style, options.iframeStyle);
  parent.appendChild(iframe);
  const handlers = new Map();
  const frame = {
    on(event, handler) { handlers.set(event, handler); },
    off(event, handler) { if (handlers.get(event) === handler) handlers.delete(event); },
    iframe() { return iframe; },
    join(options) { f.joins.push(options); return Promise.resolve(); },
    destroy() { f.destroyed++; handlers.clear(); iframe.remove(); return Promise.resolve(); },
    emit(event, data) { handlers.get(event)?.(data); },
  };
  f.frames.push(frame);
  return frame;
} };
`;

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const chunks = fs.readdirSync(path.join(root, 'dist/assets')).filter((name) => /daily.*\.js$/i.test(name));
  assert.ok(chunks.length, 'Build the inline Daily implementation before running this check');
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4198, strictPort: true } });
  const origin = 'http://127.0.0.1:4198';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errors = [];
  const clinicianId = '22222222-2222-4222-8222-222222222222';
  const patientUser = '11111111-1111-4111-8111-111111111111';
  const patientId = '55555555-5555-4555-8555-555555555555';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const threadId = '44444444-4444-4444-8444-444444444444';
  const secondThreadId = '66666666-6666-4666-8666-666666666666';
  const secondSessionId = '77777777-7777-4777-8777-777777777777';
  const privateToken = 'test-only-private-daily-token';
  const roomUrl = 'https://synthetic-clinic.daily.co/mwos-0123456789abcdef0123456789abcdef';

  async function fixture({ role = 'admin', status = 'requested', failPatch = false, joinFailure = false, unsafeRoom = false, delayedSdk = false } = {}) {
    const user = { id: role === 'patient' ? patientUser : role === 'doctor' ? clinicianId : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firstName: 'Synthetic', lastName: role === 'patient' ? 'Patient' : 'Staff', role, email: 'test@example.invalid', careType: 'maternal', patientId: role === 'patient' ? patientId : undefined };
    const session = (id, thread, value) => ({ id, thread_id: thread, clinician_id: clinicianId, patient_id: patientId, status: value, meeting_provider: 'daily', meeting_url: '', meeting_code: null, start_at: value === 'scheduled' ? '2026-10-29T02:00:00.000Z' : null, end_at: null, reason: 'Test-only follow-up', updated_at: '2026-10-28T01:00:00Z' });
    const state = { sessions: { [threadId]: session(sessionId, threadId, status), [secondThreadId]: session(secondSessionId, secondThreadId, 'scheduled') }, requests: [], external: [], sequence: 0, sdkRequests: 0, stoppedAtJoin: null, pages: 0, failDetail: false, detailFailures: 0 };
    let releaseSdk;
    const sdkReady = delayedSdk ? new Promise((resolve) => { releaseSdk = resolve; }) : Promise.resolve();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', permissions: ['camera', 'microphone'] });
    context.on('page', () => { state.pages++; });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-no-real-token');
      window.__dailyFixture = { created: 0, destroyed: 0, joins: [], frames: [], emit(event, payload) { this.frames.at(-1)?.emit(event, payload); } };
      window.__deviceFixture = { calls: 0, stopped: 0, constraints: [], tracks: [] };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.__deviceFixture.calls++;
        window.__deviceFixture.constraints.push(constraints);
        const stream = await capture(constraints);
        window.__deviceFixture.tracks = stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState }));
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => { window.__deviceFixture.stopped++; stop(); };
        }
        return stream;
      };
    }, { user, origin });
    let page;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const call = { endpoint, method: request.method(), body: ['POST', 'PATCH'].includes(request.method()) ? request.postDataJSON() : undefined };
        state.requests.push(call);
        const reply = (data, code = 200, message) => route.fulfill({ status: code, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: code < 400, data, message }) });
        if (request.method() === 'POST' && /\/video\/join$/.test(endpoint)) {
          state.stoppedAtJoin = await page.evaluate(() => window.__deviceFixture.stopped);
          if (joinFailure) return reply(null, 503, 'SENSITIVE provider diagnostic which must not appear in the video UI');
          return reply({ provider: 'daily', roomUrl: unsafeRoom ? 'https://attacker.example/private-room' : roomUrl, token: privateToken, expiresAt: new Date(Date.now() + 600_000).toISOString(), roomExpiresAt: new Date(Date.now() + 7_200_000).toISOString() });
        }
        if (request.method() === 'PATCH' && endpoint === `/interactions/teleconsults/${sessionId}`) {
          if (failPatch) return reply(null, 403, 'Additional verification required by this test fixture.');
          const body = call.body;
          state.sessions[threadId] = { ...state.sessions[threadId], status: body.status, start_at: body.startAt || state.sessions[threadId].start_at, end_at: body.status === 'completed' ? '2026-10-28T10:30:00.000Z' : null, updated_at: new Date(Date.UTC(2026, 9, 28, 1, ++state.sequence)).toISOString() };
          return reply(state.sessions[threadId]);
        }
        if (request.method() !== 'GET') { errors.push('Unexpected write blocked: ' + request.method() + ' ' + endpoint); return route.abort(); }
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/interactions/directory') return reply({ staff: [{ id: clinicianId, first_name: 'Demo', last_name: 'Clinician', role: 'doctor' }], patients: [{ id: patientId, user_id: patientUser, first_name: 'Demo', last_name: 'Patient' }] });
        if (endpoint === '/interactions/threads') return reply(Object.entries(state.sessions).map(([id, value]) => ({ id, title: id === threadId ? 'Demo video consultation' : 'Second video consultation', patient_id: patientId, patient_name: 'Demo Patient', teleconsult_status: value.status, thread_type: 'tele_consult', latest_message: 'Test-only follow-up' })));
        const selected = endpoint.startsWith('/interactions/threads/') ? state.sessions[endpoint.split('/').at(-1)] : null;
        if (selected && state.failDetail) {
          state.detailFailures++;
          return reply(null, 503, 'Synthetic background detail polling failure');
        }
        if (selected) return reply({ id: selected.thread_id, title: selected.thread_id === threadId ? 'Demo video consultation' : 'Second video consultation', patient_id: patientId, patient_name: 'Demo Patient', thread_type: 'tele_consult', teleconsult_session: selected, messages: [] });
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      if (url.origin === origin && chunks.includes(path.basename(url.pathname))) {
        state.sdkRequests++;
        await sdkReady;
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeSdk });
      }
      if (url.origin === origin || ['data:', 'about:'].includes(url.protocol)) return route.continue();
      state.external.push({ url: url.toString(), type: request.resourceType() });
      return route.abort();
    });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'patient' ? '/my/telehealth' : '/telehealth'));
    await page.getByRole('heading', { name: 'Camera & microphone check', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Live video consultation', exact: true }).waitFor();
    return { context, page, state, releaseSdk };
  }

  const join = (page) => page.getByRole('button', { name: 'Join video consultation', exact: true });
  const patches = (app) => app.state.requests.filter((call) => call.method === 'PATCH');
  const admissions = (app) => app.state.requests.filter((call) => /\/video\/join$/.test(call.endpoint));
  const emit = (page, event) => page.evaluate((name) => window.__dailyFixture.emit(name), event);
  const frame = (page) => page.locator('iframe[title="MWOS private video consultation"]');
  const checkPrivate = async (page) => {
    assert.ok(!page.url().includes(privateToken), 'No admission token in page URL');
    assert.ok(!await page.evaluate((token) => [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) => value.includes(token)), privateToken), 'Admission token is never stored');
    assert.ok(!await page.locator('a').evaluateAll((links, token) => links.some((link) => link.href.includes(token)), privateToken), 'No admission token in links');
    assert.ok(!await page.locator('iframe').evaluateAll((frames, token) => frames.some((value) => value.src.includes(token)), privateToken), 'No admission token in iframe URL');
  };

  try {
    const app = await fixture({ role: 'doctor' });
    const { page } = app;
    assert.equal(await page.evaluate(() => window.__deviceFixture.calls), 0, 'Devices stay off on load');
    assert.equal(await join(page).isDisabled(), true, 'Requested sessions cannot join');
    assert.equal(admissions(app).length, 0);
    assert.equal(app.state.sdkRequests, 0, 'SDK loads only after explicit join');
    await page.getByRole('heading', { name: 'Clinic meeting controls', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Google Meet room link', { exact: true }).count(), 0);
    assert.equal(await page.locator('a[href*="meet.google.com"]').count(), 0);
    await page.getByLabel('Confirmed date and time', { exact: true }).fill('2026-10-29T10:00');
    await page.getByRole('button', { name: 'Confirm consultation', exact: true }).click();
    await page.getByRole('button', { name: 'Mark consultation in progress', exact: true }).waitFor();
    assert.equal(patches(app).length, 1);
    const payload = patches(app)[0].body;
    assert.equal(payload.status, 'scheduled');
    assert.ok(!Object.hasOwn(payload, 'meetingUrl'), 'Scheduling needs no external room link');
    assert.ok(/^2026-10-29T\d{2}:00:00\.000Z$/.test(payload.startAt));
    assert.equal(await page.locator('iframe').count(), 0);
    await page.getByRole('button', { name: 'Check camera & microphone', exact: true }).click();
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor();
    await join(page).click();
    await frame(page).waitFor();
    assert.equal(admissions(app).length, 1);
    assert.ok(app.state.stoppedAtJoin >= 2, 'Local preview stops before admission request');
    assert.equal(app.state.pages, 1, 'Call never opens a second tab');
    assert.equal(await page.getByRole('heading', { name: 'Camera & microphone check', exact: true }).count(), 0, 'Local preview is unavailable while provider owns devices');
    assert.equal(await page.getByText('In call', { exact: true }).count(), 0, 'SDK join resolution alone is not attendance');
    await emit(page, 'joining-meeting');
    await page.getByText('Connecting to the consultation…', { exact: true }).waitFor();
    await emit(page, 'joined-meeting');
    await page.getByText('In call', { exact: true }).waitFor();
    await checkPrivate(page);
    const originalIframe = await frame(page).elementHandle();
    app.state.failDetail = true;
    // Allow the real background poll and its bounded retries to fail. Existing
    // consultation data must keep the local provider session mounted.
    await page.getByRole('alert').filter({ hasText: 'Consultation updates could not refresh. Your video call can continue;' }).waitFor({ timeout: 35000 });
    assert.ok(app.state.detailFailures > 0, 'A real detail refetch was rejected by the fixture');
    assert.equal(await originalIframe.evaluate((element) => element.isConnected), true, 'Background poll error preserves the original iframe DOM node');
    assert.equal(await page.evaluate(() => window.__dailyFixture.destroyed), 0, 'Background poll error does not destroy the call');
    assert.equal(await page.evaluate(() => window.__dailyFixture.created), 1);
    assert.equal(await frame(page).count(), 1);
    await page.getByText('In call', { exact: true }).waitFor();
    app.state.failDetail = false;
    await page.getByRole('button', { name: 'Mark consultation in progress', exact: true }).click();
    await page.getByRole('button', { name: 'Complete consultation', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__dailyFixture.destroyed), 0, 'Status update preserves call');
    assert.equal(await page.evaluate(() => window.__dailyFixture.created), 1);
    await page.getByText('In call', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Leave call', exact: true }).click();
    await page.getByRole('heading', { name: 'Camera & microphone check', exact: true }).waitFor();
    assert.equal(await frame(page).count(), 0);
    assert.equal(await page.evaluate(() => window.__dailyFixture.destroyed), 1);
    assert.equal(patches(app).at(-1).body.status, 'active', 'Leaving does not complete consultation');
    await page.getByRole('button', { name: 'Rejoin video consultation', exact: true }).click();
    await frame(page).waitFor();
    await emit(page, 'joined-meeting');
    await page.getByRole('button', { name: 'Complete consultation', exact: true }).click();
    await page.getByText('This consultation is closed.', { exact: true }).waitFor();
    await page.waitForFunction(() => window.__dailyFixture.destroyed === 2);
    assert.equal(await frame(page).count(), 0);
    await app.context.close();

    const patient = await fixture({ role: 'patient', status: 'scheduled' });
    assert.equal(await patient.page.getByRole('heading', { name: 'Clinic meeting controls', exact: true }).count(), 0);
    await join(patient.page).click();
    await frame(patient.page).waitFor();
    await emit(patient.page, 'joined-meeting');
    await patient.page.getByText('In call', { exact: true }).waitFor();
    await patient.page.getByRole('button').filter({ hasText: 'Second video consultation' }).click();
    await patient.page.waitForFunction(() => window.__dailyFixture.destroyed === 1);
    await join(patient.page).waitFor();
    assert.equal(await frame(patient.page).count(), 0, 'Session switch releases previous room');
    assert.equal(patches(patient).length, 0);
    await patient.context.close();

    for (const options of [{ joinFailure: true }, { unsafeRoom: true }]) {
      const blocked = await fixture({ role: 'patient', status: 'scheduled', ...options });
      await join(blocked.page).click();
      await blocked.page.getByRole('button', { name: 'Try joining again', exact: true }).waitFor();
      assert.equal(await frame(blocked.page).count(), 0);
      assert.equal(blocked.state.sdkRequests, 0, 'Failed or untrusted access never loads Daily');
      assert.equal(await blocked.page.getByText(/SENSITIVE provider diagnostic/).count(), 0);
      await checkPrivate(blocked.page);
      await blocked.context.close();
    }

    const cancelled = await fixture({ role: 'patient', status: 'scheduled', delayedSdk: true });
    const importing = cancelled.page.waitForRequest((request) => chunks.includes(path.basename(new URL(request.url()).pathname)));
    await join(cancelled.page).click();
    await importing;
    await cancelled.page.getByRole('button', { name: 'Cancel joining', exact: true }).click();
    cancelled.releaseSdk();
    await cancelled.page.getByRole('button', { name: 'Rejoin video consultation', exact: true }).waitFor();
    await cancelled.page.waitForTimeout(200);
    assert.equal(await cancelled.page.evaluate(() => window.__dailyFixture.created), 0, 'Late SDK load cannot create cancelled call');
    await cancelled.context.close();

    const failure = await fixture({ role: 'doctor', failPatch: true });
    await failure.page.getByLabel('Confirmed date and time', { exact: true }).fill('2026-10-29T10:00');
    await failure.page.getByRole('button', { name: 'Confirm consultation', exact: true }).click();
    await failure.page.getByText('Additional verification required by this test fixture.', { exact: true }).waitFor();
    assert.equal(failure.state.sessions[threadId].status, 'requested');
    assert.equal(await join(failure.page).isDisabled(), true);
    await failure.context.close();

    const responsive = await fixture({ role: 'patient', status: 'active' });
    await responsive.page.setViewportSize({ width: 320, height: 800 });
    await join(responsive.page).click();
    await frame(responsive.page).waitFor();
    await emit(responsive.page, 'joined-meeting');
    for (const width of [320, 390, 1440]) {
      await responsive.page.setViewportSize({ width, height: 1080 });
      assert.ok(await responsive.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow at ' + width + 'px');
      const bounds = await frame(responsive.page).boundingBox();
      assert.ok(bounds.height >= 420, 'Call remains usable on phone');
      assert.ok(bounds.width > 0 && bounds.width <= width, 'Iframe fits viewport');
      if (width === 320) {
        const title = await responsive.page.getByRole('heading', { name: 'Video consultation', exact: true }).boundingBox();
        const leave = await responsive.page.getByRole('button', { name: 'Leave call', exact: true }).boundingBox();
        assert.ok(leave.y >= title.y + title.height, 'Phone call controls do not overlap the title');
        await responsive.page.screenshot({ path: path.resolve(root, '../telehealth-video-inline-phone.png'), fullPage: true });
      }
    }
    await responsive.page.screenshot({ path: path.resolve(root, '../telehealth-video-inline.png'), fullPage: true });
    await responsive.page.evaluate(() => window.__dailyFixture.emit('error', { errorMsg: 'SENSITIVE room/token diagnostic' }));
    await responsive.page.getByRole('button', { name: 'Try joining again', exact: true }).waitFor();
    assert.equal(await frame(responsive.page).count(), 0);
    assert.equal(await responsive.page.getByText(/SENSITIVE room/).count(), 0);
    await responsive.context.close();
    assert.deepEqual(errors, []);
    console.log('Telehealth inline video checks passed: explicit admission, preview release, joined-event status, no popup, background poll failure resilience, local leave, administrative closure, session switching, failed/unsafe access, late SDK cancellation, patient restrictions, private tokens, and 320-1440px layouts.');
    console.log('Synthetic screenshot: ' + path.resolve(root, '../telehealth-video-inline.png'));
  } catch (error) {
    console.error('Browser page errors:', errors);
    for (const context of browser.contexts()) for (const page of context.pages()) if (page.url().startsWith(origin)) {
      console.error('Synthetic diagnostics:', await page.evaluate(() => ({ devices: window.__deviceFixture, created: window.__dailyFixture?.created, destroyed: window.__dailyFixture?.destroyed })).catch(() => null));
      await page.screenshot({ path: path.resolve(root, '../telehealth-video-failure.png'), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); await new Promise((resolve) => server.httpServer.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
