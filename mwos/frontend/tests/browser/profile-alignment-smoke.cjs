// All account reads and writes are mocked, including when checking deployed assets.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const deployed = process.env.MWOS_VERIFY_ORIGIN;
  if (deployed && deployed !== 'https://tmc-copino-mwos.vercel.app') throw new Error('Unrecognized verification target');
  const { preview } = await import('vite');
  const server = deployed ? null : await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4185, strictPort: true } });
  const origin = deployed || 'http://127.0.0.1:4185';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-profile-alignment');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [];
  const writes = [];

  async function fixture(role = 'patient') {
    let user = { id: 'test-user', role, firstName: 'Edward Leo', lastName: 'Test', email: 'test@example.invalid', phone: '09171234567', avatarUrl: '', careType: 'general' };
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(({ user, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', 'test-only-not-a-real-session');
    }, { user, origin });
    await context.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, x-step-up-token', 'access-control-allow-methods': 'GET, PATCH, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
      if (!url.pathname.includes('/api/')) return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
      const endpoint = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
      const reply = (data) => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (req.method() === 'PATCH' && endpoint === '/auth/profile') {
        writes.push(req.postDataJSON());
        user = { ...user, ...req.postDataJSON() };
        return reply(user);
      }
      if (req.method() !== 'GET') throw new Error(`Unexpected intercepted write: ${req.method()} ${endpoint}`);
      if (endpoint === '/auth/me') return reply(user);
      if (endpoint === '/patients/me') return reply({ id: 'test-patient', gender: 'male', care_type: 'general', pregnancies: [] });
      if (endpoint === '/notifications/settings') return reply({ configured: false, googleEmailCodeRequired: false });
      return reply([]);
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + (role === 'patient' ? '/my/profile' : '/account'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#profile-first-name')?.value === 'Edward Leo');
    return { page, context };
  }

  const near = (a, b, label) => assert.ok(Math.abs(a - b) < 2, `${label}: ${a} vs ${b}`);
  async function check(page, width, uploaded = false) {
    await page.setViewportSize({ width, height: 1000 });
    // Avoid mixing geometry from before and after a responsive layout change.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const form = page.getByRole('form', { name: 'Profile details', exact: true });
    const photo = await form.locator('[aria-label="Profile photo"]').boundingBox();
    const upload = await form.locator('label[for="profile-photo-upload"]').boundingBox();
    const first = await form.getByLabel('First name', { exact: true }).boundingBox();
    const last = await form.getByLabel('Last name', { exact: true }).boundingBox();
    const save = await form.getByRole('button', { name: 'Save profile', exact: true }).boundingBox();
    near(photo.x, upload.x, 'Photo and upload left edges');
    near(photo.width, upload.width, 'Photo and upload widths');
    if (width >= 768) {
      near(first.y, last.y, 'Name fields share a row');
      near(first.width, last.width, 'Name fields have equal widths');
      near(save.x + save.width, last.x + last.width, 'Save aligns with right field edge');
      const lastPhotoAction = uploaded ? await form.getByRole('button', { name: 'Remove photo', exact: true }).boundingBox() : upload;
      near(save.y + save.height, lastPhotoAction.y + lastPhotoAction.height, 'Save and photo actions align at the bottom');
      assert.ok(first.x > photo.x + photo.width, 'Name fields stay beside the photo');
    } else {
      assert.ok(first.y > upload.y + upload.height, 'Name fields stack below photo controls');
      assert.ok(last.y > first.y, 'Name fields stack on mobile');
      assert.ok(save.y > last.y + last.height, 'Save follows the name fields');
    }
    assert.ok(await form.evaluate((element) => element.scrollWidth <= element.clientWidth), 'Profile form must not overflow');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must fit the viewport');
    const notice = form.getByText('Profile details updated successfully.', { exact: true });
    if (width < 640 && await notice.count()) {
      const heading = await form.locator('h2').locator('..').boundingBox();
      const confirmation = await notice.boundingBox();
      assert.ok(confirmation.y >= heading.y + heading.height, 'Mobile confirmation stacks below the description without squeezing it');
      near(heading.width, first.width, 'Mobile heading uses the full field width');
    }
    return form;
  }

  try {
    const app = await fixture();
    for (const width of [1280, 1024, 768, 390, 320]) await check(app.page, width);
    await check(app.page, 1280);
    const form = app.page.getByRole('form', { name: 'Profile details', exact: true });
    const initials = form.locator('[aria-label="Profile photo"]');
    assert.equal((await initials.innerText()).trim(), 'ET');
    assert.notEqual(await initials.evaluate((element) => getComputedStyle(element).color), 'rgb(255, 255, 255)', 'Fallback initials must be visible on the light photo background');
    await form.screenshot({ path: path.join(screenshots, 'profile-desktop.png') });
    await form.getByLabel('Upload photo', { exact: true }).setInputFiles({
      name: 'test-photo.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64'),
    });
    await form.getByRole('img', { name: 'Current avatar' }).waitFor();
    await check(app.page, 1280, true);
    await form.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await check(app.page, 1280);
    await form.getByLabel('First name', { exact: true }).fill('Updated');
    await form.getByRole('button', { name: 'Save profile', exact: true }).click();
    await form.getByText('Profile details updated successfully.', { exact: true }).waitFor();
    assert.equal(writes[0].firstName, 'Updated');
    assert.equal(writes[0].email, 'test@example.invalid');
    assert.equal(writes[0].phone, '09171234567');
    await check(app.page, 320);
    await check(app.page, 390);
    await form.screenshot({ path: path.join(screenshots, 'profile-mobile.png') });
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await app.page.evaluate(() => document.documentElement.classList.add('dark'));
    await check(app.page, 1280);
    await form.screenshot({ path: path.join(screenshots, 'profile-dark.png') });
    await app.context.close();
    const staff = await fixture('admin');
    await check(staff.page, 1280);
    await staff.context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', origin, checks: ['aligned photo/upload widths', 'aligned name fields and save action', '1280/1024/768/390/320px', 'visible initials', 'photo upload/remove', 'safe profile save', 'dark mode', 'staff profile'], data: 'isolated API fixtures; no real account writes', screenshots }));
  } finally { await browser.close(); if (server) await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
