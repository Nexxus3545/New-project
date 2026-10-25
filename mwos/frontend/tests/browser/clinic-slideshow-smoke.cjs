// Clinic tour UI fixtures only. API traffic is mocked; no patient account is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const { preview } = await import('vite');
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4193, strictPort: true } });
  const origin = 'http://127.0.0.1:4193';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY });
  const screenshots = path.join(os.tmpdir(), 'mwos-clinic-slideshow');
  await fs.mkdir(screenshots, { recursive: true });
  const errors = [];
  async function fixture({ reducedMotion = 'no-preference', broken = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion, serviceWorkers: 'block' });
    await context.route('**/*', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (broken && url.pathname === '/clinic/maternal-reception.jpg') return route.abort();
      if (url.pathname.includes('/api/')) {
        assert.equal(req.method(), 'GET', 'The slideshow never submits a clinic request');
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { totalReviews: 0, averageRating: 0, recent: [] } }) });
      }
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install();
    await page.goto(origin);
    const tour = page.getByRole('region', { name: 'Inside TMC Copino photo tour', exact: true });
    await tour.scrollIntoViewIfNeeded();
    await page.mouse.move(10, 10);
    return { page, tour, context };
  }
  const selected = (tour) => tour.getAttribute('data-slide');
  const running = async (page, value) => page.waitForFunction((value) => document.querySelector('.clinic-slideshow')?.dataset.running === value, String(value));
  const tick = async (page) => page.clock.fastForward(7500);
  try {
    const app = await fixture();
    const { page, tour } = app;
    await running(page, true);
    assert.equal(await selected(tour), '1');
    assert.equal(await tour.locator('.clinic-tour-slides').getAttribute('aria-live'), 'off');
    assert.equal(await tour.locator('.clinic-tour-slide[data-active="true"]').getAttribute('aria-hidden'), 'false');
    assert.equal(await tour.locator('.clinic-tour-slide').first().evaluate((element) => getComputedStyle(element).transitionDuration), '0.9s', 'Explicit slideshow animation works without restoring decorative app motion');
    await tick(page);
    await page.waitForFunction(() => document.querySelector('.clinic-slideshow')?.dataset.slide === '2');
    await tour.hover();
    await running(page, false);
    await tick(page);
    assert.equal(await selected(tour), '2', 'Hover suspends automatic rotation');
    await page.mouse.move(10, 10);
    await running(page, true);
    await tour.getByRole('button', { name: 'Pause clinic slideshow', exact: true }).click();
    await page.mouse.move(10, 10);
    await tick(page);
    assert.equal(await selected(tour), '2');
    await tour.getByRole('button', { name: 'Next clinic photo', exact: true }).click();
    assert.equal(await selected(tour), '3');
    assert.equal(await tour.locator('.clinic-tour-slides').getAttribute('aria-live'), 'polite');
    await tour.getByRole('button', { name: 'Previous clinic photo', exact: true }).press('ArrowRight');
    assert.equal(await selected(tour), '4');
    await tour.getByRole('button', { name: 'Next clinic photo', exact: true }).click();
    assert.equal(await selected(tour), '1', 'Manual navigation wraps without moving keyboard focus');
    await tour.getByRole('button', { name: 'Show room for your questions', exact: true }).click();
    assert.equal(await selected(tour), '2');
    assert.equal(await tour.getByRole('button', { name: 'Show room for your questions', exact: true }).getAttribute('aria-pressed'), 'true');
    await tour.getByRole('button', { name: 'Play clinic slideshow', exact: true }).click();
    await page.mouse.move(10, 10);
    await running(page, true);
    await page.evaluate(() => document.activeElement?.blur());
    await tour.getByRole('button', { name: 'Next clinic photo', exact: true }).focus();
    await running(page, false);
    await tick(page);
    assert.equal(await selected(tour), '2', 'Keyboard focus stops autoplay until explicitly resumed');
    await tour.getByRole('button', { name: 'Play clinic slideshow', exact: true }).click();
    await page.mouse.move(10, 10);
    await running(page, true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await running(page, false);
    await tick(page);
    assert.equal(await selected(tour), '2', 'Off-screen slides do not rotate');
    await tour.scrollIntoViewIfNeeded();
    await running(page, true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await running(page, false);
    await tick(page);
    assert.equal(await selected(tour), '2', 'A hidden page never advances the tour');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await running(page, true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await running(page, false);
    await tick(page);
    assert.equal(await selected(tour), '2', 'A changed reduced-motion setting stops autoplay immediately');
    assert.equal(await tour.getByRole('button', { name: 'Automatic slideshow off for reduced motion', exact: true }).isDisabled(), true);
    await app.context.close();

    const calm = await fixture({ reducedMotion: 'reduce' });
    await calm.tour.getByRole('button', { name: 'Automatic slideshow off for reduced motion', exact: true }).waitFor();
    await tick(calm.page);
    assert.equal(await selected(calm.tour), '1');
    await calm.tour.getByRole('button', { name: 'Next clinic photo', exact: true }).click();
    assert.equal(await selected(calm.tour), '2');
    assert.ok(await calm.tour.locator('.clinic-tour-slide').first().evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration) <= 0.0001), 'Reduced motion makes slide changes effectively instant');
    assert.equal(await calm.tour.locator('.clinic-tour-slide[data-active="true"] > img').evaluate((element) => getComputedStyle(element).animationName), 'none');
    await calm.page.evaluate(() => document.activeElement?.blur());
    await calm.tour.screenshot({ path: path.join(screenshots, 'slideshow-desktop.png') });
    for (const width of [1024, 768, 390, 320]) {
      await calm.page.setViewportSize({ width, height: 1100 });
      await calm.tour.scrollIntoViewIfNeeded();
      assert.ok(await calm.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow at ' + width + 'px');
      assert.ok(await calm.tour.evaluate((element) => element.scrollWidth <= element.clientWidth), 'Tour fits ' + width + 'px');
      for (const button of await calm.tour.locator('.clinic-tour-arrows button, .clinic-tour-play, .clinic-tour-index button').all()) {
        const box = await button.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44, 'Tour controls keep a 44px touch target');
      }
      const stage = await calm.tour.locator('.clinic-tour-stage').boundingBox();
      const caption = await calm.tour.locator('[data-active="true"] figcaption').boundingBox();
      assert.ok(caption.y >= stage.y + 55, 'Caption stays below playback control');
      await calm.tour.screenshot({ path: path.join(screenshots, 'slideshow-' + width + '.png') });
    }
    await calm.context.close();
    const broken = await fixture({ broken: true });
    await broken.tour.getByText('This clinic photograph is unavailable.', { exact: true }).waitFor();
    await broken.tour.getByRole('button', { name: 'Next clinic photo', exact: true }).click();
    assert.equal(await selected(broken.tour), '2', 'Other real photos remain navigable after an image failure');
    await broken.context.close();
    assert.deepEqual(errors, []);
    console.log('Clinic slideshow checks passed: autoplay, hover/pause/focus/offscreen controls, keyboard/manual selection, reduced motion, fallback, real images, 320-1440px. Screenshots: ' + screenshots);
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); await server.httpServer.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
