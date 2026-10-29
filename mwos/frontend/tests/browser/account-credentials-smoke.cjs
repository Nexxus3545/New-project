// Synthetic accounts and documents only. Every API and external request is
// intercepted; this check never uploads a real ID or contacts clinic accounts.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1kAAAAASUVORK5CYII=', 'base64');
const syntheticFile = { name: 'synthetic-identity.png', mimeType: 'image/png', buffer: png };
const ids = { admin: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', patient: '11111111-1111-4111-8111-111111111111', doctor: '22222222-2222-4222-8222-222222222222', nurse: '33333333-3333-4333-8333-333333333333', midwife: '44444444-4444-4444-8444-444444444444' };
const roles = ['admin', 'patient', 'doctor', 'nurse', 'midwife'];
const title = (role) => role[0].toUpperCase() + role.slice(1);
const requirement = (role) => role === 'patient' ? 'patient_id' : ['doctor', 'nurse', 'midwife'].includes(role) ? 'professional_license' : 'none';
const scanFor = (revision) => ({ status: 'completed', revision, scannedAt: new Date().toISOString(), analysis: { version: 1, outcome: 'ready_for_review', authenticity: 'not_verified', source: 'local_ocr', confidence: 90, pagesScanned: 1, checks: [{ code: 'ocr_readability', result: 'pass', label: 'Readable text' }, { code: 'issuer_authentication', result: 'unknown', label: 'Manual issuer authentication' }], summary: 'Automated checks only.' } });

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const origin = 'http://127.0.0.1:4202';
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4202, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];

  async function fixture({ role = 'admin', initialCredentials = {}, failUsers = false, failCredentials = false } = {}) {
    const user = { id: ids[role], role, firstName: 'Synthetic', lastName: title(role), email: `${role}@example.invalid`, isActive: true, careType: 'general', patientGender: 'female', uiPreferences: {}, staffProfile: role === 'patient' ? null : { isVerified: false, licenseStatus: 'pending' } };
    const state = { requests: [], credentials: { ...initialCredentials }, failUsers, failCredentials, external: [], pages: 0 };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Manila', serviceWorkers: 'block', acceptDownloads: true });
    context.on('page', () => { state.pages++; });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'synthetic-account-test-token');
      localStorage.setItem('stepUpToken', 'synthetic-step-up-token');
      window.__credentialUrls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { const url = create(blob); window.__credentialUrls.created.push(url); return url; };
      URL.revokeObjectURL = (url) => { window.__credentialUrls.revoked.push(url); return revoke(url); };
    }, { user, origin });
    const userRows = () => roles.map((value) => ({ id: ids[value], role: value, first_name: 'Synthetic', last_name: title(value), email: `${value}@example.invalid`, is_active: true, activity_status: 'offline', credential_status: state.credentials[ids[value]]?.status || null, credential_expires_at: state.credentials[ids[value]]?.expiresAt || null }));
    const receipt = (userId) => ({ requirement: requirement(roles.find((value) => ids[value] === userId)), credential: state.credentials[userId] || null });
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const body = ['POST', 'PATCH', 'PUT'].includes(request.method()) ? request.postDataJSON() : undefined;
        state.requests.push({ endpoint, method: request.method(), body, authorization: request.headers().authorization, stepUp: request.headers()['x-step-up-token'] });
        const reply = (data, status = 200, message) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, message }) });
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/users') {
          if (state.failUsers) return reply(null, 503, 'Synthetic users outage');
          return reply(userRows().filter((row) => (!url.searchParams.get('role') || row.role === url.searchParams.get('role')) && (!url.searchParams.get('search') || `${row.first_name} ${row.last_name} ${row.email}`.toLowerCase().includes(url.searchParams.get('search').toLowerCase()))));
        }
        if (/^\/credentials\/(?:mine|users\/[^/]+)(?:\/(?:document|review))?$/.test(endpoint)) {
          const userId = endpoint.startsWith('/credentials/mine') ? user.id : endpoint.split('/')[3];
          const accountRole = roles.find((value) => ids[value] === userId);
          assert.ok(accountRole, 'Credential request targets a known synthetic account');
          if (endpoint.endsWith('/document')) {
            assert.equal(request.method(), 'GET');
            return route.fulfill({ status: 200, headers: { ...cors, 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="synthetic-identity.png"', 'x-content-type-options': 'nosniff' }, contentType: 'image/png', body: png });
          }
          if (request.method() === 'GET') return state.failCredentials ? reply(null, 503, 'Synthetic credentials outage') : reply(receipt(userId));
          if (request.method() === 'POST') {
            state.credentials[userId] = { userId, kind: requirement(accountRole), documentType: body.documentType, documentLabel: body.documentLabel || null, licenseNumber: body.licenseNumber || null, idLast4: body.idLast4 || null, expiresAt: body.expiresAt || null, status: 'pending', revision: (state.credentials[userId]?.revision || 0) + 1, hasDocument: true, fileName: body.file.name, mimeType: body.file.mimeType, submittedAt: new Date().toISOString(), reviewedAt: null, reviewNotes: null };
            state.credentials[userId].scan = scanFor(state.credentials[userId].revision);
            return reply(receipt(userId), 201);
          }
          if (request.method() === 'PATCH' && endpoint.endsWith('/review')) {
            assert.equal(role, 'admin');
            const current = state.credentials[userId];
            if (body.revision !== current.revision) return reply(null, 409, 'Synthetic stale review');
            assert.ok(body.reviewNotes.trim());
            if (body.status === 'verified') { assert.equal(body.officialCheckConfirmed, true); assert.ok(['issuer_check', 'in_person_original'].includes(body.verificationMethod)); }
            state.credentials[userId] = { ...current, status: body.status, reviewedAt: new Date().toISOString(), reviewNotes: body.reviewNotes };
            return reply(receipt(userId));
          }
        }
        if (request.method() !== 'GET') { errors.push(`Unexpected write blocked: ${request.method()} ${endpoint}`); return route.abort(); }
        if (endpoint === '/account/security') return reply({ emailAvailable: false });
        if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false, deliveryVerified: false });
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      if (url.origin === origin || ['data:', 'about:', 'blob:'].includes(url.protocol)) return route.continue();
      state.external.push({ origin: url.origin, type: request.resourceType() });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'admin' ? '/users' : role === 'patient' ? '/my/settings' : '/settings'));
    await page.getByRole('heading', { name: role === 'admin' ? 'Users & credentials' : role === 'patient' ? 'Patient identity verification' : 'Professional license verification', exact: true }).waitFor();
    return { context, page, state, user };
  }

  const writes = (state, method) => state.requests.filter((call) => call.method === method && call.endpoint.startsWith('/credentials/'));
  const consent = (page) => page.getByRole('checkbox', { name: /I confirm (?:this is my document|the account holder)/ });
  const submit = (page) => page.getByRole('button', { name: 'Submit for review', exact: true });
  const verify = (page) => page.getByRole('button', { name: 'Verify credential', exact: true });
  const replace = (page) => page.getByRole('button', { name: 'Request replacement', exact: true });
  const reviewPanel = (page) => page.locator('#user-credential-review');
  async function layout(page, width) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`);
  }
  async function privateState(page) {
    assert.equal(await page.evaluate((base64) => [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) => value.includes(base64)), png.toString('base64')), false, 'ID file bytes are not stored in browser storage');
    assert.equal(await page.locator('a[href*="/uploads/"]').count(), 0, 'Credential documents have no public upload links');
  }

  try {
    const app = await fixture();
    const { page, state } = app;
    const groups = page.getByRole('group', { name: 'User groups', exact: true });
    await page.getByRole('heading', { name: 'Synthetic Patient', exact: true }).waitFor();
    assert.equal(await page.locator('article').count(), 5);
    await groups.getByRole('button', { name: 'Patients', exact: true }).click();
    assert.equal(await page.locator('article').count(), 1);
    assert.equal(await page.locator('article').getByRole('heading', { name: 'Patient identity', exact: true }).count(), 1);
    assert.equal(await page.locator('article').getByRole('heading', { name: 'Professional license', exact: true }).count(), 0);
    await groups.getByRole('button', { name: 'Clinical staff', exact: true }).click();
    assert.equal(await page.locator('article').count(), 3);
    assert.equal(await page.locator('article').getByRole('heading', { name: 'Professional license', exact: true }).count(), 3);
    await page.getByLabel('Role', { exact: true }).selectOption('nurse');
    await page.getByRole('heading', { name: 'Synthetic Nurse', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
    await groups.getByRole('button', { name: 'Administrators', exact: true }).click();
    await page.getByRole('heading', { name: 'Synthetic Admin', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
    assert.equal(await page.locator('article').getByRole('button', { name: 'Review credentials', exact: true }).count(), 0);
    assert.equal(await page.locator('article').getByText('Administrator account. Professional license verification does not apply.', { exact: true }).count(), 1);

    await groups.getByRole('button', { name: 'Patients', exact: true }).click();
    await page.getByRole('heading', { name: 'Synthetic Patient', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Review credentials', exact: true }).click();
    await page.getByRole('heading', { name: 'Patient identity verification', exact: true }).waitFor();
    await page.getByLabel('Government-issued ID type', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Professional license number', { exact: true }).count(), 0);
    assert.equal(await page.getByLabel('One government ID file', { exact: true }).getAttribute('multiple'), null, 'Only one current ID is collected');
    assert.equal(await submit(page).isDisabled(), true);
    await page.getByLabel('Government-issued ID type', { exact: true }).selectOption('national_id');
    await page.getByLabel('One government ID file', { exact: true }).setInputFiles(syntheticFile);
    assert.equal(await submit(page).isDisabled(), true, 'Consent is required');
    await consent(page).check();
    await submit(page).click();
    await page.getByText('Document submitted for clinic review. It is not verified yet.', { exact: true }).waitFor();
    assert.equal(writes(state, 'POST').length, 1);
    assert.equal(writes(state, 'POST')[0].body.documentType, 'national_id');
    assert.equal(writes(state, 'POST')[0].body.consent, true);
    assert.equal(writes(state, 'POST')[0].body.file.dataBase64, png.toString('base64'));
    assert.equal(Object.hasOwn(writes(state, 'POST')[0].body, 'licenseNumber'), false);
    assert.equal(Object.hasOwn(writes(state, 'POST')[0].body, 'governmentIdNumber'), false);
    assert.equal(state.credentials[ids.patient].status, 'pending');
    assert.equal(await verify(page).isDisabled(), true, 'Review note is required before verification');
    assert.equal(await replace(page).isDisabled(), true, 'Rejection also needs a review note');
    await page.getByLabel('Review note', { exact: true }).fill('Synthetic review: replace this test-only document.');
    await replace(page).click();
    await page.getByText('Replacement requested. The account holder can submit a new document.', { exact: true }).waitFor();
    assert.equal(writes(state, 'PATCH')[0].body.revision, 1);
    assert.equal(writes(state, 'PATCH')[0].body.status, 'rejected');

    await page.getByRole('button', { name: 'Submit replacement', exact: true }).click();
    await page.getByLabel('Government-issued ID type', { exact: true }).selectOption('philhealth_id');
    await page.getByLabel('One government ID file', { exact: true }).setInputFiles(syntheticFile);
    await consent(page).check();
    await submit(page).click();
    await page.getByText('Document submitted for clinic review. It is not verified yet.', { exact: true }).waitFor();
    assert.equal(state.credentials[ids.patient].revision, 2, 'Replacement advances the reviewed revision');
    assert.equal(await verify(page).isDisabled(), true);
    await page.getByLabel('Review note', { exact: true }).fill('Synthetic manual review completed; no real identity checked.');
    await page.getByLabel('How was the ID confirmed?', { exact: true }).selectOption('in_person_original');
    await page.getByRole('checkbox', { name: 'I completed the selected identity check and matched the ID to this account.', exact: true }).check();
    for (const width of [320, 390, 1440]) await layout(page, width);
    await reviewPanel(page).screenshot({ path: path.resolve(root, '../credentials-desktop.png') });
    await page.setViewportSize({ width: 390, height: 1100 });
    await verify(page).scrollIntoViewIfNeeded();
    const phoneButton = await verify(page).boundingBox();
    assert.ok(phoneButton && phoneButton.x >= 0 && phoneButton.x + phoneButton.width <= 391 && phoneButton.y >= 0 && phoneButton.y + phoneButton.height <= 1101, 'Phone review controls remain reachable inside the app scroller');
    await page.screenshot({ path: path.resolve(root, '../credentials-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await verify(page).click();
    await page.getByText('Credential verified by the clinic.', { exact: true }).waitFor();
    assert.equal(writes(state, 'PATCH')[1].body.revision, 2);
    assert.equal(writes(state, 'PATCH')[1].body.status, 'verified');
    assert.equal(await verify(page).count(), 0, 'Already reviewed evidence has no repeated approval button');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download ID for review', exact: true }).click();
    const downloaded = await downloadEvent;
    assert.equal(downloaded.suggestedFilename(), syntheticFile.name);
    assert.ok(state.requests.some((call) => call.endpoint === `/credentials/users/${ids.patient}/document` && call.authorization === 'Bearer synthetic-account-test-token'));
    await page.waitForFunction(() => window.__credentialUrls.created.length > 0 && window.__credentialUrls.created.every((url) => window.__credentialUrls.revoked.includes(url)));
    assert.equal(state.pages, 1, 'Private review download does not open an external page');
    await privateState(page);
    await page.goto(origin + '/settings');
    await page.getByRole('heading', { name: 'Settings', level: 1, exact: true }).first().waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Professional license verification', exact: true }).count(), 0, 'Administrator account has no self-approval or professional license requirement');
    assert.equal(await verify(page).count(), 0);
    assert.equal(state.requests.some((call) => call.endpoint === '/credentials/mine'), false, 'Administrator own settings do not request a clinical credential');
    await app.context.close();

    const own = await fixture({ role: 'nurse' });
    await own.page.getByLabel('Professional license number', { exact: true }).waitFor();
    assert.equal(await own.page.getByLabel('Professional license number', { exact: true }).getAttribute('required'), '');
    assert.equal(await own.page.getByLabel('License expiry date', { exact: true }).getAttribute('required'), '');
    assert.equal(await own.page.getByRole('button', { name: 'Verify credential', exact: true }).count(), 0, 'Clinical staff cannot approve their own license');
    await own.page.getByLabel('One PRC / professional ID file', { exact: true }).setInputFiles(syntheticFile);
    await consent(own.page).check();
    await submit(own.page).click();
    assert.equal(writes(own.state, 'POST').length, 0, 'Missing license number and expiry prevent submission');
    await own.page.getByLabel('Professional license number', { exact: true }).fill('SYNTHETIC-PRC-12345');
    await submit(own.page).click();
    assert.equal(writes(own.state, 'POST').length, 0, 'Missing expiry still prevents submission');
    await own.page.getByLabel('License expiry date', { exact: true }).fill('2035-10-29');
    await submit(own.page).click();
    await own.page.getByText('Document submitted for clinic review. It is not verified yet.', { exact: true }).waitFor();
    assert.equal(writes(own.state, 'POST')[0].endpoint, '/credentials/mine');
    assert.equal(writes(own.state, 'POST')[0].body.licenseNumber, 'SYNTHETIC-PRC-12345');
    assert.equal(writes(own.state, 'POST')[0].body.expiresAt, '2035-10-29');
    assert.equal(await own.page.getByRole('button', { name: 'Verify credential', exact: true }).count(), 0);
    for (const width of [320, 390, 1440]) await layout(own.page, width);
    await privateState(own.page);
    await own.context.close();

    const patient = await fixture({ role: 'patient' });
    await patient.page.getByLabel('Government-issued ID type', { exact: true }).waitFor();
    assert.equal(await patient.page.getByLabel('Professional license number', { exact: true }).count(), 0);
    assert.equal(await patient.page.getByRole('button', { name: 'Verify credential', exact: true }).count(), 0);
    await patient.page.getByLabel('Government-issued ID type', { exact: true }).selectOption('other_government_id');
    await patient.page.getByLabel('Government ID name', { exact: true }).fill('Synthetic government ID');
    await patient.page.getByLabel('One government ID file', { exact: true }).setInputFiles(syntheticFile);
    await consent(patient.page).check();
    await submit(patient.page).click();
    await patient.page.getByText('Document submitted for clinic review. It is not verified yet.', { exact: true }).waitFor();
    assert.equal(writes(patient.state, 'POST')[0].endpoint, '/credentials/mine');
    assert.equal(writes(patient.state, 'POST')[0].body.documentLabel, 'Synthetic government ID');
    await patient.context.close();

    const failed = await fixture({ failCredentials: true });
    await failed.page.getByRole('group', { name: 'User groups' }).getByRole('button', { name: 'Patients', exact: true }).click();
    await failed.page.getByRole('button', { name: 'Review credentials', exact: true }).click();
    await failed.page.getByText('Credentials could not be loaded. Please try again.', { exact: true }).waitFor();
    assert.equal(await submit(failed.page).count(), 0, 'A failed lookup cannot look like an empty credential record');
    failed.state.failCredentials = false;
    await failed.page.getByRole('button', { name: 'Retry credentials', exact: true }).click();
    await failed.page.getByLabel('Government-issued ID type', { exact: true }).waitFor();
    await failed.context.close();

    const unavailable = await fixture({ failUsers: true });
    await unavailable.page.getByText('Users could not be loaded. Refresh to try again.', { exact: true }).waitFor();
    assert.equal(await unavailable.page.getByText('No users match this group and the current filters.', { exact: true }).count(), 0);
    await unavailable.context.close();
    assert.deepEqual(errors, []);
    console.log('Account credential browser checks passed: grouped users, separate patient/professional requirements, single private document with consent, revision-based review/rejection, authenticated downloads, staff self-submission, errors, no self-approval, and 320–1440px layouts.');
    console.log('Synthetic screenshots: ' + path.resolve(root, '../credentials-desktop.png') + ' and ' + path.resolve(root, '../credentials-phone.png'));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
