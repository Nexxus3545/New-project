// Local preview with synthetic data only. Every API request is intercepted; no claim is submitted.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: 4197, strictPort: true } });
  const origin = 'http://127.0.0.1:4197';
  const screenshot = path.resolve(root, '../philhealth-preview.png');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  const patients = [
    { id: '11111111-1111-4111-8111-111111111111', first_name: 'Demo', last_name: 'One', patient_code: 'TEST-001', philhealth_id: '12-345678901-2', philhealth_type: 'Member' },
    { id: '22222222-2222-4222-8222-222222222222', first_name: 'Demo', last_name: 'Two', patient_code: 'TEST-002', philhealth_id: '98-765432109-8', philhealth_type: 'Dependent' },
    { id: '33333333-3333-4333-8333-333333333333', first_name: 'Demo', last_name: 'Unavailable', patient_code: 'TEST-003', philhealth_id: '', philhealth_type: '' },
  ];
  const bills = patients.slice(0, 2).map((patient, index) => ({ id: `test-bill-${index}`, patient_id: patient.id, patient_name: `${patient.first_name} ${patient.last_name}`, bill_date: '2026-10-28', service_type: 'Synthetic visit', total_amount: 100, philhealth_amount: 0, philhealth_claim_no: `TEST-REF-${index + 1}`, payment_status: 'unpaid' }));
  const documents = [
    { id: 'id', document_type: 'PhilHealth ID', verification_status: 'pending_review' },
    { id: 'antenatal', document_type: 'ANCR', verification_status: 'pending_review' },
    { id: 'postpartum', document_type: 'Postpartum Care Record', verification_status: 'pending_review' },
    { id: 'rejected-delivery', document_type: 'CF4', verification_status: 'rejected' },
    { id: 'not-cf4', document_type: 'CF4 report', verification_status: 'verified' },
    { id: 'not-electronic-soa', document_type: 'eSOA', file_name: 'eSOA.pdf', verification_status: 'verified' },
  ];

  async function fixture(role = 'admin') {
    const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firstName: 'Synthetic', lastName: 'Staff', role, email: 'test@example.invalid', careType: 'maternal' };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
    const requests = [];
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-no-real-credentials');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, OPTIONS' };
      if (url.pathname.includes('/api/')) {
        const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
        requests.push({ method: request.method(), endpoint, search: url.search });
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        if (request.method() !== 'GET') {
          errors.push(`Unexpected write blocked: ${request.method()} ${endpoint}`);
          return route.abort();
        }
        const reply = (data, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data }) });
        if (endpoint === '/auth/me') return reply(user);
        if (endpoint === '/billing') return reply(bills);
        if (endpoint === '/patients') return reply(patients);
        if (endpoint.startsWith('/patients/')) return reply(patients.find((patient) => patient.id === endpoint.split('/')[2]) || null);
        if (endpoint === '/documents') return url.searchParams.get('patientId') === patients[2].id ? reply(null, 500) : reply(documents);
        if (endpoint === '/reviews/summary') return reply({ totalReviews: 0, averageRating: 0, recent: [] });
        return reply([]);
      }
      return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, requests };
  }

  const dataReads = (requests) => requests.filter((request) => request.endpoint === '/patients' || request.endpoint.startsWith('/patients/') || request.endpoint === '/documents');
  async function openPreparation(app) {
    await app.page.goto(origin + '/billing');
    await app.page.getByRole('heading', { name: 'Billing & PhilHealth', exact: true }).waitFor();
    await app.page.getByRole('button', { name: 'PhilHealth preparation', exact: true }).click();
    await app.page.getByText('Not connected to PhilHealth', { exact: true }).waitFor();
  }

  try {
    const app = await fixture();
    await app.page.goto(origin + '/billing');
    await app.page.getByRole('heading', { name: 'Billing & PhilHealth', exact: true }).waitFor();
    assert.equal(dataReads(app.requests).length, 0, 'Payment view does not fetch patient or document data');
    await app.page.getByRole('button', { name: 'PhilHealth preparation', exact: true }).click();
    await app.page.getByText('Not connected to PhilHealth', { exact: true }).waitFor();
    assert.equal(dataReads(app.requests).length, 0, 'Preparation view waits for an explicit patient search');
    await app.page.getByLabel('Find a patient', { exact: true }).fill('Demo');
    assert.equal(dataReads(app.requests).length, 0, 'Typing alone does not fetch patient data');
    await app.page.getByRole('button', { name: 'Search patients', exact: true }).click();
    await app.page.getByLabel('Select patient', { exact: true }).waitFor();
    assert.equal(app.requests.filter((request) => request.endpoint === '/patients').length, 1);
    assert.equal(app.requests.some((request) => request.endpoint === '/documents' || /^\/patients\//.test(request.endpoint)), false);
    await app.page.getByLabel('Select patient', { exact: true }).selectOption(patients[0].id);
    await app.page.getByText('•••• •••• 9012', { exact: true }).waitFor();
    assert.equal(await app.page.getByText(patients[0].philhealth_id, { exact: true }).count(), 0);
    await app.page.getByRole('button', { name: 'Show PIN', exact: true }).click();
    await app.page.getByText(patients[0].philhealth_id, { exact: true }).waitFor();
    assert.equal(await app.page.getByRole('button', { name: 'Hide PIN', exact: true }).getAttribute('aria-pressed'), 'true');

    await app.page.getByRole('heading', { name: 'Supporting documents · ANCR', exact: true }).waitFor();
    await app.page.getByText('ANCR', { exact: true }).waitFor();
    await app.page.getByLabel('Care package for document review', { exact: true }).selectOption('postpartum');
    await app.page.getByRole('heading', { name: 'Supporting documents · PPCR', exact: true }).waitFor();
    await app.page.getByText('Postpartum Care Record', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('ANCR', { exact: true }).count(), 0);
    await app.page.getByLabel('Care package for document review', { exact: true }).selectOption('delivery');
    const deliverySection = app.page.getByRole('heading', { name: 'Supporting documents · CF4', exact: true }).locator('..');
    await deliverySection.getByText('No matching document', { exact: true }).waitFor();
    assert.equal(await deliverySection.getByText('CF4', { exact: true }).count(), 0, 'Rejected CF4 is not listed');
    assert.equal(await deliverySection.getByText('CF4 report', { exact: true }).count(), 0, 'Arbitrary document types do not match');
    await app.page.getByText(/An uploaded PDF does not prove eSOA compliance/).waitFor();
    await app.page.getByText('TEST-REF-1', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('TEST-REF-2', { exact: true }).count(), 0, 'Only selected patient billing reference is shown');

    await app.page.getByLabel('Select patient', { exact: true }).selectOption(patients[1].id);
    await app.page.getByText('•••• •••• 1098', { exact: true }).waitFor();
    assert.equal(await app.page.getByText(patients[1].philhealth_id, { exact: true }).count(), 0, 'PIN reveal resets when switching patients');
    await app.page.getByRole('button', { name: 'Show PIN', exact: true }).waitFor();
    await app.page.getByText('TEST-REF-2', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('TEST-REF-1', { exact: true }).count(), 0);

    for (const width of [1440, 320]) {
      await app.page.setViewportSize({ width, height: 1080 });
      assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`);
    }
    await app.page.setViewportSize({ width: 1440, height: 1080 });
    await app.page.getByRole('heading', { name: 'Billing & PhilHealth', exact: true }).scrollIntoViewIfNeeded();
    await app.page.screenshot({ path: screenshot, fullPage: true });
    await app.page.getByLabel('Select patient', { exact: true }).selectOption(patients[2].id);
    await app.page.getByText('Documents are unavailable. Their presence cannot be checked.', { exact: true }).waitFor({ timeout: 20000 });
    assert.equal(await app.page.getByText('No matching document', { exact: true }).count(), 0, 'Failed document load is not represented as zero documents');
    assert.equal(await app.page.getByText(/0 total uploaded documents/).count(), 0);
    assert.equal(app.requests.some((request) => !['GET', 'OPTIONS'].includes(request.method)), false);
    await app.context.close();

    const doctor = await fixture('doctor');
    await openPreparation(doctor);
    assert.equal(dataReads(doctor.requests).length, 0);
    await doctor.context.close();
    for (const role of ['nurse', 'patient']) {
      const denied = await fixture(role);
      await denied.page.goto(origin + '/billing');
      await denied.page.waitForURL(origin + '/');
      assert.equal(await denied.page.getByRole('button', { name: 'PhilHealth preparation', exact: true }).count(), 0, `${role} cannot access billing workspace`);
      assert.equal(denied.requests.some((request) => request.endpoint === '/billing'), false, `${role} cannot mount billing data fetch`);
      await denied.context.close();
    }
    assert.deepEqual(errors, []);
    console.log('PhilHealth preparation checks passed: read-only mocked APIs, deferred patient reads, masked PIN/reset, package records/rejection, eSOA wording, patient billing isolation, unavailable documents, role guards, 320–1440px. Screenshot: ' + screenshot);
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.resolve(root, '../philhealth-test-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    await server.httpServer.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
