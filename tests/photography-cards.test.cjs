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

function setup({ reduced = false, hidden = false, intersection = true, currentYear = 2031 } = {}) {
  let nextId = 0, observerCallback, random = 0.25, now = 0;
  const timers = new Map();
  const updates = [];
  const rows = Object.fromEntries([['date', 6], ['year', 4]].map(([name, count]) => {
    const digits = Array.from({ length: count }, (_, index) => ({
      dataset: { nixieDigit: String(index) },
      attributes: { d: `static-${name}-${index}` },
      setAttribute(name, value) { this.attributes[name] = value; }
    }));
    const jitter = { dataset: {} };
    return [name, {
      digits, jitter,
      querySelectorAll(selector) { assert.equal(selector, '[data-nixie-digit]'); return digits; },
      querySelector(selector) { assert.equal(selector, '[data-nixie-jitter]'); return jitter; }
    }];
  }));
  const clock = {
    dataset: new Proxy({ dateHour: '10-04 12', year: '2001' }, {
      set(target, property, value) {
        target[property] = value;
        updates.push({ property, value, at: now });
        return true;
      }
    }),
    querySelector(selector) {
      if (selector === '[data-nixie-row="date"]') return rows.date;
      if (selector === '[data-nixie-row="year"]') return rows.year;
      assert.fail(`Unexpected clock selector: ${selector}`);
    }
  };
  const root = { dataset: { motionState: 'paused' }, querySelector: () => clock };
  const document = Object.assign(eventTarget(), { hidden, querySelector: () => root });
  const motion = Object.assign(eventTarget(), { matches: reduced });
  const window = eventTarget();
  class IntersectionObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target) { assert.equal(target, root); }
  }
  class BrowserDate extends Date {
    getFullYear() { return currentYear; }
  }
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  const context = {
    document, window, IntersectionObserver, Date: BrowserDate,
    matchMedia: () => motion,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay, due: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    addEventListener: window.addEventListener
  };
  vm.runInNewContext(source, context);
  return {
    root, clock, rows, timers, document, motion, window, updates,
    setRandom(value) { random = value; },
    setCurrentYear(value) { currentYear = value; },
    intersect(visible) {
      observerCallback([{ target: root, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
    },
    advance(milliseconds) {
      const target = now + milliseconds;
      while (timers.size) {
        const [id, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (timer.due > target) break;
        now = timer.due;
        timers.delete(id);
        timer.callback();
      }
      now = target;
    },
    pendingDelays() { return [...timers.values()].map(timer => timer.due - now).sort((a, b) => a - b); },
    hide(value) { document.hidden = value; document.dispatch('visibilitychange'); },
    reduce(value) { motion.matches = value; motion.dispatch('change'); }
  };
}

function assertPaused(app) {
  assert.equal(app.root.dataset.motionState, 'paused');
  assert.equal(app.timers.size, 0);
  assert.equal(app.rows.date.jitter.dataset.jolt, undefined);
  assert.equal(app.rows.year.jitter.dataset.jolt, undefined);
}

function assertRestarted(app) {
  assert.equal(app.root.dataset.motionState, 'running');
  assert.equal(app.timers.size, 2, 'exactly one timer is scheduled for each row');
  assert.deepEqual(app.pendingDelays(), [250, 500]);
}

test('the SSR frame stays still until visible, then both rows keep distinct 500ms cadences', () => {
  const app = setup();
  assertPaused(app);
  assert.equal(app.clock.dataset.dateHour, '10-04 12');
  assert.equal(app.clock.dataset.year, '2001');
  app.intersect(true);
  assertRestarted(app);
  app.advance(249);
  assert.equal(app.updates.length, 0);
  app.advance(1);
  assert.deepEqual(app.updates.map(({ property, at }) => [property, at]), [['year', 250]]);
  assert.equal(app.rows.year.jitter.dataset.jolt, 'a');
  assert.equal(app.rows.date.jitter.dataset.jolt, undefined);
  app.advance(249);
  assert.equal(app.updates.length, 1);
  app.advance(1);
  assert.equal(app.rows.date.jitter.dataset.jolt, 'a');
  assert.equal(app.rows.year.jitter.dataset.jolt, 'a', 'date updates do not jolt the year');
  app.advance(250);
  assert.equal(app.rows.year.jitter.dataset.jolt, 'b');
  assert.equal(app.rows.date.jitter.dataset.jolt, 'a', 'year updates do not jolt the date');
  app.advance(250);
  assert.equal(app.rows.date.jitter.dataset.jolt, 'b');
  app.advance(1000);
  assert.deepEqual(app.updates.filter(update => update.property === 'year').map(update => update.at),
    [250, 750, 1250, 1750]);
  assert.deepEqual(app.updates.filter(update => update.property === 'dateHour').map(update => update.at),
    [500, 1000, 1500, 2000]);
  assert.equal(app.timers.size, 2);
  for (const row of Object.values(app.rows)) {
    assert.ok(row.digits.every(digit => /^[Mm]/.test(digit.attributes.d)));
  }
});

test('all 365 days and 24 hours are valid with independently sampled leap and non-leap years', () => {
  const app = setup();
  app.intersect(true);
  const seen = new Set();
  for (let slot = 0; slot < 365 * 24; slot++) {
    app.setRandom((slot + 0.25) / (365 * 24));
    app.advance(500);
    const value = app.clock.dataset.dateHour;
    assert.match(value, /^(?:0[1-9]|1[0-2])-\d{2} (?:[01]\d|2[0-3])$/);
    const [month, day, hour] = value.split(/[- ]/).map(Number);
    const expected = new Date(Date.UTC(2001, 0, 1, slot));
    assert.equal(month, expected.getUTCMonth() + 1);
    assert.equal(day, expected.getUTCDate());
    assert.equal(hour, expected.getUTCHours());
    assert.notEqual(value.slice(0, 5), '02-29');
    for (const year of [2001, 2024, 2100, Number(app.clock.dataset.year)]) {
      const date = new Date(Date.UTC(year, month - 1, day, hour));
      assert.equal(date.getUTCMonth() + 1, month);
      assert.equal(date.getUTCDate(), day);
    }
    seen.add(value);
  }
  assert.equal(seen.size, 365 * 24);
});

test('year sampling includes both endpoints and observes a browser year change without reload', () => {
  const app = setup({ currentYear: 2031 });
  app.clock.dataset.year = '2010';
  app.setRandom(0);
  app.intersect(true);
  app.advance(250);
  assert.equal(app.clock.dataset.year, '2001');
  app.setRandom(0.999999999);
  app.advance(500);
  assert.equal(app.clock.dataset.year, '2031');
  app.setCurrentYear(2032);
  app.advance(500);
  assert.equal(app.clock.dataset.year, '2032');
  for (let sample = 0; sample < 100; sample++) {
    app.setRandom(sample / 100);
    app.advance(500);
    const year = Number(app.clock.dataset.year);
    assert.ok(year >= 2001 && year <= 2032);
  }
});

test('repeated random choices still change each display and wrap within its valid range', () => {
  const app = setup({ currentYear: 2031 });
  app.setRandom(0);
  app.intersect(true);
  app.advance(250);
  assert.equal(app.clock.dataset.year, '2002', 'a repeated 2001 advances to another allowed year');
  app.setRandom((276 * 24 + 12) / (365 * 24));
  app.advance(250);
  assert.equal(app.clock.dataset.dateHour, '10-04 13');
  app.clock.dataset.year = '2031';
  app.clock.dataset.dateHour = '12-31 23';
  app.setRandom(0.999999999);
  app.advance(250);
  assert.equal(app.clock.dataset.year, '2001');
  app.advance(250);
  assert.equal(app.clock.dataset.dateHour, '01-01 00');
});

test('document visibility pauses both rows and repeated resume events do not duplicate timers', () => {
  const app = setup();
  app.intersect(true);
  app.advance(750);
  const frame = { ...app.clock.dataset };
  app.hide(true);
  assertPaused(app);
  app.advance(5000);
  assert.deepEqual({ ...app.clock.dataset }, frame);
  app.hide(false);
  app.hide(false);
  assertRestarted(app);
  const count = app.updates.length;
  app.advance(250);
  assert.equal(app.updates.length, count + 1);
  assert.equal(app.updates.at(-1).property, 'year');
  assert.equal(app.rows.year.jitter.dataset.jolt, 'a');
  assert.equal(app.rows.date.jitter.dataset.jolt, undefined);
  app.advance(250);
  assert.equal(app.updates.length, count + 2);
  assert.equal(app.updates.at(-1).property, 'dateHour');
  assert.equal(app.rows.date.jitter.dataset.jolt, 'a');
  assert.equal(app.timers.size, 2);
});

test('leaving the viewport pauses both card effects until they become visible again', () => {
  const app = setup();
  app.intersect(true);
  app.advance(500);
  app.intersect(false);
  assertPaused(app);
  app.hide(false);
  assertPaused(app);
  app.intersect(true);
  app.intersect(true);
  assertRestarted(app);
});

test('reduced motion preserves the SSR frame and overrides viewport and page visibility', () => {
  const app = setup({ reduced: true });
  app.intersect(true);
  app.hide(false);
  assertPaused(app);
  assert.deepEqual({ ...app.clock.dataset }, { dateHour: '10-04 12', year: '2001' });
  for (const [name, row] of Object.entries(app.rows)) {
    assert.deepEqual(row.digits.map(digit => digit.attributes.d),
      Array.from({ length: row.digits.length }, (_, i) => `static-${name}-${i}`));
  }
  app.reduce(false);
  assertRestarted(app);
  app.advance(500);
  const frame = { ...app.clock.dataset };
  app.reduce(true);
  assertPaused(app);
  app.advance(2000);
  assert.deepEqual({ ...app.clock.dataset }, frame);
});

test('pagehide clears both timers and a bfcache restore resumes exactly one timer per row', () => {
  const app = setup();
  app.intersect(true);
  app.advance(500);
  app.window.dispatch('pagehide', { persisted: true });
  assertPaused(app);
  app.intersect(true);
  app.hide(false);
  assertPaused(app);
  app.window.dispatch('pageshow', { persisted: true });
  app.window.dispatch('pageshow', { persisted: true });
  assertRestarted(app);
  const count = app.updates.length;
  app.advance(1000);
  assert.equal(app.updates.length, count + 4);
  app.window.dispatch('pagehide', { persisted: false });
  assertPaused(app);
});

test('without IntersectionObserver, visibility and reduced motion still control both rows', () => {
  const app = setup({ intersection: false, hidden: true });
  assertPaused(app);
  app.hide(false);
  assertRestarted(app);
  app.advance(500);
  assert.equal(app.updates.length, 2);
  app.reduce(true);
  assertPaused(app);
});
