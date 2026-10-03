const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/academic-black-hole.js'), 'utf8');

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

// Execute the unmodified production lifecycle. The mock reports allocation
// errors through getError(), as WebGL does, rather than throwing JS exceptions.
async function renderer({ timed = false, initialAllocationFailure = null } = {}) {
  let now = 0, nextId = 0, currentTexture, currentFramebuffer, glError = 0;
  let allocationFailure = initialAllocationFailure, framebufferFailure = null;
  let gpuMs = 1;
  const frames = new Map(), timers = new Map(), classes = new Set();
  const bounds = { width: 1920, height: 1080 };
  const stats = { errorChecks: 0, framebufferChecks: 0, draws: 0, deletedTextures: 0, warnings: [] };
  const enums = new Map([['NO_ERROR', 0]]);
  const timerExtension = { TIME_ELAPSED_EXT: 'time-elapsed', GPU_DISJOINT_EXT: 'disjoint' };
  const textureKind = (width, height) => width === height ? 'radiance' : 'scene';
  const gl = new Proxy({
    getExtension(name) {
      return name === 'EXT_color_buffer_float' ? {} : timed ? timerExtension : null;
    },
    isContextLost: () => false,
    getParameter(name) {
      if (name === gl.MAX_TEXTURE_SIZE) return 16384;
      if (name === gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS) return 64;
      if (name === timerExtension.GPU_DISJOINT_EXT) return false;
      throw new Error(`Unexpected parameter: ${name}`);
    },
    getError() {
      stats.errorChecks++;
      const error = glError;
      glError = 0;
      return error;
    },
    createProgram: () => ({}),
    createShader: () => ({}),
    getShaderParameter: () => true,
    getProgramParameter(program, name) {
      return name === gl.TRANSFORM_FEEDBACK_VARYINGS ? program.varyings.length : true;
    },
    transformFeedbackVaryings(program, varyings) { program.varyings = varyings; },
    getTransformFeedbackVarying: (program, index) => ({
      name: program.varyings[index], size: 1, type: gl.UNSIGNED_INT_VEC4
    }),
    getUniformLocation: (_program, name) => name,
    createTexture: () => ({}),
    bindTexture(_target, texture) { currentTexture = texture; },
    texImage2D(_target, _level, _internal, width, height) {
      const kind = textureKind(width, height);
      if (width > 1 && allocationFailure === kind) {
        glError = gl.OUT_OF_MEMORY;
        allocationFailure = null;
        return;
      }
      Object.assign(currentTexture, { width, height, kind });
    },
    deleteTexture() { stats.deletedTextures++; },
    createFramebuffer: () => ({}),
    bindFramebuffer(_target, framebuffer) { currentFramebuffer = framebuffer; },
    framebufferTexture2D(_target, _attachment, _textureTarget, texture) {
      currentFramebuffer.texture = texture;
    },
    checkFramebufferStatus() {
      stats.framebufferChecks++;
      assert.ok(currentFramebuffer?.texture, 'check only attached framebuffer targets');
      if (currentFramebuffer.texture.width > 1 && framebufferFailure === currentFramebuffer.texture.kind) {
        framebufferFailure = null;
        return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      }
      return gl.FRAMEBUFFER_COMPLETE;
    },
    getQueryParameter(_query, name) {
      return name === gl.QUERY_RESULT_AVAILABLE ? true : gpuMs * 1e6;
    },
    drawArrays() { stats.draws++; }
  }, {
    get(target, name) {
      if (name in target) return target[name];
      if (/^[A-Z0-9_]+$/.test(name)) {
        if (!enums.has(name)) enums.set(name, enums.size);
        return enums.get(name);
      }
      return () => ({});
    }
  });
  const surface = { getBoundingClientRect: () => bounds };
  const canvas = Object.assign(eventTarget(), {
    dataset: {}, width: 1, height: 1, closest: () => surface, getContext: () => gl
  });
  const window = eventTarget();
  const document = Object.assign(eventTarget(), {
    hidden: false,
    currentScript: { src: 'https://example.test/assets/js/academic-black-hole.js' },
    getElementById: () => canvas,
    body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }
  });
  let observerCallback;
  function ResizeObserver(callback) { observerCallback = callback; this.observe = () => {}; }
  window.ResizeObserver = ResizeObserver;
  const context = vm.createContext({
    URL, AbortController, document, window, ResizeObserver,
    navigator: { hardwareConcurrency: 8 }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '', transitionDuration: '0s' }),
    performance: { now: () => now },
    console: { warn: (...args) => stats.warnings.push(args) },
    addEventListener: window.addEventListener,
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async () => ({ ok: true, text: async () => '// Shader compilation is mocked.' })
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));

  function step() {
    now += 1000 / 60;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(now));
  }
  for (let i = 0; i < 1000 && !['ready', 'fallback'].includes(canvas.dataset.state); i++) step();
  assert.ok(['ready', 'fallback'].includes(canvas.dataset.state), 'startup settles');
  return {
    canvas, stats, step,
    fallback: () => classes.has('academic-cosmos-fallback'),
    pendingFrames: () => frames.size,
    failAllocation: kind => { allocationFailure = kind; },
    failFramebuffer: kind => { framebufferFailure = kind; },
    setGpuTime: ms => { gpuMs = ms; },
    resize(width, height, via = 'window') {
      Object.assign(bounds, { width, height });
      if (via === 'observer') observerCallback();
      else if (via === 'pageshow') window.dispatch('pageshow', { persisted: true });
      else window.dispatch('resize');
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    }
  };
}

function assertFallback(app) {
  assert.equal(app.canvas.dataset.state, 'fallback');
  assert.equal(app.fallback(), true);
  assert.equal(app.pendingFrames(), 0, 'fallback stops animation');
  assert.ok(app.stats.deletedTextures > 0, 'failed targets are released');
  assert.equal(app.stats.warnings.length, 1);
}

test('normal startup and resize render without per-frame GL checks', async () => {
  const app = await renderer();
  assert.equal(app.canvas.dataset.state, 'ready');
  assert.equal(app.fallback(), false);
  const initialChecks = app.stats.errorChecks;
  const initialDraws = app.stats.draws;
  for (let i = 0; i < 10; i++) app.step();
  assert.ok(app.stats.draws > initialDraws);
  assert.equal(app.stats.errorChecks, initialChecks);
  app.resize(1280, 720);
  assert.equal(app.canvas.dataset.resolution, '1280x720');
  assert.equal(app.stats.errorChecks, initialChecks + 1);
  assert.equal(app.canvas.dataset.state, 'ready');
  const resizedDraws = app.stats.draws;
  app.step();
  assert.ok(app.stats.draws > resizedDraws);
  app.resize(1280, 720);
  assert.equal(app.stats.errorChecks, initialChecks + 1, 'unchanged sizes need no allocation checks');
});

for (const via of ['window', 'observer', 'pageshow']) {
  test(`${via} resize allocation failure restores fallback`, async () => {
    const app = await renderer();
    const resolution = app.canvas.dataset.resolution;
    app.failAllocation('scene');
    app.resize(1280, 720, via);
    assertFallback(app);
    assert.equal(app.canvas.dataset.resolution, resolution, 'failed size is not published');
  });
}

test('an incomplete framebuffer after resize restores fallback', async () => {
  const app = await renderer();
  app.failFramebuffer('scene');
  app.resize(1280, 720);
  assertFallback(app);
});

test('initial resize allocation failure never reveals the canvas', async () => {
  const app = await renderer({ initialAllocationFailure: 'scene' });
  assertFallback(app);
  assert.equal(app.stats.draws, 0);
});

test('GPU downscaling resizes both targets and keeps rendering', async () => {
  const app = await renderer({ timed: true });
  const resolution = app.canvas.dataset.radianceResolution;
  app.setGpuTime(30);
  for (let i = 0; i < 20 && app.canvas.dataset.qualityScale === '1.00'; i++) app.step();
  assert.equal(app.canvas.dataset.qualityScale, '0.84');
  assert.notEqual(app.canvas.dataset.radianceResolution, resolution);
  assert.equal(app.canvas.dataset.state, 'ready');
  assert.equal(app.fallback(), false);
});

for (const failure of ['allocation', 'framebuffer']) {
  test(`GPU downscaling radiance ${failure} failure restores fallback before drawing`, async () => {
    const app = await renderer({ timed: true });
    if (failure === 'allocation') app.failAllocation('radiance');
    else app.failFramebuffer('radiance');
    app.setGpuTime(30);
    let drawsBeforeFailure;
    for (let i = 0; i < 20 && app.canvas.dataset.state !== 'fallback'; i++) {
      drawsBeforeFailure = app.stats.draws;
      app.step();
    }
    assertFallback(app);
    assert.equal(app.stats.draws, drawsBeforeFailure, 'failed reallocation must not submit another draw');
  });
}
