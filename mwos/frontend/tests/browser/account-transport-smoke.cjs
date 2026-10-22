// Isolated preview + mocked API only. This must never send a real clinic request.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const { preview } = await import('vite');
  const root = path.resolve(__dirname, '../..');
  const output = path.join(os.tmpdir(), 'mwos-account-transport-verification');
  await fs.mkdir(output, { recursive: true });
  const server = await preview({ root, preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.MWOS_CHROME_BINARY ? { executablePath: process.env.MWOS_CHROME_BINARY } : {}),
  });
  const origin = 'http://127.0.0.1:4177';

  async function fixture({ loseFirstResponse = false } = {}) {
    let user = {
      id: '11111111-1111-4111-8111-111111111111', role: 'patient', firstName: 'Test', lastName: 'Patient',
      email: 'patient@example.invalid', phone: '09171234567', avatarUrl: '',
    };
    const threads = new Map();
    const requests = [];
    const writes = [];
    let posts = 0;
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(({ account, appOrigin }) => {
      if (location.origin !== appOrigin || window !== window.top) return;
      localStorage.setItem('user', JSON.stringify(account));
      localStorage.setItem('accessToken', 'test-only-no-real-session');
    }, { account: user, appOrigin: origin });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.includes('/api/')) {
        if (url.origin === origin || url.protocol === 'data:') return route.continue();
        return route.abort();
      }
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      requests.push(request.method() + ' ' + endpoint);
      const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data }) });
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/auth/profile') {
        const body = request.postDataJSON();
        writes.push(body);
        user = { ...user, ...body };
        return reply(user);
      }
      if (endpoint === '/auth/preferences') { user.uiPreferences = request.postDataJSON().uiPreferences; return reply(user); }
      if (endpoint === '/patients/me') return reply({ id: 'test-patient', first_name: 'Test', last_name: 'Patient', phone: user.phone, address: 'Test-only pickup', city: 'Test city', patient_code: 'TEST-001' });
      if (endpoint === '/documents/my') return reply([]);
      if (endpoint === '/emergency/location/me') return reply(null);
      if (endpoint === '/interactions/directory') return reply({ staff: [], patients: [] });
      if (endpoint === '/interactions/threads' && request.method() === 'POST') {
        posts += 1;
        const body = request.postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!threads.has(body.clientRequestId)) {
          threads.set(body.clientRequestId, {
            id: body.clientRequestId, title: body.title, priority: 'urgent', status: 'open',
            created_by: user.id,
            thread_type: 'patient_support', created_at: '2026-10-22T10:00:00Z', last_message_at: '2026-10-22T10:00:00Z',
            participants: [], messages: [{ id: 'test-message', body: body.initialMessage, sender_id: user.id, sender_name: 'Test Patient', sender_role: 'patient', created_at: '2026-10-22T10:00:00Z' }],
          });
        }
        if (loseFirstResponse && posts === 1) return route.abort('failed');
        return reply(threads.get(body.clientRequestId), 201);
      }
      if (endpoint === '/interactions/threads') return reply([...threads.values()]);
      if (endpoint.startsWith('/interactions/threads/') && endpoint.endsWith('/read')) return reply({});
      if (endpoint.startsWith('/interactions/threads/')) {
        const thread = threads.get(endpoint.split('/')[3]);
        return reply(thread || null, thread ? 200 : 404);
      }
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, threads, requests, writes, errors, posts: () => posts };
  }

  try {
    const app = await fixture();
    await app.page.goto(origin + '/my/settings');
    await app.page.getByRole('heading', { name: 'Sign-in email', exact: true }).waitFor();
    assert.equal(app.requests.some((item) => item.includes('/patients/me') || item.includes('/documents/my')), false);
    assert.equal(await app.page.getByText('Theme mode', { exact: true }).count(), 1);
    assert.equal(await app.page.getByText('Secure Document Uploads', { exact: true }).count(), 0);
    await app.page.getByLabel('Mobile number', { exact: true }).fill('09179876543');
    await app.page.getByRole('button', { name: 'Save contact number', exact: true }).click();
    await app.page.getByText('Contact number saved.', { exact: false }).waitFor();
    await app.page.getByLabel('Login email', { exact: true }).fill('updated@example.invalid');
    await app.page.getByRole('button', { name: 'Save login email', exact: true }).click();
    await app.page.getByText('Login email updated successfully.', { exact: true }).waitFor();
    await app.page.screenshot({ path: path.join(output, 'settings-desktop.png') });
    await app.page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Profile', exact: true }).click();
    await app.page.getByRole('heading', { name: 'Profile details', exact: true }).waitFor();
    assert.equal(await app.page.getByText('Theme mode', { exact: true }).count(), 0);
    await app.page.getByLabel('First name', { exact: true }).fill('Updated');
    await app.page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await app.page.getByText('Profile details updated successfully.', { exact: true }).waitFor();
    assert.equal(app.writes.at(-1).phone, '09179876543');
    assert.equal(app.writes.at(-1).email, 'updated@example.invalid');
    await app.page.screenshot({ path: path.join(output, 'profile-desktop.png') });
    await app.page.setViewportSize({ width: 390, height: 844 });
    await app.page.goto(origin + '/my/settings');
    await app.page.getByRole('heading', { name: 'Sign-in email', exact: true }).waitFor();
    assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Settings must fit the mobile viewport');
    await app.page.screenshot({ path: path.join(output, 'settings-mobile.png') });
    await app.page.setViewportSize({ width: 1440, height: 1000 });
    await app.page.goto(origin + '/my/emergency');
    const send = app.page.getByRole('button', { name: 'Send urgent transport request', exact: true });
    await send.waitFor();
    await send.evaluate((button) => { button.click(); button.click(); });
    await app.page.getByText('Sending your request.', { exact: false }).waitFor();
    await app.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).waitFor();
    assert.equal(app.posts(), 1);
    assert.equal(app.threads.size, 1);
    assert.equal(await send.count(), 0);
    await app.page.screenshot({ path: path.join(output, 'transport-confirmation.png') });
    await app.page.setViewportSize({ width: 390, height: 844 });
    await app.page.getByRole('status').filter({ hasText: 'Submission confirmed' }).scrollIntoViewIfNeeded();
    assert.ok(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'The transport receipt must fit a phone viewport');
    await app.page.getByRole('status').filter({ hasText: 'Submission confirmed' }).screenshot({ path: path.join(output, 'transport-confirmation-mobile.png') });
    await app.page.setViewportSize({ width: 1440, height: 1000 });
    await app.page.reload();
    await app.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).waitFor();
    assert.equal(app.posts(), 1, 'Reload must restore the receipt without posting again');
    app.page.once('dialog', (dialog) => dialog.dismiss());
    await app.page.getByRole('button', { name: 'Start a different request', exact: true }).click();
    assert.equal(await app.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).count(), 1);
    await app.page.getByRole('link', { name: 'View request in Messages', exact: true }).click();
    await app.page.getByText('Emergency transport request', { exact: true }).first().waitFor();
    await app.page.goto(origin + '/my/emergency');
    await app.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).waitFor();
    app.page.once('dialog', (dialog) => dialog.accept());
    await app.page.getByRole('button', { name: 'Start a different request', exact: true }).click();
    await app.page.getByRole('button', { name: 'Send urgent transport request', exact: true }).click();
    await app.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).waitFor();
    assert.equal(app.posts(), 2);
    assert.equal(app.threads.size, 2, 'A separate request requires an explicit new-request confirmation');
    assert.equal(app.errors.length, 0, app.errors.join('\n'));
    await app.context.close();

    const recovery = await fixture({ loseFirstResponse: true });
    await recovery.page.goto(origin + '/my/emergency');
    await recovery.page.getByRole('button', { name: 'Send urgent transport request', exact: true }).click();
    await recovery.page.getByRole('alert').getByText('We could not confirm the request.', { exact: false }).waitFor();
    await recovery.page.getByRole('button', { name: 'Send urgent transport request', exact: true }).click();
    await recovery.page.getByRole('heading', { name: 'Your transport request was sent', exact: true }).waitFor();
    assert.equal(recovery.posts(), 2, 'A lost response permits retrying the same reference');
    assert.equal(recovery.threads.size, 1, 'Retry must not create a separate request');
    assert.equal(recovery.errors.length, 0, recovery.errors.join('\n'));
    await recovery.context.close();
    console.log('Browser checks passed: separate settings/profile, safe saves, mobile fit, double-click protection, receipt restore, Messages navigation, and lost-response retry.');
    console.log('Screenshots: ' + output);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
