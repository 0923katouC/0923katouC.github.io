import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemAudioCapture, captureErrorMessage } from '../projects/ai/reactor/capture.mjs';

class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; this.stops = 0; }
  stop() { this.stops++; this.readyState = 'ended'; }
  end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}
function stream(audio = true) {
  const tracks = [new Track('video'), ...(audio ? [new Track('audio')] : [])];
  return { getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === 'audio') };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('opens the picker synchronously and requests unprocessed system audio', async () => {
  let options;
  const selected = stream();
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia(value) { options = value; return Promise.resolve(selected); } } });
  const pending = capture.start();
  assert.equal(options.systemAudio, 'include');
  assert.equal(options.windowAudio, 'system');
  assert.equal(options.audio.echoCancellation, false);
  assert.equal(options.audio.suppressLocalAudioPlayback, false);
  assert.ok(options.video);
  assert.equal(await pending, selected);
  capture.stop();
  assert.ok(selected.getTracks().every(t => t.stops === 1));
});

test('video-only sharing is rejected and every track is released', async () => {
  const selected = stream(false);
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: async () => selected } });
  await assert.rejects(capture.start(), { name: 'MissingAudioError' });
  assert.ok(selected.getTracks().every(t => t.readyState === 'ended'));
  assert.equal(capture.stream, null);
});

test('an already ended audio track cannot be reported as connected', async () => {
  const selected = stream();
  selected.getAudioTracks()[0].end();
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: async () => selected } });
  await assert.rejects(capture.start(), { name: 'MissingAudioError' });
  assert.equal(selected.getTracks()[0].readyState, 'ended');
});

test('cancelling while the picker is open releases a late selection', async () => {
  const picker = deferred();
  const selected = stream();
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: () => picker.promise } });
  const pending = capture.start();
  capture.stop();
  picker.resolve(selected);
  assert.equal(await pending, null);
  assert.ok(selected.getTracks().every(t => t.stops === 1));
  assert.equal(capture.stream, null);
});

test('an older picker cannot replace a more recent connection', async () => {
  const first = deferred(), second = deferred();
  const oldStream = stream(), newStream = stream();
  let request = 0;
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: () => ++request === 1 ? first.promise : second.promise } });
  const oldPending = capture.start();
  const newPending = capture.start();
  second.resolve(newStream);
  assert.equal(await newPending, newStream);
  first.resolve(oldStream);
  assert.equal(await oldPending, null);
  assert.ok(oldStream.getTracks().every(t => t.stops === 1));
  assert.ok(newStream.getTracks().every(t => t.stops === 0));
  assert.equal(capture.stream, newStream);
  capture.stop();
});

for (const kind of ['audio', 'video']) {
  test(`ending the ${kind} track ends the whole session once`, async () => {
    const selected = stream();
    let ended = 0;
    const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: async () => selected }, onEnded: () => ended++ });
    await capture.start();
    selected.getTracks().find(t => t.kind === kind).end();
    selected.getTracks().forEach(t => t.end());
    assert.equal(ended, 1);
    assert.equal(capture.stream, null);
    assert.ok(selected.getTracks().every(t => t.stops === 1));
  });
}

test('stopping is idempotent and does not produce an external-ended notification', async () => {
  const selected = stream();
  let ended = 0;
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: async () => selected }, onEnded: () => ended++ });
  await capture.start();
  capture.stop(); capture.stop();
  selected.getTracks().forEach(t => t.end());
  assert.equal(ended, 0);
  assert.ok(selected.getTracks().every(t => t.stops === 1));
});

test('denied and unavailable capture provide actionable messages', async () => {
  const denied = Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
  const capture = new SystemAudioCapture({ mediaDevices: { getDisplayMedia: async () => { throw denied; } } });
  await assert.rejects(capture.start(), { name: 'NotAllowedError' });
  assert.match(captureErrorMessage(denied), /重新选择/);
  await assert.rejects(new SystemAudioCapture({ mediaDevices: {} }).start(), { name: 'UnsupportedCaptureError' });
  assert.match(captureErrorMessage({ name: 'UnsupportedCaptureError' }), /音频文件/);
});
