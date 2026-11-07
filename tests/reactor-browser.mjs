// Run by GitHub Actions in an isolated, headless browser. No real audio is captured.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const baseURL = process.env.ODD_SITE_URL || 'http://127.0.0.1:8765';
const artifacts = new URL('../artifacts/odd-projects/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
let page;

function toneFile() {
  const rate = 44100, samples = rate * 2;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000), 44 + i * 2);
  return data;
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const state = window.captureTest = { calls: 0, kind: 'audio', streams: [], connections: new Map(), sources: [], contexts: [] };
    const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (target, ...args) {
      if (!state.connections.has(this)) state.connections.set(this, new Set());
      state.connections.get(this).add(target);
      return connect.call(this, target, ...args);
    };
    AudioNode.prototype.disconnect = function (...args) {
      if (args.length) state.connections.get(this)?.delete(args[0]);
      else state.connections.delete(this);
      return disconnect.apply(this, args);
    };
    const createSource = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (stream) {
      const source = createSource.call(this, stream);
      state.sources.push(source);
      return source;
    };
    state.makeStream = async audio => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      canvas.getContext('2d').fillRect(0, 0, 2, 2);
      const stream = canvas.captureStream(1);
      if (audio) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = 440;
        const destination = ctx.createMediaStreamDestination();
        const gain = ctx.createGain();
        gain.gain.value = 0.025; // Keep the tone below the analyser's saturation threshold.
        oscillator.connect(gain);
        gain.connect(destination);
        state.contexts.push(ctx);
        oscillator.start();
        await ctx.resume();
        stream.addTrack(destination.stream.getAudioTracks()[0]);
      }
      state.streams.push(stream);
      return stream;
    };
    navigator.mediaDevices.getDisplayMedia = options => {
      state.calls++;
      state.options = options;
      if (state.kind === 'denied') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      if (state.kind === 'pending') return new Promise(resolve => { state.resolve = resolve; });
      return state.makeStream(state.kind !== 'video');
    };
  });
  await page.goto(baseURL + '/projects/ai/reactor/');
  assert.equal(await page.evaluate(() => window.captureTest.calls), 0, 'No capture before a click');
  assert.equal(await page.locator('#renderer-error').isVisible(), false);
  const layout = await page.evaluate(() => ({
    height:innerHeight, document:document.documentElement.scrollHeight,
    header:document.querySelector('.site-header').getBoundingClientRect().bottom,
    stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),
    footer:document.querySelector('footer').getBoundingClientRect().toJSON(),
    back:document.querySelector('.project-back').getBoundingClientRect().toJSON(),
  }));
  assert.equal(layout.document, layout.height, 'Desktop page fits the window');
  assert.equal(layout.stage.top, layout.header, 'No gap above the canvas');
  assert.equal(layout.stage.bottom, layout.footer.top, 'No gap below the canvas');
  assert.equal(layout.footer.bottom, layout.height, 'Page fills the window');
  await page.locator('aside').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  assert.deepEqual(await page.locator('.project-back').evaluate(link => link.getBoundingClientRect().toJSON()), layout.back, 'Panel scrolling leaves back navigation fixed');
  assert.deepEqual(await page.locator('.stage').evaluate(stage => stage.getBoundingClientRect().toJSON()), layout.stage, 'Panel scrolling leaves the canvas in place');

  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  let nativeRunning = false, nativeStops = 0;
  await page.route('http://127.0.0.1:49321/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin':new URL(baseURL).origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'X-Reactor-Token, X-Reactor-Session' };
    if (request.method() === 'OPTIONS') { await route.fulfill({status:204, headers}); return; }
    let json;
    if (path === '/status') json = {app:'CMC Reactor Audio',protocol:1,token:'browser-test'};
    if (path === '/start') { nativeRunning = true; json = {session:'native-test'}; }
    if (path === '/stop') { nativeRunning = false; nativeStops++; json = {stopped:true}; }
    if (path === '/frame') {
      const bins = Array(1024).fill(0); bins[19] = 200;
      json = {running:nativeRunning,starting:false,error:'',bins,energy:.1,sampleRate:48000};
    }
    await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(json)});
  });
  await page.locator('#desktop').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 整机声音' && parseFloat(document.querySelector('#freq').textContent) > 410);
  assert.equal(await page.evaluate(() => window.captureTest.calls), 0, 'Native capture never opens a source picker');
  const nativeStopped = page.waitForResponse(response => response.url() === 'http://127.0.0.1:49321/stop');
  await page.locator('#desktop').click();
  await nativeStopped;
  await page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-pressed') === 'false');
  assert.ok(nativeStops > 0, 'The native helper receives a stop request');
  const connect = async () => {
    if (!await page.locator('#system').isVisible()) await page.locator('.capture-help summary').click();
    await page.locator('#system').click();
  };
  const running = () => page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 浏览器共享');
  const idle = () => page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-pressed') === 'false');
  const allStopped = () => page.evaluate(() => window.captureTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));

  await connect(); await running();
  await page.waitForFunction(() => {
    const frequency = parseFloat(document.querySelector('#freq').textContent);
    return frequency > 410 && frequency < 470 && parseFloat(document.querySelector('#level').textContent) > -50;
  });
  assert.equal(await page.locator('#volume').isEnabled(), false);
  assert.equal(await page.locator('#seek').isEnabled(), false);
  assert.equal(await page.evaluate(() => {
    const state = window.captureTest;
    const seen = new Set();
    function reachesSpeakers(node) {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node instanceof AudioDestinationNode) return true;
      return [...(state.connections.get(node) || [])].some(reachesSpeakers);
    }
    return state.sources.some(reachesSpeakers);
  }), false, 'Captured sound must not reach the speakers');
  await page.screenshot({ path: new URL('reactor-desktop.png', artifacts).pathname, fullPage: true });
  await connect(); await idle();
  assert.equal(await allStopped(), true, 'Stop releases audio and video');

  for (const kind of ['audio', 'video']) {
    await connect(); await running();
    await page.evaluate(kind => {
      const track = window.captureTest.streams.at(-1).getTracks().find(t => t.kind === kind);
      track.stop(); track.dispatchEvent(new Event('ended'));
    }, kind);
    await idle();
    assert.equal(await allStopped(), true);
    assert.match(await page.locator('#message').innerText(), /共享已结束/);
  }

  await page.evaluate(() => { window.captureTest.kind = 'video'; });
  await connect(); await idle();
  await page.waitForFunction(() => document.querySelector('#message').textContent.startsWith('没有收到声音'));
  assert.equal(await allStopped(), true, 'Video-only selections are cleaned up');

  await page.evaluate(() => { window.captureTest.kind = 'denied'; });
  await connect();
  await page.waitForFunction(() => document.querySelector('#message').textContent.startsWith('尚未允许共享'));
  await page.evaluate(() => { window.captureTest.kind = 'audio'; });
  await connect(); await running();
  await page.locator('#demo').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 演示信号');
  assert.equal(await allStopped(), true, 'Switching to demo ends capture');

  await page.evaluate(() => { window.captureTest.kind = 'pending'; });
  await connect();
  await page.waitForFunction(() => document.querySelector('#system').textContent === '取消共享');
  await page.locator('#demo').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 演示信号');
  await page.evaluate(async () => window.captureTest.resolve(await window.captureTest.makeStream(true)));
  await page.waitForFunction(() => window.captureTest.streams.at(-1).getTracks().every(t => t.readyState === 'ended'));
  assert.equal(await page.locator('#status').innerText(), '运行中 · 演示信号', 'A late capture cannot take over the demo');

  await page.evaluate(() => { window.captureTest.kind = 'pending'; });
  await connect();
  await page.locator('#system').click();
  await idle();
  await page.evaluate(async () => window.captureTest.resolve(await window.captureTest.makeStream(true)));
  await page.waitForFunction(() => window.captureTest.streams.at(-1).getTracks().every(t => t.readyState === 'ended'));

  await page.locator('#file').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: toneFile() });
  await page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 音频文件');
  assert.equal(await page.locator('#timeline').isVisible(), true);
  assert.equal(await page.locator('#volume').isEnabled(), true);
  await page.locator('#play').click(); await idle();
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === '运行中 · 音频文件');

  await page.evaluate(() => { window.captureTest.kind = 'audio'; });
  await connect(); await running();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await idle();
  assert.equal(await allStopped(), true, 'Leaving the page releases every track');

  await page.evaluate(() => { navigator.mediaDevices.getDisplayMedia = undefined; });
  await connect();
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('当前浏览器不能共享电脑声音'));

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#demo').click();
    await page.locator('.capture-help summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No overflow at ' + width);
    assert.equal(await page.locator('#renderer-error').isVisible(), false);
    if (width === 390) await page.screenshot({ path: new URL('reactor-mobile.png', artifacts).pathname, fullPage: true });
    await page.locator('.capture-help summary').click();
  }
  assert.deepEqual(errors, [], 'No browser or policy errors');
  await writeFile(new URL('reactor-results.json', artifacts), JSON.stringify({ status: 'passed', widths: [1440, 390, 320], checks: ['real tone analysis', 'no captured sound playback', 'stop', 'external end', 'missing audio', 'permission denial', 'retry', 'source switch', 'late capture', 'cancel', 'audio file', 'page exit', 'unsupported browser', 'responsive layout'] }, null, 2));
  console.log('PASS Reactor: audio analysis, capture lifecycle, local files and responsive layout');
} catch (error) {
  console.error('REACTOR_DIAGNOSTICS', await page?.evaluate(() => ({
    status: document.querySelector('#status')?.textContent,
    level: document.querySelector('#level')?.textContent,
    frequency: document.querySelector('#freq')?.textContent,
    message: document.querySelector('#message')?.textContent,
    contexts: window.captureTest?.contexts.map(ctx => ({ state: ctx.state, time: ctx.currentTime })),
    sources: window.captureTest?.sources.map(source => ({ state: source.context.state, time: source.context.currentTime })),
  })));
  console.error('BROWSER_ERRORS', errors);
  await page?.screenshot({ path: new URL('reactor-failure.png', artifacts).pathname, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
