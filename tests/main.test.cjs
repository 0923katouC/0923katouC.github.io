const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');
const denied = () => new DOMException('Storage access is blocked', 'SecurityError');

function createPage({ saved = null, accessError, readError, writeError, reducedMotion = false } = {}) {
  const writes = [];
  const motions = [];
  const elements = [
    { dataset: { zh: '摄影集', en: 'Photography' }, textContent: '摄影集' },
    { dataset: { zh: '个人主页。', en: 'Personal website.' }, textContent: '个人主页。' },
  ];
  let ready;
  for (const element of elements) {
    element.animate = (frames, options) => {
      const animation = { finished: Promise.resolve(), cancelled: false,
        cancel() { this.cancelled = true; } };
      motions.push({ animation, frames, options });
      return animation;
    };
  }
  let click;
  const button = {
    textContent: 'EN',
    addEventListener(event, listener) {
      assert.equal(event, 'click');
      click = listener;
    },
  };
  const document = {
    documentElement: { lang: 'zh-CN' },
    addEventListener(event, listener) {
      assert.equal(event, 'DOMContentLoaded');
      ready = listener;
    },
    querySelector: selector => selector === '.lang-switch' ? button : null,
    querySelectorAll: selector => selector === '[data-zh][data-en]' ? elements : [],
  };
  const storage = {
    getItem(key) {
      assert.equal(key, 'site-lang');
      if (readError) throw readError;
      return saved;
    },
    setItem(key, value) {
      assert.equal(key, 'site-lang');
      if (writeError) throw writeError;
      writes.push(value);
      saved = value;
    },
  };
  let changeMotion;
  const media = { matches: reducedMotion,
    addEventListener(event, listener) { changeMotion = listener; } };
  const context = { document, window: {
    matchMedia: () => media,
    addEventListener() {},
  } };
  Object.defineProperty(context, 'localStorage', {
    get() {
      if (accessError) throw accessError;
      return storage;
    },
  });
  vm.runInNewContext(source, context, { filename: 'main.js' });
  ready();

  return {
    writes,
    motions,
    reduceMotion() { media.matches = true; changeMotion(); },
    click: () => click(),
    expectLanguage(lang) {
      assert.equal(document.documentElement.lang, lang === 'zh' ? 'zh-CN' : 'en');
      assert.equal(button.textContent, lang === 'zh' ? 'EN' : '中');
      assert.deepEqual(elements.map(element => element.textContent),
        lang === 'zh' ? ['摄影集', '个人主页。'] : ['Photography', 'Personal website.']);
    },
  };
}

test('only animates an explicit language change, never initial restoration', () => {
  const page = createPage({ saved: 'en' });
  assert.equal(page.motions.length, 0);
  page.click();
  page.expectLanguage('zh');
  assert.equal(page.motions.length, 2);
  assert.ok(page.motions.every(motion => motion.options.duration === 180));
});

test('rapid toggles cancel stale animations and keep the latest language', () => {
  const page = createPage();
  page.click();
  page.click();
  page.expectLanguage('zh');
  assert.equal(page.motions.length, 4);
  assert.ok(page.motions.slice(0, 2).every(motion => motion.animation.cancelled));
});

test('reduced motion disables language effects and cancels effects in flight', () => {
  const reduced = createPage({ reducedMotion: true });
  reduced.click();
  reduced.expectLanguage('en');
  assert.equal(reduced.motions.length, 0);
  const page = createPage();
  page.click();
  page.reduceMotion();
  assert.ok(page.motions.every(motion => motion.animation.cancelled));
  page.click();
  page.expectLanguage('zh');
  assert.equal(page.motions.length, 2);
});

test('defaults to Chinese without writing a preference', () => {
  const page = createPage();
  page.expectLanguage('zh');
  assert.deepEqual(page.writes, []);
});

test('restores the saved language and persists both toggle directions', () => {
  const page = createPage({ saved: 'en' });
  page.expectLanguage('en');
  page.click();
  page.expectLanguage('zh');
  page.click();
  page.expectLanguage('en');
  assert.deepEqual(page.writes, ['zh', 'en']);
});

test('keeps switching when accessing localStorage throws SecurityError', () => {
  const page = createPage({ accessError: denied() });
  page.expectLanguage('zh');
  page.click();
  page.expectLanguage('en');
  page.click();
  page.expectLanguage('zh');
});

test('falls back to Chinese when getItem throws and still attempts to save', () => {
  const page = createPage({ readError: denied() });
  page.expectLanguage('zh');
  page.click();
  page.expectLanguage('en');
  assert.deepEqual(page.writes, ['en']);
});

test('keeps switching when setItem throws', () => {
  const page = createPage({ saved: 'en', writeError: denied() });
  page.expectLanguage('en');
  page.click();
  page.expectLanguage('zh');
  page.click();
  page.expectLanguage('en');
});

for (const saved of ['fr', 'en-US', 'ZH', '', 'undefined']) {
  test(`invalid saved language ${JSON.stringify(saved)} falls back to Chinese`, () => {
    const page = createPage({ saved });
    page.expectLanguage('zh');
    page.click();
    page.expectLanguage('en');
    assert.deepEqual(page.writes, ['en']);
  });
}
