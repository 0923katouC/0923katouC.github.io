/* SPDX-License-Identifier: GPL-3.0-only
 * NPGS Kerr black-hole background, browser adaptation, 2026-09-11.
 * Source, scope and license: /assets/vendor/npgs/README.md
 */
(() => {
  'use strict';
  const canvas = document.getElementById('academic-black-hole');
  if (!canvas) return;
  const VERSION = '20261003-blackhole2';
  const baseUrl = new URL('../shaders/', document.currentScript.src);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 820px), (pointer: coarse)');
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
    // Invertible ray-grid refinement: spend more actual rays near the hole.
    vec2 mapToPlane(vec2 uv) {
      vec2 q = uv * 2.0 - 1.0;
      return 0.5 * MAP_SPAN * q * (0.55 + 0.45 * abs(q));
    }
    vec2 planeToMap(vec2 plane) {
      vec2 q = abs(plane) / (0.5 * MAP_SPAN);
      q = (sqrt(0.3025 + 1.8 * q) - 0.55) / 0.9;
      return 0.5 + 0.5 * sign(plane) * q;
    }
    const vec3 CAMERA = vec3(0.0, 4.8621489747, 27.5746170843);
    vec3 sceneDirection(vec2 plane) {
      plane = mat2(0.951056516, -0.309016994, 0.309016994, 0.951056516) * plane;
      vec3 up = vec3(0.0, 0.984807753, -0.173648178);
      return normalize(-CAMERA + vec3(plane.x, 0.0, 0.0) + up * plane.y);
    }
  `;
  canvas.dataset.renderer = 'npgs-kerr';
  canvas.dataset.version = VERSION;
  canvas.dataset.scene = 'black-hole-only';
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
  let traceQuery = null;
  let traceRows = 4;
  let traceStarted = 0;
  let tracePausedAt = 0;
  let warmup = 24;
  let drawSamples = [];
  let cpuSamples = [];
  let gpuSamples = [];
  let slowWindows = 0;
  const lowPower = () => mobile.matches || Boolean(navigator.connection && navigator.connection.saveData);
  const economyDesktop = () => (navigator.hardwareConcurrency || 4) <= 4;
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
    release();
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
  function resetMetrics() {
    warmup = 24;
    drawSamples = []; cpuSamples = []; gpuSamples = [];
    slowWindows = 0; slowSamples = 0;
    canvas.dataset.sampleFrames = '0';
    canvas.dataset.drawFps = reducedMotion.matches ? 'still' : 'warming';
    canvas.dataset.gpuAvgMs = reducedMotion.matches ? 'not-sampled' : timerExtension ? 'warming' : 'unavailable';
  }
  function recordDraw(now, cpuMs) {
    if (reducedMotion.matches) { canvas.dataset.drawFps = 'still'; return; }
    if (warmup > 0) { --warmup; return; }
    drawSamples.push(now); cpuSamples.push(cpuMs);
    if (drawSamples.length < 120) return;
    const duration = drawSamples.at(-1) - drawSamples[0];
    const fps = 1000 * (drawSamples.length - 1) / duration;
    const intervals = drawSamples.slice(1).map((time, i) => time - drawSamples[i]).sort((a,b) => a-b);
    canvas.dataset.drawFps = fps.toFixed(1);
    canvas.dataset.sampleFrames = String(drawSamples.length);
    canvas.dataset.sampleDurationMs = duration.toFixed(0);
    canvas.dataset.drawIntervalP95Ms = intervals[Math.floor(intervals.length * .95)].toFixed(1);
    canvas.dataset.cpuSubmitAvgMs = (cpuSamples.reduce((a,b) => a+b,0) / cpuSamples.length).toFixed(2);
    if (gpuSamples.length) canvas.dataset.gpuAvgMs = (gpuSamples.reduce((a,b) => a+b,0) / gpuSamples.length).toFixed(2);
    // Also handles GPUs without timer-query support; require sustained pressure.
    slowWindows = fps < 24 ? slowWindows + 1 : 0;
    drawSamples = []; cpuSamples = []; gpuSamples = [];
    if (slowWindows >= 2 && scale > .55) {
      scale = Math.max(.55, scale * .84); slowWindows = 0; resize();
    }
  }
  function resize() {
    if (!scene || gl.isContextLost()) return;
    const low = lowPower();
    const cap = (low ? 230000 : economyDesktop() ? 1100000 : 2100000) * scale * scale;
    const dpr = Math.min(devicePixelRatio || 1, low ? 1 : 1.5);
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
    canvas.dataset.qualityScale = scale.toFixed(2);
    resetMetrics();
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
    if (warmup === 0) gpuSamples.push(ms);
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
    ['uDiskNear', 'uDiskFar', 'uSky'].forEach((name, index) => bindTexture(render, name, index, maps[index]));
    bindTexture(render, 'uNoise', 3, noise, gl.TEXTURE_3D);
    gl.uniform2f(location(render, 'uResolution'), canvas.width, canvas.height);
    const portrait = innerWidth / Math.max(innerHeight, 1) < 0.82;
    // Restore the large black-hole framing used before the extra objects.
    gl.uniform2f(location(render, 'uCenter'), portrait ? 0.52 : 0.58, portrait ? 0.61 : 0.52);
    gl.uniform1f(location(render, 'uViewSpan'), portrait ? 36 : 20);
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
        if (traceQuery && gl.getQueryParameter(traceQuery, gl.QUERY_RESULT_AVAILABLE)) {
          const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
          const ms = gl.getQueryParameter(traceQuery, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(traceQuery); traceQuery = null;
          if (!disjoint) traceRows = Math.max(1, Math.min(lowPower() ? 6 : 10, Math.round(traceRows * 8 / Math.max(ms, .1))));
        }
        // Trace only the two disk images and escaped sky rays in one pass.
        const timedTrace = timerExtension && !traceQuery;
        if (timedTrace) { traceQuery = gl.createQuery(); gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, traceQuery); }
        const rows = Math.min(traceRows, mapSize - completedRows);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mapFramebuffer);
        gl.viewport(0, 0, mapSize, mapSize);
        gl.useProgram(trace.handle);
        gl.uniform2f(location(trace, 'uMapSize'), mapSize, mapSize);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, completedRows, mapSize, rows);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
        if (timedTrace) gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
        completedRows += rows;
        canvas.dataset.traceProgress = (100 * completedRows / mapSize).toFixed(0);
        if (completedRows < mapSize) { schedule(); return; }
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Transfer-map rendering failed');
        ready = true;
        canvas.dataset.traceWallMs = (performance.now() - traceStarted).toFixed(0);
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
          const submitted = performance.now();
          draw();
          recordDraw(now, performance.now() - submitted);
          // Advance at least one interval even when the half-ms tolerance
          // admits an early frame. Keep the phase without catch-up overdraw.
          lastDraw = Number.isFinite(lastDraw)
            ? lastDraw + interval * Math.max(1, Math.floor((now - lastDraw + 0.5) / interval))
            : now;
        }
      }
      if (!reducedMotion.matches || !ready) schedule();
    } catch (error) { fail(error); }
  }
  function release() {
    stop();
    if (pendingQuery) gl.deleteQuery(pendingQuery);
    pendingQuery = null;
    if (traceQuery) gl.deleteQuery(traceQuery);
    traceQuery = null;
    textures.forEach(texture => gl.deleteTexture(texture));
    framebuffers.forEach(framebuffer => gl.deleteFramebuffer(framebuffer));
    programs.forEach(program => gl.deleteProgram(program));
    if (vao) gl.deleteVertexArray(vao);
    textures = []; framebuffers = []; programs = [];
    scene = null;
    vao = null;
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
      if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 3 || gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) < 3) throw new Error('Three render targets unavailable');
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      trace = makeProgram(SCENE + sources[0] + sources[2], ['uMapSize']);
      render = makeProgram(SCENE + sources[1] + sources[3],
        ['uDiskNear', 'uDiskFar', 'uSky', 'uNoise', 'uResolution', 'uCenter', 'uViewSpan', 'uTime']);
      compose = makeProgram(sources[4], ['uScene', 'uTexel']);
      mapSize = lowPower() ? 512 : economyDesktop() ? 832 : 1536;
      canvas.dataset.qualityTier = lowPower() ? 'mobile' : economyDesktop() ? 'economy' : 'desktop';
      mapSize = Math.min(mapSize, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      canvas.dataset.mapResolution = `${mapSize}x${mapSize}`;
      maps = Array.from({ length: 3 }, () => makeTexture(mapSize, mapSize, gl.NEAREST));
      for (const texture of maps.slice(2)) {
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
      traceRows = 4;
      traceStarted = performance.now();
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
    if (document.hidden) { stop(); tracePausedAt=performance.now(); if (ready) setState('paused'); }
    else { if(tracePausedAt) traceStarted+=performance.now()-tracePausedAt; tracePausedAt=0; resetMetrics(); lastDraw = -Infinity; if (ready) setState(reducedMotion.matches ? 'still' : 'ready'); schedule(); }
  });
  reducedMotion.addEventListener('change', () => {
    stop(); lastDraw = -Infinity;
    resetMetrics();
    if (ready) setState(reducedMotion.matches ? 'still' : 'ready');
    schedule();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ++generation;
    stop(); ready = false;
    pendingQuery = null; traceQuery = null;
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
