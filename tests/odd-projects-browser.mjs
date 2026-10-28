// Run in CI with an isolated Playwright installation. Never opens a desktop window.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const baseURL = process.env.ODD_SITE_URL || 'http://127.0.0.1:8765';
const artifactDir = new URL('../artifacts/odd-projects/', import.meta.url);
await mkdir(artifactDir, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const pages = [
  { name: 'projects', path: '/projects.html', links: ['/projects/games/', '/projects/toys/'], interact: switchDirectoryLanguage },
  { name: 'games', path: '/projects/games/', links: ['rain-reel', 'night-train', 'quota-arcade'].map(name => `/projects/games/${name}/`), interact: switchDirectoryLanguage },
  { name: 'toys', path: '/projects/toys/', links: ['rain-radio', 'odd-inventions'].map(name => `/projects/toys/${name}/`), interact: switchDirectoryLanguage },
  { name: 'rain-reel', path: '/projects/games/rain-reel/', interact: investigate },
  { name: 'night-train', path: '/projects/games/night-train/', interact: dispatchTrain },
  { name: 'quota-arcade', path: '/projects/games/quota-arcade/', interact: playQuota },
  { name: 'rain-radio', path: '/projects/toys/rain-radio/', interact: tuneRadio },
  { name: 'odd-inventions', path: '/projects/toys/odd-inventions/', interact: makeInvention },
];

async function checkLayout(page) {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
    overflowing: [...document.querySelectorAll('main *')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.right > innerWidth + 2 || box.left < -2);
    }).slice(0, 12).map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(element.className).replaceAll(' ', '.')}`),
  }));
  assert.ok(Math.max(layout.document, layout.body) <= layout.viewport + 2, `Horizontal overflow: ${JSON.stringify(layout)}`);
  assert.deepEqual(layout.brokenImages, [], 'Images must load');
}

async function switchDirectoryLanguage(page) {
  const originalViewport = page.viewportSize();
  const chineseHeading = await page.locator('h1').innerText();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  await page.locator('.lang-switch').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.notEqual(await page.locator('h1').innerText(), chineseHeading, 'The visible heading switches to English');
  await checkLayout(page);
  await page.setViewportSize({ width: 320, height: originalViewport.height });
  await checkLayout(page);
  await page.locator('.lang-switch').click();
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  assert.equal(await page.locator('h1').innerText(), chineseHeading);
  await checkLayout(page);
  await page.setViewportSize(originalViewport);
  await checkLayout(page);
}

async function emitVisual(page, name, screenshot) {
  // Also expose compact public-page images through the Actions log so they can be
  // inspected without opening the user's browser or downloading an artifact UI.
  const source = `data:image/png;base64,${screenshot.toString('base64')}`;
  const encoded = await page.evaluate(async source => {
    const picture = new Image();
    picture.src = source;
    await picture.decode();
    let width = Math.min(900, picture.naturalWidth);
    const canvas = document.createElement('canvas');
    let data;
    do {
      canvas.width = width;
      canvas.height = Math.round(picture.naturalHeight * width / picture.naturalWidth);
      canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL('image/jpeg', .65).split(',')[1];
      width = Math.max(1, Math.floor(width * .8));
    } while (data.length > 90000 && width > 1);
    return data;
  }, source);
  assert.ok(encoded.length <= 90000, 'Keep all eight visual log previews below 800 KB');
  await writeFile(new URL(`${name}-preview.jpg`, artifactDir), Buffer.from(encoded, 'base64'));
  console.log(`ODD_VISUAL:${name}:${encoded}`);
}

async function investigate(page) {
  await page.locator('#start').click();
  await page.locator('#game').waitFor({ state: 'visible' });
  await page.locator('[data-location="desk"]').click();
  await page.locator('[data-inspect="e01"]').click();
  await page.locator('#modal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#evidence-count').innerText(), /1\s*\/\s*12/);
  await page.locator('#close-modal').click();
  await page.locator('#notes').fill('浏览器验收：桌上的线索已收好。');
  await page.locator('[data-tab="evidence"]').click();
  await page.reload();
  await page.locator('#start').click();
  assert.match(await page.locator('#evidence-count').innerText(), /1\s*\/\s*12/);
  assert.equal(await page.locator('#notes').inputValue(), '浏览器验收：桌上的线索已收好。');
  for (const [location, clues] of Object.entries({ desk: ['e02', 'e03'], projection: ['e04', 'e05', 'e06'], tea: ['e07', 'e08', 'e09'], luggage: ['e10', 'e11'] })) {
    await page.locator(`[data-location="${location}"]`).click();
    for (const clue of clues) {
      await page.locator(`[data-inspect="${clue}"]`).click();
      await page.locator('#close-modal').click();
    }
  }
  assert.match(await page.locator('#evidence-count').innerText(), /11\s*\/\s*12/);
  async function deduce(id, first, second) {
    await page.locator('[data-tab="deduce"]').click();
    const form = page.locator(`form[data-deduction="${id}"]`);
    await form.locator('[name="first"]').selectOption(first);
    await form.locator('[name="second"]').selectOption(second);
    await form.getByRole('button', { name: '连接证据 →' }).click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#modal-title').innerText(), '这两条线索对上了。');
    await page.locator('#close-modal').click();
  }
  await deduce('d01', 'e07', 'e08');
  await deduce('d02', 'e04', 'e11');
  await page.locator('[data-tab="people"]').click();
  await page.locator('[data-person="shen"][data-question="shen-open"]').click();
  await page.locator('#close-modal').click();
  assert.match(await page.locator('#evidence-count').innerText(), /12\s*\/\s*12/);
  await deduce('d03', 'e02', 'e12');
  await page.locator('[data-tab="accuse"]').click();
  await page.locator('#culprit').selectOption('shen');
  await page.locator('#method').selectOption('recording');
  await page.locator('#proof').selectOption('e12');
  await page.locator('#accusation-form button[type="submit"]').click();
  await page.locator('#modal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#modal-title').innerText(), '雨停之前，故事有了结尾。');
  await page.locator('#close-modal').click();
  assert.match(await page.locator('#view').innerText(), /故事找回了结尾/);
}

async function playQuota(page) {
  assert.equal(await page.locator('#hand [data-card]').count(), 3, 'Three playable cards are dealt');
  await page.locator('#hand [data-card]').first().click();
  assert.match(await page.locator('#turn-label').innerText(), /第 2 \/ 12 回合/);
  await page.locator('#undo').click();
  assert.match(await page.locator('#turn-label').innerText(), /第 1 \/ 12 回合/);
  await page.keyboard.press('1');
  assert.match(await page.locator('#turn-label').innerText(), /第 2 \/ 12 回合/);
  await page.reload();
  assert.match(await page.locator('#turn-label').innerText(), /第 2 \/ 12 回合/);
  await page.locator('#help').click();
  await page.locator('#dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#dialog-body').innerText(), /40–50/);
  await page.locator('#dialog-close').click();
  await page.locator('#new-game').click();
  await page.locator('#new-seed').fill('NIGHT-045');
  await page.locator('#new-mode').selectOption('cozy');
  await page.getByRole('button', { name: '开始新夜班', exact: true }).click();
  assert.match(await page.locator('#seed-label').innerText(), /NIGHT-045/);
  assert.match(await page.locator('#turn-label').innerText(), /第 1 \/ 12 回合/);
  assert.equal(await page.locator('#quota').innerText(), '100');
  // A fixed, human-playable route exercises the entire run without injecting state.
  for (const card of ['focus', 'sweep', 'polish', 'cool', 'burst', 'cool', 'focus', 'shield', 'sweep', 'cool', 'burst', 'cool']) {
    await page.locator(`#hand [data-card="${card}"]`).click();
  }
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.match(await page.locator('#result').getAttribute('class'), /\bwin\b/);
  assert.equal(await page.locator('#quota').innerText(), '41');
  await page.locator('#result-undo').click();
  assert.match(await page.locator('#turn-label').innerText(), /第 12 \/ 12 回合/);
  await page.locator('#hand [data-card="cool"]').click();
  await page.locator('#result.win').waitFor({ state: 'visible' });
}

async function dispatchTrain(page) {
  assert.equal(await page.locator('#levels [data-level]').count(), 10, 'All ten lines are available');
  const tile = page.locator('#board [data-index][aria-disabled="false"]').first();
  await tile.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#moves').innerText(), '01', 'Keyboard can rotate a track');
  await page.locator('#undo').click();
  assert.equal(await page.locator('#moves').innerText(), '00');
  await page.locator('#dispatch').click();
  await page.waitForFunction(() => !document.getElementById('dispatch').disabled);
  assert.equal(await page.locator('#win-panel').isVisible(), false, 'An unconnected line cannot win');
  for (let attempt = 0; attempt < 24; attempt++) {
    await page.locator('#hint').click();
    if ((await page.locator('#status').innerText()).includes('轨道已经连通')) break;
  }
  assert.match(await page.locator('#status').innerText(), /轨道已经连通/);
  await page.locator('#dispatch').click();
  await page.locator('#win-panel').waitFor({ state: 'visible' });
  assert.match(await page.locator('#completed-label').innerText(), /1 \/ 10/);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#win-panel').waitFor({ state: 'visible' });
  assert.match(await page.locator('#completed-label').innerText(), /1 \/ 10/);
  await page.locator('#reset').click();
  await page.locator('#confirm').waitFor({ state: 'visible' });
  await page.locator('#cancel-reset').click();
  assert.equal(await page.locator('#win-panel').isVisible(), true, 'Cancelling reset preserves completion');
  await page.locator('#next').click();
  assert.match(await page.locator('#line-number').innerText(), /LINE 02/);
  assert.equal(await page.locator('#win-panel').isVisible(), false);
  assert.equal(await page.locator('#moves').innerText(), '00');
}

async function tuneRadio(page) {
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.__oddAudioContexts.length), 0, 'Opening the radio is silent');
  assert.equal(await page.locator('#stations [data-station]').count(), 8);
  const initialStation = await page.locator('#station-name').innerText();
  await page.locator('#next').click();
  assert.notEqual(await page.locator('#station-name').innerText(), initialStation);
  await page.locator('#tuner').focus();
  await page.keyboard.press('ArrowRight');
  const savedStation = await page.locator('#station-name').innerText();
  await page.locator('#favorite').click();
  assert.equal(await page.locator('#favorite').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#favorite-list').innerText(), new RegExp(savedStation));
  const firstBroadcast = await page.locator('#broadcast-text').innerText();
  await page.locator('#next-broadcast').click();
  assert.notEqual(await page.locator('#broadcast-text').innerText(), firstBroadcast);
  assert.equal(await page.evaluate(() => window.__oddAudioContexts.length), 0, 'Tuning and reading do not start audio');
  await page.locator('#sleep').selectOption('30');
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => window.__oddAudioContexts.some(audio => audio.state === 'running'));
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-pressed') === 'false' && window.__oddAudioContexts.every(audio => audio.state !== 'running'));
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-pressed') === 'true');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#station-name').innerText(), savedStation);
  assert.equal(await page.locator('#favorite').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false', 'Reload must never autoplay');
  assert.equal(await page.evaluate(() => window.__oddAudioContexts.length), 0);
}

async function makeInvention(page) {
  await page.locator('#blueprint svg').waitFor({ state: 'visible' });
  await page.locator('#problem').selectOption({ index: 1 });
  await page.locator('#material').selectOption({ index: 1 });
  await page.locator('#absurdity').focus();
  await page.keyboard.press('End');
  await page.locator('#custom-name').fill('午后 <灯> & 茶');
  await page.locator('.seed-details summary').click();
  await page.locator('#seed').fill('123456');
  await page.locator('#generate').click();
  assert.equal(await page.locator('#invention-title').innerText(), '午后 <灯> & 茶');
  assert.equal(await page.locator('#blueprint script').count(), 0);
  const title = await page.locator('#invention-title').innerText();
  const serial = await page.locator('#file-number').innerText();
  const blueprint = await page.locator('#blueprint').innerHTML();
  const sharedURL = page.url();
  assert.equal(new URL(sharedURL).searchParams.get('s'), '123456');
  await page.locator('#favorite').click();
  assert.equal(await page.locator('#favorites-list li').count(), 1);
  assert.equal(await page.locator('#favorite').isDisabled(), true);
  await page.locator('#remix').click();
  assert.notEqual(await page.locator('#file-number').innerText(), serial);
  await page.locator('[data-open-favorite]').first().click();
  assert.equal(await page.locator('#file-number').innerText(), serial);
  assert.equal(await page.locator('#blueprint').innerHTML(), blueprint, 'A saved invention restores exactly');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /^cmc-invention-.*\.svg$/);
  const exportPath = new URL(`invention-${page.viewportSize().width}.svg`, artifactDir).pathname;
  await download.saveAs(exportPath);
  assert.equal(await download.failure(), null);
  const svg = await readFile(exportPath, 'utf8');
  assert.match(svg, /<svg\b/);
  assert.match(svg, /&lt;灯&gt; &amp; 茶/);
  assert.doesNotMatch(svg, /<script\b/i);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
  await page.locator('#share').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('分享链接已复制'));
  const copiedURL = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copiedURL, sharedURL);
  await page.locator('#remix').click();
  await page.goto(copiedURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#invention-title').innerText(), title);
  assert.equal(await page.locator('#blueprint').innerHTML(), blueprint, 'A shared seed reproduces the exact blueprint');
  assert.equal(await page.locator('#favorites-list li').count(), 1, 'Favorites survive reload');
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    for (const spec of pages) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce', locale: 'zh-CN', acceptDownloads: true });
      if (spec.name === 'rain-radio') {
        // Observe real WebAudio state; no audio is created or resumed by the test itself.
        await context.addInitScript(() => {
          window.__oddAudioContexts = [];
          const NativeContext = window.AudioContext;
          if (NativeContext) window.AudioContext = new Proxy(NativeContext, {
            construct(target, args) {
              const audio = Reflect.construct(target, args);
              window.__oddAudioContexts.push(audio);
              return audio;
            },
          });
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(`JavaScript: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(`Console: ${message.text()}`);
      });
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin === new URL(baseURL).origin && response.status() >= 400 && url.pathname !== '/favicon.ico') errors.push(`HTTP ${response.status()}: ${url.pathname}`);
      });
      page.on('requestfailed', request => {
        if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`Request: ${request.url()} ${request.failure()?.errorText}`);
      });
      const name = `${viewport.name}-${spec.name}`;
      const visualPreview = ['night-train', 'quota-arcade', 'rain-radio', 'odd-inventions'].includes(spec.name);
      let visualEmitted = false;
      try {
        const response = await page.goto(`${baseURL}${spec.path}`, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, `${spec.path} should load`);
        await page.locator('main').waitFor({ state: 'visible' });
        assert.ok((await page.locator('h1').innerText()).trim(), 'Page has a visible heading');
        await checkLayout(page);
        for (const path of spec.links || []) {
          const link = page.locator(`a[href="${path}"]`).first();
          assert.ok(await link.isVisible(), `Directory entry is visible: ${path}`);
        }
        const initialScreenshot = await page.screenshot({ path: new URL(`${name}-initial.png`, artifactDir).pathname, fullPage: true, animations: 'disabled' });
        if (visualPreview) { await emitVisual(page, name, initialScreenshot); visualEmitted = true; }
        if (spec.interact) await spec.interact(page);
        await page.waitForLoadState('networkidle');
        await checkLayout(page);
        assert.deepEqual(errors, [], 'No browser errors or missing resources');
        await page.screenshot({ path: new URL(`${name}-played.png`, artifactDir).pathname, fullPage: true, animations: 'disabled' });
        results.push({ name, status: 'passed', screenshots: [`${name}-initial.png`, `${name}-played.png`] });
        console.log(`PASS ${name}`);
      } catch (error) {
        results.push({ name, status: 'failed', error: error.stack || String(error), browserErrors: errors, screenshots: [`${name}-failed.png`] });
        console.error(`FAIL ${name}: ${error.message}`);
        try {
          const failureScreenshot = await page.screenshot({ path: new URL(`${name}-failed.png`, artifactDir).pathname, fullPage: true, animations: 'disabled' });
          if (visualPreview && !visualEmitted) await emitVisual(page, name, failureScreenshot);
        } catch (screenshotError) { console.error(`Screenshot failed for ${name}: ${screenshotError.message}`); }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(new URL('results.json', artifactDir), `${JSON.stringify(results, null, 2)}\n`);
  const index = [
    '# Odd projects browser check',
    '',
    `Chromium, desktop 1440 × 1000 and mobile 390 × 844. ${results.filter(result => result.status === 'passed').length}/${results.length} checks passed.`,
    '',
    '| Page / viewport | Result | Screenshots |',
    '| --- | --- | --- |',
    ...results.map(result => `| ${result.name} | ${result.status} | ${result.screenshots.map(file => `[${file.endsWith('-initial.png') ? 'Initial' : file.endsWith('-played.png') ? 'After interaction' : 'Failure'}](${file})`).join(' · ')} |`),
    '',
    'See [results.json](results.json) for errors and [server.log](server.log) for resource requests.',
    '',
  ].join('\n');
  await writeFile(new URL('README.md', artifactDir), index);
}

const failed = results.filter(result => result.status === 'failed');
console.log(`${results.length - failed.length}/${results.length} desktop/mobile checks passed.`);
if (failed.length) process.exitCode = 1;
