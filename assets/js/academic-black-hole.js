/* SPDX-License-Identifier: GPL-3.0-only
 * NPGS Kerr black-hole background, browser adaptation, 2026-09-11.
 * Source, scope and license: /assets/vendor/npgs/README.md
 */
(() => {
  'use strict';
  const canvas = document.getElementById('academic-black-hole');
  if (!canvas) return;
  const VERSION = '20260911-npgs-jet2';
  const baseUrl = new URL('../shaders/', document.currentScript.src);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 820px)');
  const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
  const VERTEX = `
    out vec2 vUv;
    void main() {
      vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vUv = point;
      gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
    }
  `;
  const SCENE = `
    const float PHYSICAL_A = 0.43;
    const float HORIZON = 0.75514701644;
    const float DISK_INNER = 1.28671550559;
    const float DISK_OUTER = 9.0;
    const float MAP_SPAN = 48.0;
    const vec3 CAMERA = vec3(0.0, 4.8621489747, 27.5746170843);
    vec3 sceneDirection(vec2 plane) {
      plane = mat2(0.984807753, -0.173648178, 0.173648178, 0.984807753) * plane;
      vec3 up = vec3(0.0, 0.984807753, -0.173648178);
      return normalize(-CAMERA + vec3(plane.x, 0.0, 0.0) + up * plane.y);
    }
  `;
  canvas.dataset.renderer = 'npgs-kerr';
  canvas.dataset.version = VERSION;
  document.body.classList.add('academic-cosmos-fallback');
  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power'
    });
  } catch (_) { /* The pre-rendered frame remains visible. */ }
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
    canvas.dataset.state = 'fallback';
    return;
  }
  const shaderNames = ['npgs-kerr.glsl', 'npgs-emission.glsl', 'npgs-trace.frag',
                       'npgs-render.frag', 'npgs-compose.frag'];
  let sources;
  let generation = 0;
  let programs = [];
  let textures = [];
  let framebuffers = [];
  let vao;
  let trace, render, compose;
  let maps = [];
  let noise;
  let scene;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let mapFramebuffer;
  let sceneFramebuffer;
  let mapSize = 0;
  let completedRows = 0;
  let ready = false;
  let failed = false;
  let raf = 0;
  let resizeTimer = 0;
  let elapsed = 14;
  let lastTick = 0;
  let lastDraw = -Infinity;
  let scale = 1;
  let timerExtension;
  let pendingQuery = null;
  let slowSamples = 0;
  const lowPower = () => mobile.matches || (navigator.hardwareConcurrency || 4) <= 4 ||
                         Boolean(navigator.connection && navigator.connection.saveData);
  const location = (program, name) => program.uniforms[name];
  const setState = state => { canvas.dataset.state = state; };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTick = 0;
  };
  const schedule = () => {
    if (!raf && !document.hidden && !failed && !gl.isContextLost()) raf = requestAnimationFrame(tick);
  };
  const fail = error => {
    failed = true;
    ready = false;
    stop();
    setState('fallback');
    document.body.classList.add('academic-cosmos-fallback');
    console.warn('NPGS background: using the rendered fallback frame.', error);
  };
  function makeProgram(fragment, names) {
    const shaders = [];
    const program = gl.createProgram();
    programs.push(program);
    for (const [type, source] of [[gl.VERTEX_SHADER, HEADER + VERTEX],
                                  [gl.FRAGMENT_SHADER, HEADER + fragment]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        shaders.forEach(item => gl.deleteShader(item));
        throw new Error(error);
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
    return { handle: program, uniforms };
  }
  function makeTexture(width, height, filter = gl.LINEAR) {
    const texture = gl.createTexture();
    textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    return texture;
  }
  function makeFramebuffer(targets) {
    const framebuffer = gl.createFramebuffer();
    framebuffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const attachments = targets.map((target, index) => {
      const attachment = gl.COLOR_ATTACHMENT0 + index;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, target, 0);
      return attachment;
    });
    gl.drawBuffers(attachments);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Floating-point framebuffer is incomplete');
    }
    return framebuffer;
  }
  function makeNoise() {
    const data = new Uint8Array(32 * 32 * 32);
    for (let z = 0; z < 32; ++z) for (let y = 0; y < 32; ++y) for (let x = 0; x < 32; ++x) {
      const value = Math.sin(x * 12.9898 + y * 78.233 + z * 213.765) * 43758.5453;
      data[x + 32 * (y + 32 * z)] = Math.round(255 * (value - Math.floor(value)));
    }
    const texture = gl.createTexture();
    textures.push(texture);
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, gl.REPEAT);
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 32, 32, 32, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    return texture;
  }
  function resize() {
    if (!scene || gl.isContextLost()) return;
    const low = lowPower();
    const cap = (low ? 230000 : 680000) * scale * scale;
    const dpr = Math.min(devicePixelRatio || 1, low ? 1 : 1.25);
    let width = Math.max(1, Math.round(innerWidth * dpr));
    let height = Math.max(1, Math.round(innerHeight * dpr));
    const correction = Math.min(1, Math.sqrt(cap / (width * height)));
    width = Math.max(1, Math.round(width * correction));
    height = Math.max(1, Math.round(height * correction));
    if (canvas.width !== width || canvas.height !== height || sceneWidth !== width || sceneHeight !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.bindTexture(gl.TEXTURE_2D, scene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      sceneWidth = width;
      sceneHeight = height;
    }
    canvas.dataset.resolution = `${width}x${height}`;
    lastDraw = -Infinity;
  }
  function bindTexture(program, name, unit, texture, target = gl.TEXTURE_2D) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, texture);
    gl.uniform1i(location(program, name), unit);
  }
  function sampleGpuTime() {
    if (!timerExtension || !pendingQuery) return;
    if (!gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE)) return;
    const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
    const ms = gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(pendingQuery);
    pendingQuery = null;
    if (disjoint) return;
    slowSamples = ms > 27 ? slowSamples + 1 : Math.max(0, slowSamples - 1);
    if (slowSamples >= 3 && scale > 0.55) {
      scale = Math.max(0.55, scale * 0.84);
      slowSamples = 0;
      resize();
    }
  }
  function draw() {
    sampleGpuTime();
    const timed = timerExtension && !pendingQuery;
    if (timed) {
      pendingQuery = gl.createQuery();
      gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, pendingQuery);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(render.handle);
    ['uDiskNear', 'uDiskFar', 'uSky', 'uJet'].forEach((name, index) => bindTexture(render, name, index, maps[index]));
    bindTexture(render, 'uNoise', 4, noise, gl.TEXTURE_3D);
    gl.uniform2f(location(render, 'uResolution'), canvas.width, canvas.height);
    const portrait = innerWidth / Math.max(innerHeight, 1) < 0.82;
    gl.uniform2f(location(render, 'uCenter'), portrait ? 0.52 : 0.72, portrait ? 0.72 : 0.66);
    gl.uniform1f(location(render, 'uViewSpan'), portrait ? 48 : 34);
    gl.uniform1f(location(render, 'uTime'), elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(compose.handle);
    bindTexture(compose, 'uScene', 0, scene);
    gl.uniform2f(location(compose, 'uTexel'), 1 / canvas.width, 1 / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (timed) gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
  }
  function tick(now) {
    raf = 0;
    if (document.hidden || gl.isContextLost() || failed || !trace) return;
    try {
      if (completedRows < mapSize) {
        // Small scissored batches keep the expensive one-time trace bounded.
        const rows = Math.min(lowPower() ? 8 : 12, mapSize - completedRows);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mapFramebuffer);
        gl.viewport(0, 0, mapSize, mapSize);
        gl.useProgram(trace.handle);
        gl.uniform2f(location(trace, 'uMapSize'), mapSize, mapSize);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, completedRows, mapSize, rows);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
        completedRows += rows;
        if (completedRows < mapSize) { schedule(); return; }
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Transfer-map rendering failed');
        ready = true;
        draw();
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Background rendering failed');
        setState(reducedMotion.matches ? 'still' : 'ready');
        document.body.classList.remove('academic-cosmos-fallback');
        lastTick = now;
        lastDraw = now;
      } else if (ready) {
        if (lastTick && !reducedMotion.matches) elapsed += Math.min((now - lastTick) / 1000, 0.1);
        lastTick = now;
        const interval = 1000 / 30;
        if (now - lastDraw >= interval - 0.5 || reducedMotion.matches) {
          draw();
          lastDraw = now - ((now - lastDraw) % interval || 0);
        }
      }
      if (!reducedMotion.matches || !ready) schedule();
    } catch (error) { fail(error); }
  }
  function release() {
    stop();
    if (pendingQuery) gl.deleteQuery(pendingQuery);
    pendingQuery = null;
    textures.forEach(texture => gl.deleteTexture(texture));
    framebuffers.forEach(framebuffer => gl.deleteFramebuffer(framebuffer));
    programs.forEach(program => gl.deleteProgram(program));
    if (vao) gl.deleteVertexArray(vao);
    textures = []; framebuffers = []; programs = [];
  }
  async function initialize() {
    const currentGeneration = ++generation;
    failed = false;
    ready = false;
    setState('loading');
    try {
      if (!sources) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          sources = await Promise.all(shaderNames.map(async name => {
            const url = new URL(name, baseUrl);
            url.searchParams.set('v', VERSION);
            const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Shader request failed: ${name} (${response.status})`);
            return response.text();
          }));
        } finally { clearTimeout(timeout); }
      }
      if (currentGeneration !== generation || gl.isContextLost()) return;
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating-point targets unavailable');
      timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      release();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      trace = makeProgram(SCENE + sources[0] + sources[2], ['uMapSize']);
      render = makeProgram(SCENE + sources[1] + sources[3],
        ['uDiskNear', 'uDiskFar', 'uSky', 'uJet', 'uNoise', 'uResolution', 'uCenter', 'uViewSpan', 'uTime']);
      compose = makeProgram(sources[4], ['uScene', 'uTexel']);
      mapSize = lowPower() || reducedMotion.matches ? 512 : 832;
      maps = Array.from({ length: 4 }, () => makeTexture(mapSize, mapSize, gl.NEAREST));
      for (const texture of [maps[2], maps[3]]) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      mapFramebuffer = makeFramebuffer(maps);
      noise = makeNoise();
      scene = makeTexture(1, 1);
      sceneWidth = sceneHeight = 1;
      sceneFramebuffer = makeFramebuffer([scene]);
      completedRows = 0;
      resize();
      setState('tracing');
      schedule();
    } catch (error) {
      if (currentGeneration === generation) fail(error);
    }
  }
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); schedule(); }, 120);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); if (ready) setState('paused'); }
    else { lastDraw = -Infinity; if (ready) setState(reducedMotion.matches ? 'still' : 'ready'); schedule(); }
  });
  reducedMotion.addEventListener('change', () => {
    stop(); lastDraw = -Infinity;
    if (ready) setState(reducedMotion.matches ? 'still' : 'ready');
    schedule();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ++generation;
    stop(); ready = false;
    setState('context-lost');
    document.body.classList.add('academic-cosmos-fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    textures = []; framebuffers = []; programs = []; vao = null; pendingQuery = null;
    scene = null;
    initialize();
  });
  addEventListener('pagehide', event => {
    stop();
    if (!event.persisted) { ++generation; release(); }
  });
  addEventListener('pageshow', event => {
    if (event.persisted) {
      resize(); lastDraw = -Infinity;
      if (ready) setState(reducedMotion.matches ? 'still' : 'ready');
      schedule();
    }
  });
  initialize();
})();
