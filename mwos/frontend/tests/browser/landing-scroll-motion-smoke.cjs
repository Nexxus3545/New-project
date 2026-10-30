// Rendered scroll behavior with synthetic public feedback; no account writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4191, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  const settle = async page => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  async function fixture(mode = 'native', width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
    if (['fallback', 'unsupported'].includes(mode)) await context.addInitScript(mode => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => args[0].includes('animation-timeline') ? false : supports(...args);
      if (mode === 'unsupported') window.IntersectionObserver = undefined;
    }, mode);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/api/')) return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, data: { totalReviews: 1, recent: [{ id: 'synthetic-review', rating: 4, display_name: 'Synthetic reviewer', comment: 'Synthetic public feedback for animation testing.' }] } }) });
      return url.origin === 'http://127.0.0.1:4191' ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4191/');
    await page.getByRole('heading', { level: 1, name: 'Expert care for you. A loving start for your baby.' }).waitFor();
    await page.getByText('Synthetic public feedback for animation testing.', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    return { context, page };
  }
  const alpha = locator => locator.evaluate(e => Number(getComputedStyle(e).opacity));
  const move = async (page, y) => { await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y); await settle(page); };
  try {
    const { page, context } = await fixture();
    assert.equal(await page.locator('.clinic-landing').getAttribute('data-scroll-motion'), 'native');
    assert.equal(await page.locator('.clinic-header[data-scroll-reveal]').count(), 0);
    const card = page.locator('.clinic-service').first();
    const layout = await card.evaluate(e => ({ top: e.offsetTop, height: e.offsetHeight }));
    const headerTop = (await page.locator('.clinic-header').boundingBox()).y;
    await move(page, layout.top - 950);
    assert.ok(await alpha(card) < 0.8, 'A card fades in as it enters the lower edge');
    await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-scroll-enter.png') });
    await move(page, layout.top - 350);
    assert.ok(await alpha(card) > 0.98, 'Reading area is fully opaque');
    await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-scroll-reading.png') });
    await move(page, layout.top + layout.height - 30);
    assert.ok(await alpha(card) < 0.8, 'The same card fades out near the upper edge');
    assert.ok(Math.abs((await page.locator('.clinic-header').boundingBox()).y - headerTop) < 1, 'Navigation stays fixed');
    await card.getByRole('link').focus();
    assert.equal(await alpha(card), 1, 'Keyboard focus never remains faded');
    await card.getByRole('link').evaluate(e => e.blur());
    await move(page, layout.top - 350);
    assert.ok(await alpha(card) > 0.98, 'Scrolling back restores the same content');
    assert.equal(await page.locator('.clinic-review[data-scroll-reveal]').count(), 1, 'Asynchronous feedback gets motion');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await alpha(card), 1, 'Printed content remains fully visible');
    await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
    await settle(page);
    assert.equal(await page.locator('[data-scroll-reveal]').count(), 0, 'Changing OS motion preference removes animations');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await settle(page);
    assert.equal(await page.locator('.clinic-landing').getAttribute('data-scroll-motion'), 'native');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await move(page, 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width);
      await page.locator('a[href="#care"]').first().evaluate(e => e.click());
      await settle(page);
      assert.ok(await alpha(page.locator('.clinic-section-top')) > 0.98, 'Anchor headings remain readable');
      if (width === 390) await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-scroll-phone.png') });
    }
    await context.close();

    const fallback = await fixture('fallback');
    assert.equal(await fallback.page.locator('.clinic-landing').getAttribute('data-scroll-motion'), 'fallback');
    const fallbackCard = fallback.page.locator('.clinic-service').first();
    await fallbackCard.scrollIntoViewIfNeeded();
    await fallback.page.waitForFunction(() => document.querySelector('.clinic-service').dataset.revealState === 'visible');
    await fallback.page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.clinic-service')).opacity) > 0.98);
    assert.ok(await alpha(fallbackCard) > 0.98);
    const fallbackBox = await fallbackCard.evaluate(e => ({ top: e.getBoundingClientRect().top + scrollY, height: e.offsetHeight }));
    await move(fallback.page, fallbackBox.top + fallbackBox.height + 150);
    await fallback.page.waitForFunction(() => document.querySelector('.clinic-service').dataset.revealState === 'above');
    await fallback.page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.clinic-service')).opacity) < 0.1);
    assert.ok(await alpha(fallbackCard) < 0.1, 'Fallback also fades on exit: ' + JSON.stringify(await fallbackCard.evaluate(e => ({ opacity: getComputedStyle(e).opacity, transition: getComputedStyle(e).transition, animation: getComputedStyle(e).animationName, state: e.dataset.revealState, focused: e.matches(':focus-within') }))));
    await fallbackCard.scrollIntoViewIfNeeded();
    await fallbackCard.getByRole('link').focus();
    assert.equal(await alpha(fallbackCard), 1);
    await fallback.page.goto('http://127.0.0.1:4191/login');
    assert.equal(await fallback.page.locator('[data-scroll-motion]').count(), 0, 'Motion is scoped to the public homepage');
    await fallback.context.close();

    for (const mode of ['reduced', 'unsupported']) {
      const app = await fixture(mode, 390);
      assert.equal(await app.page.locator('[data-scroll-motion]').count(), 0);
      assert.equal(await alpha(app.page.locator('.clinic-service').first()), 1, mode + ' keeps content visible');
      await app.context.close();
    }
    assert.deepEqual(errors, []);
    console.log('Scroll motion passed: actual fade in/out, reverse scrolling, fixed header, readable focus/anchors, dynamic reviews, print, reduced motion, fallback, cleanup and 320–1440px layouts.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
