const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/photography-cards.js'), 'utf8');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatch(name, event = {}) {
      for (const callback of listeners.get(name) || []) callback(event);
    }
  };
}

function setup({ reduced = false, hidden = false, intersection = true } = {}) {
  let nextId = 0, observerCallback, random = 0.25;
  const timers = new Map();
  const digits = Array.from({ length: 6 }, (_, index) => ({
    dataset: { nixieDigit: String(index) },
    attributes: { d: `static-${index}` },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const clock = { dataset: { time: '12:34:56' }, querySelectorAll: () => digits };
  const root = { dataset: { motionState: 'paused' }, querySelector: () => clock };
  const document = Object.assign(eventTarget(), { hidden, querySelector: () => root });
  const motion = Object.assign(eventTarget(), { matches: reduced });
  const window = eventTarget();
  class IntersectionObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target) { assert.equal(target, root); }
  }
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  const context = {
    document, window, IntersectionObserver,
    matchMedia: () => motion,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    addEventListener: window.addEventListener
  };
  vm.runInNewContext(source, context);
  return {
    root, clock, digits, timers, document, motion, window,
    setRandom(value) { random = value; },
    intersect(visible) {
      observerCallback([{ target: root, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
    },
    tick() {
      assert.equal(timers.size, 1, 'exactly one clock timer is scheduled');
      const [id, timer] = timers.entries().next().value;
      assert.ok(timer.delay >= 1200 && timer.delay <= 1600);
      timers.delete(id);
      timer.callback();
    },
    hide(value) { document.hidden = value; document.dispatch('visibilitychange'); },
    reduce(value) { motion.matches = value; motion.dispatch('change'); }
  };
}

test('the SSR clock stays still until visible, then changes to valid times', () => {
  const app = setup();
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  assert.equal(app.clock.dataset.time, '12:34:56');
  app.intersect(true);
  assert.equal(app.root.dataset.motionState, 'running');
  assert.equal(app.clock.dataset.time, '12:34:56', 'the first change waits for its timer');
  for (const random of [0, 0.999999999, 0.375, 0.75]) {
    app.setRandom(random);
    const before = app.clock.dataset.time;
    app.tick();
    assert.match(app.clock.dataset.time, /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
    assert.notEqual(app.clock.dataset.time, before);
    assert.ok(app.digits.every(digit => /^[Mm]/.test(digit.attributes.d)));
  }
});

test('a repeated random result still advances to a different valid time', () => {
  const app = setup();
  app.setRandom((12 * 3600 + 34 * 60 + 56) / 86400);
  app.intersect(true);
  app.tick();
  assert.equal(app.clock.dataset.time, '12:34:57');
  app.clock.dataset.time = '23:59:59';
  app.setRandom(0.999999999);
  app.tick();
  assert.equal(app.clock.dataset.time, '00:00:00');
});

test('document visibility pauses digits and repeated resume events do not duplicate timers', () => {
  const app = setup();
  app.intersect(true);
  app.tick();
  const time = app.clock.dataset.time;
  app.hide(true);
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  assert.equal(app.clock.dataset.time, time);
  app.hide(false);
  app.hide(false);
  assert.equal(app.root.dataset.motionState, 'running');
  assert.equal(app.timers.size, 1);
});

test('leaving the viewport pauses both card effects until they become visible again', () => {
  const app = setup();
  app.intersect(true);
  app.intersect(false);
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  app.hide(false);
  assert.equal(app.timers.size, 0, 'visibility alone cannot resume an offscreen card');
  app.intersect(true);
  app.intersect(true);
  assert.equal(app.root.dataset.motionState, 'running');
  assert.equal(app.timers.size, 1);
});

test('reduced motion preserves the SSR frame and overrides viewport and page visibility', () => {
  const app = setup({ reduced: true });
  app.intersect(true);
  app.hide(false);
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  assert.equal(app.clock.dataset.time, '12:34:56');
  assert.deepEqual(app.digits.map(digit => digit.attributes.d), Array.from({ length: 6 }, (_, i) => `static-${i}`));
  app.reduce(false);
  assert.equal(app.root.dataset.motionState, 'running');
  app.tick();
  const time = app.clock.dataset.time;
  app.reduce(true);
  assert.equal(app.timers.size, 0);
  assert.equal(app.clock.dataset.time, time);
});

test('pagehide clears the timer and a bfcache restore resumes one timer', () => {
  const app = setup();
  app.intersect(true);
  app.window.dispatch('pagehide', { persisted: true });
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  app.intersect(true);
  app.hide(false);
  assert.equal(app.timers.size, 0, 'other events cannot restart a departed page');
  app.window.dispatch('pageshow', { persisted: true });
  app.window.dispatch('pageshow', { persisted: true });
  assert.equal(app.root.dataset.motionState, 'running');
  assert.equal(app.timers.size, 1);
  app.window.dispatch('pagehide', { persisted: false });
  assert.equal(app.timers.size, 0);
});

test('without IntersectionObserver, visibility and reduced motion still control the clock', () => {
  const app = setup({ intersection: false, hidden: true });
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  app.hide(false);
  assert.equal(app.root.dataset.motionState, 'running');
  app.tick();
  app.reduce(true);
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
});
