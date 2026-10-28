// Uses the workflow's isolated Playwright installation, not the user's browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.ODD_SITE_URL || 'http://127.0.0.1:8765';
const artifacts = new URL('../artifacts/odd-projects/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();
const results = [];

async function setNumber(page, id, value) {
  await page.locator('#' + id).fill(String(value));
  await page.locator('#' + id).press('Tab');
}
async function screenshot(page, name) {
  await page.screenshot({ path: new URL(name + '.png', artifacts).pathname, fullPage: true });
  // Compact visual proof is also retrievable through the connector's job-log API.
  const image = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
  console.log('ORBIT_VISUAL:' + name + ':' + image.toString('base64'));
}
async function layout(page) {
  const size = await page.evaluate(() => ({
    width: innerWidth, document: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]),
  }));
  assert.ok(size.document <= size.width + 1, JSON.stringify(size));
  assert.ok(size.canvas.every(([w, h]) => w > 0 && h > 0));
}
try {
  for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: viewport.width < 500, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) failed.push(r.url()); });
    await page.goto(base + '/projects/pond/orbits/');
    await page.waitForFunction(() => document.querySelector('#eccentricity').textContent !== '—');
    await layout(page);
    assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false', 'Reduced motion starts paused');
    assert.equal(await page.locator('#pin-count').innerText(), '2 / 5');
    await screenshot(page, viewport.width > 500 ? 'orbits-desktop' : 'orbits-mobile');

    for (const [kind, expected] of [['circle', '圆'], ['ellipse', '椭圆'], ['parabola', '抛物线'], ['hyperbola', '双曲线']]) {
      await page.locator('[data-preset="' + kind + '"]').click();
      assert.ok((await page.locator('#orbit-kind').innerText()).startsWith(expected));
      assert.equal(await page.locator('#invalid-overlay').isVisible(), false);
      if (kind === 'circle') assert.equal(await page.locator('#eccentricity').innerText(), '0.000');
      if (kind === 'parabola' || kind === 'hyperbola') {
        assert.equal(await page.locator('#apoapsis').innerText(), '∞');
        assert.equal(await page.locator('#period').innerText(), '—');
      }
    }
    await setNumber(page, 'energy-value', -1.5);
    await setNumber(page, 'momentum-value', 2.5);
    assert.equal(await page.locator('#invalid-overlay').isVisible(), true);
    assert.equal(await page.locator('#play').isEnabled(), false);
    await page.locator('#circular').click();
    assert.equal(await page.locator('#eccentricity').innerText(), '0.000');
    assert.equal(await page.locator('#invalid-overlay').isVisible(), false);

    await page.locator('[data-preset="ellipse"]').click();
    await page.locator('#clear').click();
    await page.locator('#pin').click();
    assert.equal(await page.locator('#pin-count').innerText(), '1 / 5');
    await page.locator('#pin').click();
    assert.equal(await page.locator('#pin-count').innerText(), '1 / 5', 'No duplicate pins');
    for (const L of [0.7, 0.8, 0.9, 1.1]) {
      await setNumber(page, 'momentum-value', L); await page.locator('#pin').click();
    }
    assert.equal(await page.locator('#pin-count').innerText(), '5 / 5');
    assert.equal(await page.locator('#pin').isEnabled(), false);
    await page.getByRole('button', { name: '移除轨道 1', exact: true }).click();
    assert.equal(await page.locator('#pin-count').innerText(), '4 / 5');
    await page.locator('#family').click();
    assert.equal(await page.locator('#pin-count').innerText(), '4 / 5');
    const family = await page.locator('.pin-row span').allTextContents();
    assert.ok(family.every(s => s.includes('E -0.35')));
    await page.locator('#fit').click();
    await screenshot(page, viewport.width > 500 ? 'orbits-family-desktop' : 'orbits-family-mobile');

    const energy = Number(await page.locator('#energy-value').inputValue());
    await page.locator('#el-canvas').focus(); await page.keyboard.press('ArrowUp');
    assert.ok(Math.abs(Number(await page.locator('#energy-value').inputValue()) - energy - 0.01) < 1e-6);
    const box = await page.locator('#el-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.25);
    assert.ok(Number(await page.locator('#energy-value').inputValue()) > 0);
    await page.locator('[data-preset="ellipse"]').click();
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#time-label').textContent.split('=')[1]) > 0.05);
    await page.locator('#play').click();
    const paused = await page.locator('#time-label').innerText();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#time-label').innerText(), paused);
    await page.locator('#phase').evaluate(el => { el.value = '750'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
    assert.ok(Number((await page.locator('#time-label').innerText()).split('=')[1]) > 0);
    await page.locator('#speed').selectOption('4');
    await page.locator('#restart').click();
    assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'true');
    await page.locator('#play').click();

    // Open trajectories end at the display window rather than teleporting.
    await page.locator('[data-preset="hyperbola"]').click();
    await page.locator('#phase').evaluate(el => { el.value = '999'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#speed').selectOption('12');
    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-pressed') === 'false');
    assert.match(await page.locator('#feedback').innerText(), /边界/);

    // Every edge of the slider domain must remain finite or explicitly forbidden.
    for (const E of [-1.5, -0.001, 0, 0.001, 1]) {
      for (const L of [0.25, 2.5]) {
        await setNumber(page, 'energy-value', E); await setNumber(page, 'momentum-value', L);
        assert.doesNotMatch(await page.locator('.readouts').innerText(), /NaN/);
      }
    }
    await page.setViewportSize({ width: 320, height: 844 }); await layout(page);
    await page.goto(base + '/projects/pond/');
    await page.locator('a[href="/projects/pond/orbits/"]').waitFor();
    assert.ok(await page.locator('a[href="/projects/pond/black-hole.html"]').isVisible());
    await layoutDirectory(page);
    await page.locator('.lang-switch').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('a[href="/projects/pond/orbits/"]').click();
    await page.waitForFunction(() => document.querySelector('#eccentricity').textContent !== '—');
    assert.deepEqual(errors, [], 'No runtime or CSP errors');
    assert.deepEqual(failed, [], 'No missing assets');
    results.push({ viewport, passed: true });
    await context.close();
  }
  console.log('ORBIT_BROWSER_RESULTS:' + JSON.stringify(results));
  await writeFile(new URL('orbits-results.json', artifacts), JSON.stringify(results, null, 2));
} finally { await browser.close(); }

async function layoutDirectory(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const images = await page.locator('img').evaluateAll(imgs => imgs.map(i => i.complete && i.naturalWidth > 0));
  assert.ok(images.every(Boolean), 'Both experiment cover images load');
}
