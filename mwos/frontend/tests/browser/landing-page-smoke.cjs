// Clinic landing and portal-entry fixtures only. No real accounts or appointments.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const { preview } = await import('vite');
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4190, strictPort: true } });
  const origin = 'http://127.0.0.1:4190';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-maternal-landing');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [], requests = [];
  const patient = { id: 'landing-fixture-only', role: 'patient', patientId: 'fixture-patient', firstName: 'Test', lastName: 'Patient', careType: 'maternal' };
  async function fixture({ user, expired = false, feedback = 'empty', viewport = { width: 1440, height: 1000 } } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    if (user) await context.addInitScript(({ user }) => { localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('accessToken', 'synthetic-test-token'); }, { user });
    await context.route('**/*', async (route) => {
      const req = route.request(), url = new URL(req.url());
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      if (!url.pathname.includes('/api/')) return url.origin === origin ? route.continue() : route.abort();
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      requests.push({ endpoint, method: req.method() });
      const reply = (data) => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (endpoint === '/auth/me') return expired ? route.fulfill({ status: 401, headers, contentType: 'application/json', body: '{"success":false,"message":"fixture session ended"}' }) : reply(user);
      if (endpoint === '/reviews/summary') {
        assert.equal(req.headers().authorization, undefined, 'Public feedback must not carry a saved session');
        assert.equal(req.headers()['x-step-up-token'], undefined);
        if (feedback === 'error') return route.fulfill({ status: 503, headers, contentType: 'application/json', body: '{"success":false}' });
        return reply(feedback === 'published' ? { totalReviews: 1, averageRating: 4, recent: [{ id: 'fixture-feedback', rating: 4, display_name: 'Synthetic reviewer', comment: 'Synthetic review for browser verification only.' }] } : { totalReviews: 0, averageRating: 0, recent: [] });
      }
      if (endpoint === '/auth/providers') return reply({ google: false });
      if (endpoint === '/auth/login') {
        assert.equal(req.method(), 'POST');
        return reply({ accessToken: 'fixture-only-access', refreshToken: 'fixture-only-refresh', user: patient });
      }
      assert.equal(req.method(), 'GET', 'No real or unexpected clinical mutations are allowed');
      if (endpoint === '/patients/me') return reply({ id: patient.patientId, first_name: 'Test', care_type: 'maternal', pregnancies: [] });
      if (endpoint === '/interactions/directory') return reply({ staff: [{ id: 'fixture-provider', first_name: 'Example', last_name: 'Provider', role: 'midwife' }], patients: [] });
      if (endpoint === '/appointments') return reply({ appointments: [], total: 0 });
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, context };
  }
  try {
    const guest = await fixture();
    await guest.page.goto(origin);
    await guest.page.getByRole('heading', { level: 1 }).filter({ hasText: 'first embrace.' }).waitFor();
    assert.equal(new URL(guest.page.url()).pathname, '/');
    const text = await guest.page.locator('main').innerText();
    assert.doesNotMatch(text, /dental|2000\+|24\/7|successful patients/i);
    assert.doesNotMatch(text, /&nearr;|&amp;nearr;/i, 'External link arrows never render as entity text');
    const contact = guest.page.getByRole('region', { name: 'Hours & contact', exact: true });
    await contact.getByRole('heading', { name: 'Working hours', exact: true }).waitFor();
    assert.match(await contact.innerText(), /Open 24 hours/);
    assert.match(await contact.innerText(), /Monday - Sunday/);
    assert.match(await contact.innerText(), /Opening hours are not a confirmed consultation slot/);
    assert.match(await contact.innerText(), /Temporary contact details/);
    assert.equal(await contact.getByRole('link', { name: '0992 682 1514', exact: true }).getAttribute('href'), 'tel:+639926821514');
    assert.equal(await contact.getByRole('link', { name: 'nexxus1122@gmail.com', exact: true }).getAttribute('href'), 'mailto:nexxus1122@gmail.com');
    const facebook = guest.page.locator('.clinic-address-card').getByRole('link', { name: /Visit the clinic Facebook page/ });
    assert.equal(await facebook.locator('[data-app-icon="externalLink"]').count(), 1);
    assert.doesNotMatch(await facebook.innerText(), /&\w+;/);
    for (const link of await contact.locator('a[target="_blank"]').all()) {
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    }
    await guest.page.getByText('No written reviews have been published yet.', { exact: true }).waitFor();
    await guest.page.getByRole('button', { name: 'Show a place to rest', exact: true }).click();
    assert.equal(await guest.page.getByRole('button', { name: 'Show a place to rest', exact: true }).getAttribute('aria-pressed'), 'true');
    await guest.page.getByAltText('Clinic recovery room with two patient beds').waitFor();
    const faq = guest.page.locator('details').filter({ hasText: 'How do I request an appointment?' });
    await faq.locator('summary').click();
    assert.equal(await faq.getAttribute('open'), '');
    assert.match(await faq.innerText(), /not a confirmed visit/);
    for (const image of await guest.page.locator('.clinic-landing img').all()) {
      await image.scrollIntoViewIfNeeded();
      await guest.page.waitForFunction((element) => element.complete && element.naturalWidth > 0, await image.elementHandle());
    }
    await guest.page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await guest.page.screenshot({ path: path.join(screenshots, 'hero-desktop.png') });
    await guest.page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
    for (const width of [1024, 768, 390, 320]) {
      await guest.page.setViewportSize({ width, height: 900 });
      await guest.page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      assert.ok(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}px`);
      if (width <= 768) {
        const toggle = guest.page.getByRole('button', { name: 'Toggle navigation' });
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await guest.page.getByRole('navigation', { name: 'Clinic navigation' }).getByRole('link', { name: 'Hours & contact', exact: true }).click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(new URL(guest.page.url()).hash, '#contact');
      }
      await contact.scrollIntoViewIfNeeded();
      assert.ok(await contact.evaluate((element) => element.scrollWidth <= element.clientWidth), `Contact section fits ${width}px`);
      for (const link of await contact.locator('.clinic-contact-methods a').all()) {
        assert.ok((await link.boundingBox()).height >= 44, 'Contact actions keep a 44px touch target');
      }
      if (width === 390 || width === 320) await contact.screenshot({ path: path.join(screenshots, `contact-${width}.png`) });
      await guest.page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      if (width === 390) await guest.page.screenshot({ path: path.join(screenshots, 'hero-mobile.png') });
      await guest.page.screenshot({ path: path.join(screenshots, `width-${width}.png`), fullPage: true });
    }
    await guest.page.setViewportSize({ width: 1440, height: 1000 });
    await contact.screenshot({ path: path.join(screenshots, 'contact-desktop.png') });
    await guest.page.getByRole('link', { name: 'Book an appointment', exact: true }).click();
    await guest.page.waitForURL('**/login?intent=appointment');
    await guest.page.locator('input[name="email"]').fill('fixture@example.invalid');
    await guest.page.locator('input[name="password"]').fill('synthetic-fixture-only');
    await guest.page.getByRole('button', { name: 'Sign in securely', exact: true }).click();
    await guest.page.waitForURL('**/my/appointments');
    await guest.context.close();

    for (const role of ['patient', 'admin']) {
      const signed = await fixture({ user: { ...patient, role }, feedback: 'published' });
      await signed.page.goto(origin);
      await signed.page.getByRole('heading', { level: 1 }).waitFor();
      await signed.page.getByText('Synthetic review for browser verification only.', { exact: true }).waitFor();
      assert.equal(new URL(signed.page.url()).pathname, '/');
      await signed.page.getByRole('link', { name: 'Open Web Version', exact: true }).click();
      await signed.page.waitForURL(role === 'patient' ? '**/my/dashboard' : '**/dashboard');
      if (role === 'patient') {
        await signed.page.goto(origin + '/my');
        await signed.page.waitForURL('**/my/dashboard');
        await signed.page.goto(origin);
        await signed.page.getByRole('link', { name: 'View care team in the portal', exact: true }).click();
        await signed.page.waitForURL('**/my/doctors');
        await signed.page.getByRole('heading', { name: 'Care team', exact: true }).waitFor();
        await signed.page.getByRole('link', { name: 'View', exact: true }).click();
        await signed.page.getByText('Schedule confirmed by clinic', { exact: true }).waitFor();
        assert.equal(await signed.page.getByText('Available this week', { exact: true }).count(), 0);
      }
      await signed.context.close();
    }
    const ended = await fixture({ user: patient, expired: true, feedback: 'error' });
    await ended.page.goto(origin);
    await ended.page.getByText('Published feedback is unavailable right now.', { exact: true }).waitFor();
    assert.equal(new URL(ended.page.url()).pathname, '/', 'Expired sessions cannot steal the public landing page');
    assert.equal(await ended.page.evaluate(() => localStorage.getItem('accessToken')), null);
    await ended.page.getByRole('link', { name: 'Visit Download Center', exact: true }).click();
    await ended.page.waitForURL('**/download');
    await ended.page.getByRole('heading', { name: 'Install MWOS on your device.', exact: true }).waitFor();
    assert.equal(await ended.page.locator('a[href$=".apk"], a[href$=".exe"]').count(), 0, 'Unpublished installers cannot become fake download buttons');
    const guides = await ended.page.locator('[aria-label="Application downloads"] a').all();
    assert.equal(guides.length, 4);
    for (const guide of guides) {
      const response = await ended.page.request.get(origin + await guide.getAttribute('href'));
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /text\/plain/);
    }
    await ended.context.close();
    assert.deepEqual(errors, []);
    process.stdout.write(`Maternal landing checks passed: public entry, expired sessions, role-aware portal, booking intent, gallery, hours/contact links, SVG external icon, FAQ, feedback states, guides, 320-1440px. Screenshots: ${screenshots}\n`);
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
      console.error({ url: page.url(), feedback: await page.locator('#feedback').innerText().catch(() => 'feedback not mounted'), errors });
    }
    throw error;
  } finally { await browser.close(); await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
