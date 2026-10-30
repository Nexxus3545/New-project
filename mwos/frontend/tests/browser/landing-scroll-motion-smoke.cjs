// Public homepage only; synthetic feedback and no account writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.MWOS_PLAYWRIGHT_MODULE || 'C:/Users/shane/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const { preview } = await import('vite');
  const server = await preview({ configFile: false, root: path.resolve(__dirname, '../..'), preview: { host: '127.0.0.1', port: 4191, strictPort: true } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MWOS_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [];
  const sections = '#main-content > section:not(.clinic-public-hero)';
  async function fixture(reducedMotion = 'no-preference') {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion, serviceWorkers: 'block' });
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
    return { page, context };
  }
  const settled = (page, index) => page.waitForFunction(({ selector, index }) => [...document.querySelectorAll(selector)].every((node, i) => {
    const opacity = Number(getComputedStyle(node).opacity);
    return i === index ? node.dataset.sectionState === 'active' && opacity === 1 : node.dataset.sectionState !== 'active' && opacity === 0;
  }), { selector: sections, index });
  async function scrollToSection(page, index) {
    await page.mouse.wheel(0, 1);
    await page.locator(sections).nth(index).evaluate(node => {
      let top = 0;
      for (let current = node; current; current = current.offsetParent) top += current.offsetTop;
      const header = document.querySelector('.clinic-header').offsetHeight;
      window.scrollTo({ top: top + 30 - (header + (innerHeight - header) * 0.38), behavior: 'instant' });
    });
    await settled(page, index);
  }
  const headerSettled = (page, visible) => page.waitForFunction(visible => {
    const node = document.querySelector('.clinic-header');
    return Number(getComputedStyle(node).opacity) === (visible ? 1 : 0)
      && node.dataset.headerState === (visible ? 'visible' : 'hidden');
  }, visible);
  async function returnToTop(page) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Control+Home');
    await headerSettled(page, true);
  }
  try {
    const { page, context } = await fixture();
    assert.equal(await page.locator('.clinic-landing').getAttribute('data-scroll-motion'), 'sections');
    assert.equal(await page.locator('[data-scroll-reveal]').count(), 0, 'Individual cards no longer fade independently');
    assert.equal(await page.locator('.clinic-header[data-scroll-section]').count(), 0);
    const count = await page.locator(sections).count();
    assert.equal(count, 8);
    const originalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const index of [...Array(count).keys(), ...Array.from({ length: count - 1 }, (_, i) => count - 2 - i)]) {
        await scrollToSection(page, index);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width);
        assert.equal(await page.locator('[data-section-state="active"]').count(), 1);
      }
      await scrollToSection(page, 1);
      await headerSettled(page, false);
      await page.mouse.wheel(0, -100);
      await headerSettled(page, true);
      await page.mouse.wheel(0, 160);
      await headerSettled(page, false);
      await page.screenshot({ path: path.join(process.env.TEMP, `mwos-scroll-header-${width}.png`) });
      // The footer supplies the logo; the top logo stays hidden even on a small upward scroll.
      await page.keyboard.press('Control+End');
      await headerSettled(page, false);
      await page.mouse.wheel(0, -30);
      await headerSettled(page, false);
      assert.equal(await page.locator('.clinic-footer').evaluate(e => getComputedStyle(e).opacity), '1');
      // Keyboard navigation can still reach a hidden header without scrolling with a mouse.
      await page.keyboard.press('Tab');
      await page.locator('.clinic-home-link').focus();
      await headerSettled(page, true);
      await returnToTop(page);
      if (width === 390) {
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
        await page.mouse.wheel(0, 180);
        await headerSettled(page, true);
        assert.equal(await page.locator('.clinic-menu-button').getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        await returnToTop(page);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const nav = page.getByRole('navigation', { name: 'Clinic navigation' });
    await nav.getByRole('link', { name: 'The clinic', exact: true }).click();
    await settled(page, 1);
    assert.equal(await page.locator('#care').evaluate(e => getComputedStyle(e).opacity), '0', 'All of Our Care disappears together');
    assert.equal(await page.locator('#care .clinic-service').first().getAttribute('data-scroll-section'), null);
    await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-whole-section-clinic.png') });
    await returnToTop(page);
    await nav.getByRole('link', { name: 'Downloads', exact: true }).click();
    await settled(page, 7);
    assert.equal(await page.locator('a[href="#downloads"][aria-current="location"]').count(), 1);
    await page.screenshot({ path: path.join(process.env.TEMP, 'mwos-whole-section-downloads.png') });
    await returnToTop(page);
    await nav.getByRole('link', { name: 'Our care', exact: true }).click();
    await settled(page, 0);
    await page.keyboard.press('Tab');
    await page.locator('#clinic .clinic-tour-play').focus();
    await settled(page, 1);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#clinic').getAttribute('data-section-state'), 'active', 'Using a focused control does not hide its section');
    await scrollToSection(page, 0);
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator(sections).evaluateAll(nodes => nodes.every(e => Number(getComputedStyle(e).opacity) === 1)), 'Print includes every section');
    assert.equal(await page.locator('.clinic-header').evaluate(e => getComputedStyle(e).opacity), '1', 'Print includes the header');
    await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.clinic-landing').dataset.scrollMotion);
    assert.equal(await page.locator('[data-scroll-section]').count(), 0);
    assert.equal(await page.locator('.clinic-header').getAttribute('data-header-state'), null);
    assert.ok(await page.locator(sections).evaluateAll(nodes => nodes.every(e => Number(getComputedStyle(e).opacity) === 1)));
    assert.ok(Math.abs(await page.evaluate(() => document.documentElement.scrollHeight) - originalHeight) < 25, 'Fading does not collapse the document');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('.clinic-landing').dataset.scrollMotion === 'sections');
    await page.goto('http://127.0.0.1:4191/login');
    assert.equal(await page.locator('[data-scroll-motion]').count(), 0);
    await context.close();
    const reduced = await fixture('reduce');
    assert.equal(await reduced.page.locator('[data-scroll-section]').count(), 0);
    await reduced.context.close();
    assert.deepEqual(errors, []);
    console.log('Scroll motion passed: all 8 sections in both directions on desktop/phone, header hides down and returns up, footer logo handoff, keyboard access, mobile menu, anchors, stable page height, print, reduced motion and route cleanup.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
