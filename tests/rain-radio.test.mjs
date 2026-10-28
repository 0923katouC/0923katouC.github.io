import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STATIONS, MAX_VOLUME, defaultPreferences, restorePreferences, stationAt, stationIndex, nearestStation, tune, nextBroadcast, toggleFavorite, remainingSeconds, formatDuration, makeNoise } from '../projects/toys/rain-radio/model.mjs';
import { RadioAudio } from '../projects/toys/rain-radio/audio.mjs';

test('eight unique stations each have three distinct broadcasts and restrained synthesis parameters', () => {
  assert.equal(STATIONS.length, 8);
  assert.equal(new Set(STATIONS.map(s => s.id)).size, 8);
  assert.equal(new Set(STATIONS.map(s => s.frequency)).size, 8);
  const lines = STATIONS.flatMap(s => s.lines);
  assert.equal(new Set(lines).size, 24);
  for (const station of STATIONS) {
    assert.ok(station.frequency >= 88 && station.frequency <= 108);
    assert.ok(station.name.length && station.subtitle.length);
    assert.equal(station.lines.length, 3);
    assert.ok(station.lines.every(line => line.length >= 30));
    assert.equal(station.sound.chord.length, 4);
    assert.ok(station.sound.chord.every(f => f >= 80 && f <= 400));
    assert.ok(station.sound.noise > 0 && station.sound.noise <= .2);
    assert.ok(station.sound.cutoff >= 400 && station.sound.cutoff <= 2200);
    assert.ok(station.sound.swell >= .02 && station.sound.swell <= .2);
    assert.ok(station.sound.detune <= 4);
  }
});
test('tuning wraps around both ends and invalid values use the first station', () => {
  assert.equal(stationAt(-1).id, 'snow'); assert.equal(stationAt(8).id, 'store');
  assert.equal(stationAt(15).id, 'snow'); assert.equal(stationAt(Infinity).id, 'store');
  assert.equal(stationAt('bad').id, 'store'); assert.equal(stationIndex('missing'), 0);
  assert.equal(nearestStation(94), 2); assert.equal(nearestStation(NaN), 0);
});
test('tuning records discoveries without duplicates and broadcasts cycle independently', () => {
  const prefs = defaultPreferences();
  tune(prefs, 2); assert.equal(nextBroadcast(prefs), STATIONS[2].lines[1]);
  tune(prefs, 3); nextBroadcast(prefs); tune(prefs, 2);
  assert.equal(prefs.lines.roof, 1); assert.equal(prefs.lines.tram, 1);
  assert.equal(nextBroadcast(prefs), STATIONS[2].lines[2]);
  assert.equal(nextBroadcast(prefs), STATIONS[2].lines[0]);
  assert.deepEqual(prefs.discovered, ['store', 'roof', 'tram']);
});
test('favorites toggle locally without changing the current station', () => {
  const prefs = defaultPreferences();
  assert.equal(toggleFavorite(prefs), true); assert.deepEqual(prefs.favorites, ['store']);
  tune(prefs, 4); toggleFavorite(prefs); assert.deepEqual(prefs.favorites, ['store', 'garden']);
  assert.equal(toggleFavorite(prefs), false); assert.equal(prefs.station, 'garden');
});
test('restoring corrupt or obsolete storage keeps safe quiet defaults', () => {
  for (const value of [null, [], 'bad', { version: 7 }, { playing: true }]) {
    assert.deepEqual(restorePreferences(value), defaultPreferences());
  }
  const p = restorePreferences({ version: 1, station: 'alien', volume: Infinity, timerMinutes: -1, favorites: 'invalid', lines: { store: -1 } });
  assert.equal(p.station, 'store'); assert.equal(p.volume, .3); assert.equal(p.timerMinutes, 0);
  assert.deepEqual(p.favorites, []); assert.equal(p.lines.store, 0);
  assert.equal('playing' in p, false);
});
test('restored preferences filter station IDs, deduplicate, clamp volume and normalize lines', () => {
  const p = restorePreferences({ version: 1, station: 'moon', volume: 9, timerMinutes: 30, favorites: ['sea', 'sea', 'bad', 1], discovered: ['store', 'store'], lines: { moon: 8, sea: 1.5, store: '1' }, playing: true });
  assert.equal(p.volume, MAX_VOLUME); assert.equal(p.timerMinutes, 30);
  assert.deepEqual(p.favorites, ['sea']); assert.deepEqual(p.discovered, ['store', 'moon']);
  assert.equal(p.lines.moon, 2); assert.equal(p.lines.sea, 0); assert.equal(p.lines.store, 0);
  assert.equal('playing' in p, false);
  assert.equal(restorePreferences({ version: 1, volume: -2 }).volume, 0);
});
test('sleep timer measures wall time and handles expiration precisely', () => {
  assert.equal(remainingSeconds(1801000, 1000), 1800);
  assert.equal(remainingSeconds(1801000, 1800999), 1);
  assert.equal(remainingSeconds(1801000, 1801000), 0);
  assert.equal(remainingSeconds(1801000, 1900000), 0);
  assert.equal(remainingSeconds(0, 1000), 0);
  assert.equal(formatDuration(1800), '30:00'); assert.equal(formatDuration(59.9), '00:59');
  assert.equal(formatDuration(-9), '00:00');
});
test('noise synthesis is deterministic, bounded and smoothly looped', () => {
  const a = makeNoise(48000), b = makeNoise(48000), c = makeNoise(48000, 18);
  assert.deepEqual(a, b); assert.notDeepEqual(a.slice(0, 10), c.slice(0, 10));
  assert.ok(a.every(n => Number.isFinite(n) && Math.abs(n) <= 1));
  assert.equal(a[0], a.at(-1));
  const rms = Math.sqrt(a.reduce((sum, n) => sum + n * n, 0) / a.length);
  assert.ok(rms > .1 && rms < .5);
});

function parameter() { return { value: 0, cancelScheduledValues() {}, setTargetAtTime(value) { this.value = value; } }; }
class FakeNode {
  constructor(context, source = false) {
    this.context = context; this.source = source; this.disconnected = false; this.started = false; this.stopped = false;
    for (const name of ['gain', 'frequency', 'detune', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = parameter();
    context.nodes.push(this);
  }
  connect() {} disconnect() { this.disconnected = true; }
  start() { if (this.context.failSource && this.source) throw new Error('source unavailable'); this.started = true; }
  stop() { this.stopped = true; }
}
class FakeContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 8000; this.currentTime = 0; this.nodes = []; this.destination = {}; this.resumes = 0; this.suspends = 0; }
  async resume() { this.resumes++; this.state = 'running'; }
  async suspend() { this.suspends++; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createGain() { return new FakeNode(this); }
  createDynamicsCompressor() { return new FakeNode(this); }
  createBiquadFilter() { return new FakeNode(this); }
  createBufferSource() { return new FakeNode(this, true); }
  createOscillator() { return new FakeNode(this, true); }
  createBuffer(channels, length) { return { length, copyToChannel() {} }; }
}
test('construction, volume changes and pause never acquire an audio device', async () => {
  let acquisitions = 0;
  const radio = new RadioAudio(() => { acquisitions++; return new FakeContext(); });
  radio.setVolume(.5); await radio.pause();
  assert.equal(acquisitions, 0); assert.equal(radio.context, null); assert.equal(radio.playing, false);
});
test('explicit start creates restrained nodes, pause releases them, and volume is clamped', async () => {
  const ctx = new FakeContext(), radio = new RadioAudio(() => ctx);
  assert.equal(await radio.start(STATIONS[0], .3), true);
  assert.equal(radio.graph.sources.length, 6); assert.equal(radio.playing, true);
  assert.equal(radio.graph.master.gain.value, .3 * .45);
  radio.setVolume(2); assert.equal(radio.graph.master.gain.value, .7 * .45);
  radio.setVolume(-1); assert.equal(radio.graph.master.gain.value, 0);
  const sources = [...radio.graph.sources]; await radio.pause();
  assert.ok(sources.every(n => n.stopped && n.disconnected));
  assert.equal(radio.graph, null); assert.equal(radio.playing, false); assert.equal(ctx.state, 'suspended');
});
test('changing stations disposes the previous graph and reuses one context', async () => {
  let count = 0; const ctx = new FakeContext(); const radio = new RadioAudio(() => { count++; return ctx; });
  await radio.start(STATIONS[0], .3); const previous = radio.graph;
  await radio.start(STATIONS[5], .2);
  assert.equal(count, 1); assert.ok(previous.sources.every(n => n.stopped));
  assert.equal(radio.graph.sources[2].frequency.value, STATIONS[5].sound.chord[0]);
  await radio.destroy(); assert.equal(ctx.state, 'closed'); assert.equal(radio.context, null);
});
test('concurrent starts let the latest station win without suspending its context', async () => {
  const ctx = new FakeContext(), pending = [];
  ctx.resume = () => new Promise(resolve => pending.push(() => { ctx.state = 'running'; resolve(); }));
  const radio = new RadioAudio(() => ctx);
  const first = radio.start(STATIONS[0], .3), second = radio.start(STATIONS[4], .3);
  pending.forEach(resolve => resolve());
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(ctx.suspends, 0); assert.equal(radio.playing, true);
  assert.equal(radio.graph.sources[2].frequency.value, STATIONS[4].sound.chord[0]);
  await radio.pause();
});
test('a pause cancels a pending start so it cannot create audible sources afterwards', async () => {
  const ctx = new FakeContext(); let resume;
  ctx.resume = () => new Promise(resolve => { resume = () => { ctx.state = 'running'; resolve(); }; });
  const radio = new RadioAudio(() => ctx), pending = radio.start(STATIONS[0], .3);
  await radio.pause(); resume(); assert.equal(await pending, false);
  assert.equal(radio.playing, false); assert.equal(radio.graph, null);
  assert.equal(ctx.nodes.filter(n => n.source && n.started).length, 0);
});
test('an older pending pause does not dispose a newer successful graph', async () => {
  const ctx = new FakeContext(), radio = new RadioAudio(() => ctx);
  await radio.start(STATIONS[0], .3);
  let finishPause; ctx.suspend = () => new Promise(resolve => { finishPause = resolve; });
  const pausing = radio.pause();
  await radio.start(STATIONS[1], .3); const latest = radio.graph;
  finishPause(); await pausing;
  assert.equal(radio.graph, latest); assert.equal(radio.playing, true);
  assert.ok(latest.sources.every(n => !n.stopped));
});
test('failed audio creation or resume is reported and leaves no graph playing', async () => {
  const missing = new RadioAudio(() => { throw new Error('unsupported'); });
  await assert.rejects(missing.start(STATIONS[0], .3), /unsupported/);
  assert.equal(missing.playing, false);
  const ctx = new FakeContext(), radio = new RadioAudio(() => ctx);
  ctx.resume = async () => { throw new Error('not allowed'); };
  await assert.rejects(radio.start(STATIONS[0], .3), /not allowed/);
  assert.equal(radio.graph, null); assert.equal(radio.playing, false);
});
test('partial source creation failure disconnects all allocated audio nodes', async () => {
  const ctx = new FakeContext(), radio = new RadioAudio(() => ctx); ctx.failSource = true;
  await assert.rejects(radio.start(STATIONS[0], .3), /source unavailable/);
  assert.ok(ctx.nodes.length > 0); assert.ok(ctx.nodes.every(node => node.disconnected));
  assert.equal(ctx.state, 'suspended'); assert.equal(radio.playing, false);
});
test('HTML uses a restrictive policy and external module with no remote resources', async () => {
  const html = await readFile(new URL('../projects/toys/rain-radio/index.html', import.meta.url), 'utf8');
  assert.match(html, /script-src 'self'/); assert.match(html, /style-src 'self'/);
  assert.match(html, /type="module" src="\.\/app\.mjs/);
  assert.doesNotMatch(html, /https?:\/\/|\son\w+\s*=|\sstyle\s*=|autoplay/i);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('mobile-volume')); assert.ok(ids.includes('sleep'));
});
