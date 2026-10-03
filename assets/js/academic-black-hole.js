/* SPDX-License-Identifier: GPL-3.0-only
 * NPGS Kerr black-hole background, browser adaptation, 2026-09-11.
 * Source, scope and license: /assets/vendor/npgs/README.md
 */
(() => {
  'use strict';
  const canvas = document.getElementById('academic-black-hole');
  if (!canvas) return;
  const VERSION = '20261003-volume7';
  const baseUrl = new URL('../shaders/', document.currentScript.src);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 820px), (pointer: coarse)');
  const portrait = matchMedia('(max-aspect-ratio: 82/100)');
  const surface = canvas.closest('.cosmos-bg') || canvas;
  let framing = {x:.58,y:.52,span:20};
  let revealUntil = 0;
  const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp usampler2D;\n';
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
    float volumeHalfHeight(float r) {
      return 0.45 + 0.075 * max(r - 3.0, 0.0);
    }
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
  canvas.dataset.scene = 'volumetric-black-hole';
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
  const shaderNames = ['npgs-kerr.glsl', 'npgs-emission.glsl', 'npgs-volume-trace.vert',
                       'npgs-render.frag', 'npgs-compose.frag', 'npgs-project.frag'];
  let sources;
  let generation = 0;
  let programs = [];
  let textures = [];
  let framebuffers = [];
  let vao;
  let trace, render, project, compose;
  let rayBuffer;
  let rayFeedback;
  let rayCache;
  let cacheWidth = 0;
  let cacheHeight = 0;
  let cacheBytes = 0;
  let nodeCount = 8;
  let rayStrideBytes = 0;
  let totalRays = 0;
  let noise;
  let rayRadiance;
  let rayRadianceFramebuffer;
  let radianceSize = 0;
  let scene;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let sceneFramebuffer;
  let mapSize = 0;
  let completedRays = 0;
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
  function linkProgram(vertexSource, fragmentSource, names, varyings) {
    const shaders = [];
    const program = gl.createProgram();
    programs.push(program);
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource],
                                  [gl.FRAGMENT_SHADER, fragmentSource]]) {
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
    if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
    return { handle: program, uniforms };
  }
  function makeProgram(fragment, names) {
    return linkProgram(HEADER + VERTEX, HEADER + fragment, names);
  }
  function makeTraceProgram() {
    const varyings = Array.from({ length: nodeCount }, (_, index) => `vNode${index}`).concat('vSky');
    const prefix = HEADER + `#define NODE_COUNT ${nodeCount}\n` + SCENE + sources[0];
    const program = linkProgram(prefix + sources[2],
      HEADER + 'out vec4 fragColor; void main() { fragColor = vec4(0.0); }',
      ['uMapSize', 'uRayOffset'], varyings);
    if (gl.getProgramParameter(program.handle, gl.TRANSFORM_FEEDBACK_VARYINGS) !== varyings.length) {
      throw new Error('Ray-cache transform-feedback layout is incomplete');
    }
    varyings.forEach((name, index) => {
      const info = gl.getTransformFeedbackVarying(program.handle, index);
      if (!info || info.name !== name || info.size !== 1 || info.type !== gl.UNSIGNED_INT_VEC4) {
        throw new Error(`Ray-cache varying has the wrong packed type: ${name}`);
      }
    });
    if (location(program, 'uMapSize') === null || location(program, 'uRayOffset') === null) {
      throw new Error('Ray-cache trace inputs are unavailable');
    }
    return program;
  }
  function allocateRayCache() {
    const low = lowPower();
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maximumComponents = gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS);
    nodeCount = low ? 6 : economyDesktop() ? 8 : 12;
    if (maximumComponents < 4 * (nodeCount + 1)) nodeCount = 6;
    if (maximumComponents < 4 * (nodeCount + 1)) throw new Error('Packed transform feedback unavailable');
    const desired = low ? 384 : economyDesktop() ? 640 : 960;
    // One RGBA32UI texel stores eight packed half-floats. N nodes and one
    // sky record are contiguous for every ray, independent of atlas rows.
    mapSize = Math.min(desired, Math.floor(maximum / Math.sqrt(nodeCount + 1)));
    if (mapSize < 1) throw new Error('Ray cache exceeds texture limits');
    totalRays = mapSize * mapSize;
    const texels = totalRays * (nodeCount + 1);
    cacheWidth = Math.min(maximum, mapSize * (nodeCount + 1));
    cacheHeight = Math.ceil(texels / cacheWidth);
    if (cacheHeight > maximum) throw new Error('Ray-cache atlas exceeds texture limits');
    rayStrideBytes = 16 * (nodeCount + 1);
    // Padding covers the final partial atlas row, so the PBO upload never
    // reads beyond the allocation. BufferData provides initialized storage.
    cacheBytes = cacheWidth * cacheHeight * 16;
    rayBuffer = gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, rayBuffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, cacheBytes, gl.STATIC_COPY);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    rayFeedback = gl.createTransformFeedback();
    rayCache = gl.createTexture();
    textures.push(rayCache);
    gl.bindTexture(gl.TEXTURE_2D, rayCache);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, cacheWidth, cacheHeight);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Ray-cache allocation failed');
    canvas.dataset.qualityTier = low ? 'mobile' : economyDesktop() ? 'economy' : 'desktop';
    canvas.dataset.mapResolution = `${mapSize}x${mapSize}`;
    canvas.dataset.nodeCount = String(nodeCount);
    canvas.dataset.cacheResolution = `${cacheWidth}x${cacheHeight}`;
    canvas.dataset.rayCacheBytes = String(cacheBytes);
    canvas.dataset.tracePeakCacheBytes = String(2 * cacheBytes);
    canvas.dataset.cacheLayout = `RGBA32UI; ray-major; ${nodeCount + 1} texels/ray`;
  }
  function traceRayBatch(count) {
    gl.useProgram(trace.handle);
    gl.uniform2f(location(trace, 'uMapSize'), mapSize, mapSize);
    gl.uniform1i(location(trace, 'uRayOffset'), completedRays);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, rayFeedback);
    // All offsets/lengths are multiples of 16, satisfying TF's 4-byte rule.
    gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, rayBuffer,
      completedRays * rayStrideBytes, count * rayStrideBytes);
    gl.enable(gl.RASTERIZER_DISCARD);
    let active = false;
    try {
      gl.beginTransformFeedback(gl.POINTS);
      active = true;
      gl.drawArrays(gl.POINTS, 0, count);
    } finally {
      if (active) gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    }
  }
  function uploadRayCache() {
    // GPU-to-GPU transfer: no getBufferSubData/readPixels or CPU staging copy.
    gl.bindTexture(gl.TEXTURE_2D, rayCache);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, rayBuffer);
    try {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cacheWidth, cacheHeight,
        gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0);
    } finally {
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Packed ray-cache upload failed');
    // Upload commands retain the buffer until consumed by the GPU. Drop our
    // references immediately so the steady scene holds only the atlas copy.
    gl.deleteTransformFeedback(rayFeedback); rayFeedback = null;
    gl.deleteBuffer(rayBuffer); rayBuffer = null;
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
    const cap = (low ? 230000 : economyDesktop() ? 700000 : 1500000) * scale * scale;
    const dpr = Math.min(devicePixelRatio || 1, low ? 1 : 1.5);
    const bounds = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    // CSS owns the breakpoint and anchor; CSS Y is measured from the top.
    const value = (name,fallback) => {
      const parsed = parseFloat(style.getPropertyValue(name));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    framing = {
      x:value('--cosmos-center-x',portrait.matches?52:58)/100,
      y:1-value('--cosmos-center-y',portrait.matches?39:48)/100,
      span:value('--cosmos-view-span',portrait.matches?36:20)
    };
    let width = Math.max(1, Math.round(bounds.width * dpr));
    let height = Math.max(1, Math.round(bounds.height * dpr));
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
    // Reduce the expensive volume pass together with the output, while keeping
    // the geometry atlas intact. The shader selects exact cached rays from
    // this coarser image grid; no new geodesic integration is needed.
    const nextRadianceSize = Math.max(1, Math.round(mapSize * scale));
    if (rayRadiance && radianceSize !== nextRadianceSize) {
      gl.bindTexture(gl.TEXTURE_2D, rayRadiance);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, nextRadianceSize, nextRadianceSize,
        0, gl.RGBA, gl.HALF_FLOAT, null);
      radianceSize = nextRadianceSize;
    }
    canvas.dataset.resolution = `${width}x${height}`;
    canvas.dataset.radianceResolution = `${radianceSize}x${radianceSize}`;
    canvas.dataset.radianceMapBytes = String(radianceSize * radianceSize * 8);
    canvas.dataset.qualityScale = scale.toFixed(2);
    canvas.dataset.framing = `${framing.x.toFixed(2)},${framing.y.toFixed(2)},${framing.span}`;
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
    try {
      // Integrate one exact cached ray per radiance pixel, with adaptive pixel
      // density. Filter only radiance, never nodes from different passages.
      gl.bindFramebuffer(gl.FRAMEBUFFER, rayRadianceFramebuffer);
      gl.viewport(0, 0, radianceSize, radianceSize);
      gl.useProgram(render.handle);
      bindTexture(render, 'uRayCache', 0, rayCache);
      bindTexture(render, 'uNoise', 1, noise, gl.TEXTURE_3D);
      gl.uniform2f(location(render, 'uMapSize'), mapSize, mapSize);
      gl.uniform2f(location(render, 'uRadianceResolution'), radianceSize, radianceSize);
      gl.uniform1i(location(render, 'uCacheWidth'), cacheWidth);
      gl.uniform1i(location(render, 'uNodeCount'), nodeCount);
      gl.uniform1f(location(render, 'uTime'), elapsed);
      gl.uniform1f(location(render, 'uGrainDetail'), lowPower() ? 0.35 : 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(project.handle);
      bindTexture(project, 'uRadiance', 0, rayRadiance);
      bindTexture(project, 'uNoise', 1, noise, gl.TEXTURE_3D);
      gl.uniform2f(location(project, 'uResolution'), canvas.width, canvas.height);
      gl.uniform2f(location(project, 'uCenter'), framing.x, framing.y);
      gl.uniform1f(location(project, 'uViewSpan'), framing.span);
      gl.uniform2f(location(project, 'uRadianceResolution'), radianceSize, radianceSize);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(compose.handle);
      bindTexture(compose, 'uScene', 0, scene);
      gl.uniform2f(location(compose, 'uTexel'), 1 / canvas.width, 1 / canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } finally {
      if (timed) gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
    }
  }
  function tick(now) {
    raf = 0;
    if (document.hidden || gl.isContextLost() || failed || !trace) return;
    try {
      if (completedRays < totalRays) {
        if (traceQuery && gl.getQueryParameter(traceQuery, gl.QUERY_RESULT_AVAILABLE)) {
          const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
          const ms = gl.getQueryParameter(traceQuery, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(traceQuery); traceQuery = null;
          if (!disjoint) traceRows = Math.max(1, Math.min(lowPower() ? 4 : 8, Math.round(traceRows * 8 / Math.max(ms, .1))));
        }
        // Each vertex traces one ray and writes its ordered packed nodes.
        const timedTrace = timerExtension && !traceQuery;
        if (timedTrace) { traceQuery = gl.createQuery(); gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, traceQuery); }
        const rays = Math.min(traceRows * mapSize, totalRays - completedRays);
        try { traceRayBatch(rays); }
        finally { if (timedTrace) gl.endQuery(timerExtension.TIME_ELAPSED_EXT); }
        if (completedRays === 0 && gl.getError() !== gl.NO_ERROR) {
          throw new Error('The first ray-cache transform-feedback batch failed');
        }
        completedRays += rays;
        canvas.dataset.traceProgress = (100 * completedRays / totalRays).toFixed(0);
        if (completedRays < totalRays) { schedule(); return; }
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Ray-cache transform feedback failed');
        uploadRayCache();
        if (traceQuery) { gl.deleteQuery(traceQuery); traceQuery = null; }
        ready = true;
        canvas.dataset.traceWallMs = (performance.now() - traceStarted).toFixed(0);
        draw();
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Background rendering failed');
        setState(reducedMotion.matches ? 'still' : 'ready');
        document.body.classList.remove('academic-cosmos-fallback');
        // Keep the same t=14 frame throughout the CSS fade, then start motion.
        const duration = parseFloat(getComputedStyle(canvas).transitionDuration) || 0;
        revealUntil = performance.now() + duration * 1000;
        lastTick = now;
        lastDraw = now;
      } else if (ready) {
        if (lastTick && !reducedMotion.matches && now > revealUntil) {
          elapsed += Math.min((now - Math.max(lastTick,revealUntil)) / 1000, 0.1);
        }
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
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    if (rayFeedback) gl.deleteTransformFeedback(rayFeedback);
    if (rayBuffer) gl.deleteBuffer(rayBuffer);
    rayFeedback = null; rayBuffer = null; rayCache = null;
    textures.forEach(texture => gl.deleteTexture(texture));
    framebuffers.forEach(framebuffer => gl.deleteFramebuffer(framebuffer));
    programs.forEach(program => gl.deleteProgram(program));
    if (vao) gl.deleteVertexArray(vao);
    textures = []; framebuffers = []; programs = [];
    rayRadiance = null; rayRadianceFramebuffer = null;
    radianceSize = 0;
    scene = null;
    vao = null;
    trace = null; render = null; project = null; compose = null;
    ready = false;
  }
  async function initialize() {
    const currentGeneration = ++generation;
    failed = false;
    ready = false;
    elapsed = 14;
    revealUntil = 0;
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
      allocateRayCache();
      trace = makeTraceProgram();
      render = makeProgram(SCENE + sources[1] + sources[3],
        ['uRayCache', 'uMapSize', 'uRadianceResolution', 'uCacheWidth', 'uNodeCount', 'uNoise', 'uTime', 'uGrainDetail']);
      project = makeProgram(SCENE + sources[1] + sources[5],
        ['uRadiance', 'uNoise', 'uResolution', 'uCenter', 'uViewSpan', 'uRadianceResolution']);
      compose = makeProgram(sources[4], ['uScene', 'uTexel']);
      noise = makeNoise();
      rayRadiance = makeTexture(1, 1);
      radianceSize = 1;
      rayRadianceFramebuffer = makeFramebuffer([rayRadiance]);
      scene = makeTexture(1, 1);
      sceneWidth = sceneHeight = 1;
      sceneFramebuffer = makeFramebuffer([scene]);
      completedRays = 0;
      traceRows = lowPower() ? 1 : 2;
      traceStarted = performance.now();
      tracePausedAt = document.hidden ? traceStarted : 0;
      canvas.dataset.traceProgress = '0';
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
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); schedule(); },120);
    });
    observer.observe(surface);
  }
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
    rayFeedback = null; rayBuffer = null; rayCache = null;
    rayRadiance = null; rayRadianceFramebuffer = null;
    radianceSize = 0;
    trace = null; render = null; project = null; compose = null;
    setState('context-lost');
    document.body.classList.add('academic-cosmos-fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    textures = []; framebuffers = []; programs = []; vao = null; pendingQuery = null;
    rayFeedback = null; rayBuffer = null; rayCache = null;
    rayRadiance = null; rayRadianceFramebuffer = null;
    radianceSize = 0;
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
