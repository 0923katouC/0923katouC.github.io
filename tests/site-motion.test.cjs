const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/site-motion.js'), 'utf8');

function createPage({ reduced = false, revealEvent = true, hidden = false } = {}) {
  const events = { page:new Map(), window:new Map(), document:new Map() };
  const listen = scope => (name, callback) => events[scope].set(name, callback);
  const emit = (scope, name, event = {}) => events[scope].get(name)?.(event);
  const animations = [];
  const classes = new Set();
  let changeMotion;
  let observer;
  const media = { matches:reduced, addEventListener(name, callback) { changeMotion = callback; } };
  const elements = [];
  const matches = (element, selectors) => selectors.split(',').some(selector => {
    if (selector.includes('.main-nav ') && !element.classes.includes('nav')) return false;
    const part = selector.trim().split(' ').pop();
    return part.split('.').slice(1).every(cls => element.classes.includes(cls)) &&
      (!part.split('.')[0] || part.split('.')[0] === element.tag);
  });
  const element = (tag, className, top, control = false) => {
    const item = {
      tag, classes:className.split(' '), control, disabled:false,
      parentElement:{ closest:() => null },
      matches(selectors) { return matches(this, selectors); },
      closest(selectors) { return this.matches(selectors) ? this : null; },
      querySelectorAll:() => [], getAttribute:() => null,
      getBoundingClientRect:() => ({ top, bottom:top + 100 }),
      animate(frames, options) {
        const animation = { target:item, frames, options, cancelled:false,
          finished:new Promise(() => {}), cancel() { this.cancelled = true; } };
        animations.push(animation);
        return animation;
      }
    };
    elements.push(item);
    return item;
  };
  const heading = element('section', 'home-intro', 100);
  const card = element('a', 'entry-panel', 300, true);
  const below = element('a', 'entry-panel', 1200, true);
  const button = element('button', 'lang-switch', 20, true);
  const page = {
    animate() {}, addEventListener:listen('page'),
    querySelectorAll(selectors) { return elements.filter(item => item.matches(selectors)); }
  };
  const document = {
    hidden, referrer:'',
    documentElement:{ classList:{ add:name => classes.add(name) } },
    querySelector:() => page, addEventListener:listen('document')
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observer = this; }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.observed.clear(); }
    show(target) { if (this.observed.has(target)) this.callback([{ target, isIntersecting:true }]); }
  }
  const window = {
    matchMedia:() => media, addEventListener:listen('window'),
    innerHeight:800, location:{ origin:'https://example.test' }, IntersectionObserver:Observer
  };
  if (revealEvent) window.onpagereveal = null;
  vm.runInNewContext(source, { document, window, IntersectionObserver:Observer, URL });
  return {
    animations, heading, card, below, button, classes, emit,
    show:() => observer.show(below),
    reveal:() => emit('window', 'pagereveal'),
    reduced(value) { media.matches = value; changeMotion(); },
    visible(value) { document.hidden = !value; emit('document', 'visibilitychange'); },
  };
}

test('first render staggers visible modules; offscreen content enters only once', () => {
  const page = createPage();
  page.reveal();
  const card = page.animations.find(a => a.target === page.card);
  const heading = page.animations.find(a => a.target === page.heading);
  assert.ok(card.options.delay > heading.options.delay);
  assert.equal(page.animations.filter(a => a.target === page.below).length, 0);
  const firstCount = page.animations.length;
  page.reveal();
  assert.equal(page.animations.length, firstCount);
  page.show();
  page.show();
  assert.equal(page.animations.filter(a => a.target === page.below).length, 1);
});

test('a new press cancels entrance/rebound and a modified click stays native', () => {
  const page = createPage();
  page.reveal();
  const entering = page.animations.find(a => a.target === page.button);
  page.emit('page', 'pointerdown', { target:page.button, button:0 });
  assert.ok(entering.cancelled);
  page.emit('page', 'click', { target:page.button, button:0 });
  const rebound = page.animations.at(-1);
  page.emit('page', 'pointerdown', { target:page.button, button:0 });
  assert.ok(rebound.cancelled);
  const count = page.animations.length;
  page.emit('page', 'click', { target:page.card, button:0, metaKey:true });
  assert.equal(page.animations.length, count);
});

test('reduced motion stops delayed entrances, rebounds, and future scroll reveals', () => {
  const quiet = createPage({ reduced:true });
  quiet.reveal();
  assert.equal(quiet.animations.length, 0);
  assert.ok(!quiet.classes.has('motion-reveal'));
  const page = createPage();
  page.reveal();
  page.reduced(true);
  assert.ok(page.animations.every(a => a.cancelled));
  const count = page.animations.length;
  page.show();
  page.emit('page', 'click', { target:page.button, button:0 });
  assert.equal(page.animations.length, count);
});

test('restoring history preserves the settled page without replaying entrances', () => {
  const page = createPage();
  page.reveal();
  const count = page.animations.length;
  page.emit('window', 'pagehide');
  assert.ok(page.animations.every(a => a.cancelled));
  page.emit('window', 'pageshow', { persisted:true });
  page.reveal();
  assert.equal(page.animations.length, count);
});

test('a hidden first load waits for visibility; keyboard focus settles its target', () => {
  const page = createPage({ hidden:true });
  page.reveal();
  assert.equal(page.animations.length, 0);
  page.visible(true);
  assert.ok(page.animations.length > 0);
  page.emit('page', 'focusin', { target:page.card });
  assert.ok(page.animations.find(a => a.target === page.card).cancelled);
});

test('browsers without pagereveal still receive the same module entrance', () => {
  const page = createPage({ revealEvent:false });
  assert.ok(page.animations.some(a => a.target === page.card));
});
