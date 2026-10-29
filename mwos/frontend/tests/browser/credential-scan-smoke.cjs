// Synthetic accounts and scan results only. No ID leaves the test browser.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const patientId = '11111111-1111-4111-8111-111111111111';
const secretText = 'RAW-OCR-PRIVATE-ID-123456789';
const scanFor = (revision, mode = 'ready') => ({ status: mode === 'unreadable' ? 'unreadable' : mode === 'processing' ? 'processing' : mode === 'not_scanned' ? 'not_scanned' : 'completed', revision: mode === 'not_scanned' ? null : revision, scannedAt: mode === 'processing' || mode === 'not_scanned' ? null : new Date().toISOString(), analysis: ['processing', 'not_scanned'].includes(mode) ? null : {
  version: 1, outcome: mode === 'flagged' ? 'needs_attention' : mode === 'unreadable' ? 'manual_review' : 'ready_for_review', authenticity: 'not_verified', source: 'local_ocr', confidence: mode === 'unreadable' ? null : 88, pagesScanned: 1,
  checks: [{ code: 'ocr_readability', result: mode === 'unreadable' ? 'unknown' : 'pass', label: secretText }, { code: 'account_name', result: mode === 'flagged' ? 'flag' : mode === 'unreadable' ? 'unknown' : 'pass', label: secretText }, { code: 'issuer_authentication', result: 'unknown', label: secretText }], summary: secretText, text: secretText,
} });

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const origin = 'http://127.0.0.1:4207';
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4207, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  async function fixture({ role = 'admin', mode = 'not_scanned', failScan = false } = {}) {
    const user = { id: role === 'admin' ? adminId : patientId, firstName: 'Synthetic', lastName: role === 'admin' ? 'Admin' : 'Patient', role, email: role + '@example.invalid', careType: 'general', patientGender: 'female', isActive: true };
    const record = { userId: patientId, kind: 'patient_id', status: 'pending', revision: 1, hasDocument: true, documentType: 'national_id', documentLabel: 'National ID', fileName: 'synthetic-id.png', mimeType: 'image/png', submittedAt: new Date().toISOString(), scan: scanFor(1, mode) };
    const state = { credential: record, requests: [], nextMode: 'flagged', failScan, external: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Manila', serviceWorkers: 'block' });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('accessToken', 'synthetic-private-test-token'); localStorage.setItem('stepUpToken', 'synthetic-step-up');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const body = ['POST', 'PATCH'].includes(request.method()) ? request.postDataJSON() : undefined;
        state.requests.push({ method: request.method(), endpoint, body });
        const reply = (data, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data }) });
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/users') return reply([{ id: patientId, first_name: 'Synthetic', last_name: 'Patient', email: 'patient@example.invalid', role: 'patient', is_active: true, credential_status: 'pending' }]);
        if (endpoint.startsWith('/credentials/')) {
          if (request.method() === 'GET') return reply({ requirement: 'patient_id', credential: state.credential });
          if (request.method() === 'POST' && endpoint.endsWith('/scan')) {
            assert.equal(body.revision, state.credential.revision);
            assert.deepEqual(Object.keys(body), ['revision'], 'Rescan sends no client OCR text or identity data');
            if (state.failScan) return reply(null, 503);
            state.credential = { ...state.credential, scan: scanFor(state.credential.revision, state.nextMode) };
            return reply({ requirement: 'patient_id', credential: state.credential });
          }
          if (request.method() === 'PATCH' && endpoint.endsWith('/review')) {
            assert.equal(role, 'admin'); assert.equal(body.revision, state.credential.revision);
            if (body.status === 'verified') { assert.equal(body.officialCheckConfirmed, true); assert.ok(['issuer_check', 'in_person_original'].includes(body.verificationMethod)); }
            state.credential = { ...state.credential, status: body.status, reviewNotes: body.reviewNotes };
            return reply({ requirement: 'patient_id', credential: state.credential });
          }
        }
        if (request.method() !== 'GET') { errors.push('Unexpected write: ' + endpoint); return route.abort(); }
        if (endpoint === '/account/security') return reply({ emailAvailable: false });
        if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false, deliveryVerified: false });
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
      state.external.push(url.origin); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'admin' ? '/users' : '/my/settings'));
    if (role === 'admin') await page.getByRole('button', { name: 'Review credentials', exact: true }).click();
    await page.getByRole('heading', { name: 'Automated document checks', exact: true }).waitFor();
    return { page, state, context };
  }
  const verify = (page) => page.getByRole('button', { name: 'Verify credential', exact: true });
  const note = (page) => page.getByLabel('Review note', { exact: true });
  const confirmation = (page) => page.getByRole('checkbox', { name: 'I completed the selected identity check and matched the ID to this account.', exact: true });
  const concern = (page) => page.getByRole('checkbox', { name: 'I reviewed the scan concerns or unreadable details and resolved them using the selected identity check.', exact: true });
  const confirm = async (page) => { await page.getByLabel('How was the ID confirmed?', { exact: true }).selectOption('in_person_original'); await confirmation(page).check(); };
  const checkPrivate = async (page) => {
    assert.equal((await page.locator('body').innerText()).includes(secretText), false);
    assert.equal(await page.evaluate((secret) => [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) => value.includes(secret)), secretText), false);
    assert.equal(await page.locator('a[href*="/uploads/"]').count(), 0);
  };
  try {
    const app = await fixture();
    await note(app.page).fill('Synthetic original-ID check completed.');
    await confirm(app.page);
    assert.equal(await verify(app.page).isDisabled(), true, 'An unscanned submission cannot be approved');
    await app.page.getByRole('button', { name: 'Run automated check', exact: true }).click();
    await app.page.getByText('One or more checks need attention. Compare the original document and confirm its details before deciding.', { exact: true }).waitFor();
    assert.equal(await verify(app.page).isDisabled(), true, 'Scan completion resets earlier attestation');
    await confirm(app.page);
    assert.equal(await verify(app.page).isDisabled(), true, 'Flags need a separate acknowledgement');
    await concern(app.page).check();
    assert.equal(await verify(app.page).isDisabled(), false);
    app.state.nextMode = 'ready';
    await app.page.getByRole('button', { name: 'Rescan ID', exact: true }).click();
    await app.page.getByText('Readable details are consistent with the submitted account. Clinic or issuer confirmation is still required.', { exact: true }).waitFor();
    assert.equal(await confirmation(app.page).isChecked(), false, 'A new scan requires a fresh attestation');
    assert.equal(await concern(app.page).count(), 0);
    await confirm(app.page);
    await app.page.getByText('Official authenticity not yet verified by this scan.', { exact: true }).waitFor();
    for (const width of [320, 390, 1440]) {
      await app.page.setViewportSize({ width, height: 1100 });
      assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width);
    }
    await app.page.locator('#user-credential-review').screenshot({ path: path.resolve(root, '../credential-scan-desktop.png') });
    await app.page.setViewportSize({ width: 390, height: 1100 }); await verify(app.page).scrollIntoViewIfNeeded();
    await app.page.screenshot({ path: path.resolve(root, '../credential-scan-phone.png') });
    await verify(app.page).click();
    await app.page.getByText('Credential verified by the clinic.', { exact: true }).waitFor();
    const review = app.state.requests.find((request) => request.method === 'PATCH');
    assert.equal(review.body.verificationMethod, 'in_person_original'); assert.equal(review.body.officialCheckConfirmed, true);
    assert.equal('acknowledgeScanFlags' in review.body, false);
    await checkPrivate(app.page); await app.context.close();

    const unreadable = await fixture({ mode: 'unreadable' });
    await note(unreadable.page).fill('Synthetic issuing-authority check resolved unreadable details.'); await confirm(unreadable.page);
    assert.equal(await verify(unreadable.page).isDisabled(), true);
    await concern(unreadable.page).check(); await verify(unreadable.page).click();
    await unreadable.page.getByText('Credential verified by the clinic.', { exact: true }).waitFor();
    assert.equal(unreadable.state.requests.find((request) => request.method === 'PATCH').body.acknowledgeScanFlags, true);
    await checkPrivate(unreadable.page); await unreadable.context.close();

    const pending = await fixture({ mode: 'processing' });
    assert.equal(await pending.page.getByRole('button', { name: 'Checking document…', exact: true }).isDisabled(), true);
    pending.state.credential = { ...pending.state.credential, scan: scanFor(1, 'ready') };
    await pending.page.getByRole('button', { name: 'Rescan ID', exact: true }).waitFor();
    await pending.context.close();

    const failure = await fixture({ failScan: true });
    await failure.page.getByRole('button', { name: 'Run automated check', exact: true }).click();
    await failure.page.getByText('Automated checks could not finish. Refresh the credential and retry. The document remains available for clinic review.', { exact: true }).waitFor();
    assert.equal(await verify(failure.page).isDisabled(), true); await failure.context.close();

    const patient = await fixture({ role: 'patient', mode: 'unreadable' });
    assert.equal(await verify(patient.page).count(), 0, 'Patients cannot approve scan findings');
    await patient.page.getByRole('button', { name: 'Rescan ID', exact: true }).click();
    await patient.page.getByText('One or more checks need attention. Compare the original document and confirm its details before deciding.', { exact: true }).waitFor();
    assert.equal(patient.state.requests.find((request) => request.method === 'POST').endpoint, '/credentials/mine/scan');
    assert.equal(await patient.page.locator('a[href="https://everify.gov.ph/check"]').count(), 1);
    await checkPrivate(patient.page); await patient.context.close();
    assert.deepEqual(errors, []);
    console.log('Credential scan browser checks passed: current-revision scan gating, explicit identity checks, flag acknowledgement, rescan attestation reset, unreadable/error/processing states, patient restrictions, private results, and 320–1440px layouts.');
  } finally { await browser.close(); await new Promise((resolve) => server.httpServer.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
