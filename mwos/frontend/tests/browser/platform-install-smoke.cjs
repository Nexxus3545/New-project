// Public install flow only: no real account writes or device installations.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'http://127.0.0.1:4194';
const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function main() {
  const { preview } = await import('vite');
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4194, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  async function fixture(options = {}) {
    const context = await browser.newContext({ userAgent: windows, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/api/')) return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, data: { totalReviews: 0, recent: [] } }) });
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return { context, page };
  }
  async function sendPrompt(page, outcome, fail = false) {
    await page.evaluate(({ outcome, fail }) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => { window.installCalls = (window.installCalls || 0) + 1; return fail ? Promise.reject(new Error('Unavailable')) : Promise.resolve(); };
      event.userChoice = Promise.resolve({ outcome });
      window.dispatchEvent(event);
    }, { outcome, fail });
  }
  try {
    const { page, context } = await fixture();
    for (const [id, name] of [['windows', 'Windows'], ['android', 'Android'], ['macos', 'macOS'], ['ios', 'iOS']]) {
      await page.goto(origin);
      await page.getByRole('link', { name: `${name}: install or open MWOS`, exact: true }).click();
      await page.getByRole('heading', { name: `MWOS for ${name}`, exact: true }).waitFor();
      assert.equal(new URL(page.url()).hash, '#' + id);
      assert.equal(await page.locator('.download-setup-steps li').count(), 3);
      await page.getByRole('link', { name: `Open MWOS for ${name}`, exact: true }).click();
      await page.waitForURL('**/login');
    }
    await page.goto(origin + '/download#windows');
    await page.evaluate(() => navigator.serviceWorker.ready);
    const manifest = await (await page.request.get(origin + '/manifest.webmanifest')).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/portal?source=installed');
    for (const icon of manifest.icons) {
      const bytes = await (await page.request.get(origin + icon.src)).body();
      const expected = Number(icon.sizes.split('x')[0]);
      assert.equal(bytes.readUInt32BE(16), expected);
      assert.equal(bytes.readUInt32BE(20), expected);
    }
    // Normal profiles can install; Playwright's usual isolated contexts are incognito.
    const profile = fs.mkdtempSync(path.join(process.env.TEMP, 'mwos-install-check-'));
    const installContext = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
      const installPage = await installContext.newPage();
      await installPage.goto(origin + '/download');
      await installPage.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await installContext.newCDPSession(installPage);
      const installability = await cdp.send('Page.getInstallabilityErrors');
      assert.deepEqual(installability.installabilityErrors, [], 'Browser validates actual manifest and install requirements');
      await cdp.detach();
    } finally { await installContext.close(); }

    await sendPrompt(page, 'dismissed');
    await page.getByRole('button', { name: 'Install MWOS', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Installation cancelled' }).waitFor();
    await sendPrompt(page, 'accepted', true);
    await page.getByRole('button', { name: 'Install MWOS', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Use the browser steps below' }).waitFor();
    await sendPrompt(page, 'accepted');
    await page.getByRole('button', { name: 'Install MWOS', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Installation requested' }).waitFor();
    assert.equal(await page.evaluate(() => window.installCalls), 3);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.getByText('Installed on this device', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Install MWOS', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-platform-setup-desktop.png'), fullPage: true });

    await page.goto(origin + manifest.start_url);
    await page.waitForURL('**/login');
    const cachedPaths = await page.evaluate(async () => {
      const keys = await caches.keys();
      return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat();
    });
    assert.deepEqual(cachedPaths, ['/offline.html'], 'No app pages or patient responses in service-worker caches');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Let’s get you connected.' }).waitFor();
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Try opening MWOS again' }).click();
    await page.waitForURL('**/login');
    await context.close();

    const phone = await fixture({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await phone.page.goto(origin + '/download');
    await phone.page.getByRole('heading', { name: 'MWOS for iOS', exact: true }).waitFor();
    await phone.page.getByText(/Open Share.*Add to Home Screen/).waitFor();
    assert.equal(await phone.page.getByRole('button', { name: 'Install MWOS', exact: true }).count(), 0, 'Safari gets honest manual steps');
    for (const width of [390, 320]) {
      await phone.page.setViewportSize({ width, height: 844 });
      assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No overflow on phone');
    }
    await phone.page.setViewportSize({ width: 390, height: 844 });
    await phone.page.screenshot({ path: path.join(process.env.TEMP, 'mwos-platform-setup-phone.png'), fullPage: true });
    await phone.context.close();
    assert.deepEqual(errors, []);
    console.log('Platform flow passed: all four homepage buttons reach setup and login, valid installable manifest/icons, prompt accepted/cancelled/error states, installed state, phone layout, offline screen/reconnection, and no private response caching.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
