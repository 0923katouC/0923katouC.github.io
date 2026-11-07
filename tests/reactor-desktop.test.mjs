import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopAudioInput } from '../projects/ai/reactor/desktop-audio.mjs';

function helper() {
  const calls = [];
  let running = true;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    let body = path === '/status' ? { app:'CMC Reactor Audio', protocol:1, token:'test-token' }
      : path === '/start' ? { session:'test-session' }
      : path === '/frame' ? { running, starting:false, error:'', bins:Array(1024).fill(80), energy:.2, sampleRate:48000 }
      : { stopped:true };
    return { ok:true, status:200, json:async () => body };
  };
  return { calls, fetchImpl, end:() => { running = false; } };
}

test('native connection uses authenticated local spectrum data and releases its session', async () => {
  const server = helper();
  const audio = new DesktopAudioInput({ fetchImpl:server.fetchImpl });
  assert.equal(await audio.start(), true);
  assert.equal(audio.bins[20], 80);
  assert.equal(audio.energy, .2);
  assert.equal(audio.sampleRate, 48000);
  assert.equal(server.calls.find(c => c.path === '/frame').options.headers['X-Reactor-Session'], 'test-session');
  assert.equal(server.calls.find(c => c.path === '/start').options.headers['X-Reactor-Token'], 'test-token');
  audio.stop();
  assert.equal(server.calls.at(-1).path, '/stop');
  assert.equal(server.calls.at(-1).options.keepalive, true);
  assert.equal(audio.bins[20], 0);
});

test('unavailable helper gives a launch instruction without requesting browser capture', async () => {
  const audio = new DesktopAudioInput({ fetchImpl:async () => { throw new TypeError('Network error'); } });
  await assert.rejects(audio.start(), /打开“声场反应堆接入器”/);
  assert.equal(audio.session, null);
});

test('cancelled handshake never starts a native capture', async () => {
  let resolve;
  const calls = [];
  const audio = new DesktopAudioInput({ fetchImpl:(url) => { calls.push(url); return new Promise(r => { resolve = r; }); } });
  const start = audio.start();
  audio.stop();
  resolve({ ok:true, status:200, json:async () => ({ app:'CMC Reactor Audio', protocol:1, token:'test-token' }) });
  assert.equal(await start, false);
  assert.equal(calls.length, 1);
});

test('native stop is reflected in the page and invalid spectra are rejected', async () => {
  const server = helper();
  let ended;
  const finished = new Promise(resolve => { ended = resolve; });
  const audio = new DesktopAudioInput({ fetchImpl:server.fetchImpl, onEnded:ended });
  await audio.start(); server.end();
  assert.match(await finished, /已停止/);
  assert.equal(audio.session, null);
  assert.throws(() => audio.applyFrame({ bins:[300], energy:Infinity, sampleRate:0 }), /数据不完整/);
});
