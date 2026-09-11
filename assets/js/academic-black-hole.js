(() => {
  const canvas = document.getElementById('academic-black-hole');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power'
  });

  if (!gl) {
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const precision = high && high.precision > 0 ? 'highp' : 'mediump';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  const VERTEX = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const PRECOMPUTE = `
    precision ${precision} float;
    varying vec2 vUv;
    uniform float uMode;

    const float PI = 3.141592653589793;
    const float ROBS = 15.0;
    const float XMAX = 1.38;
    const float YMAX = 0.72;
    const float RIN = 1.48;
    const float ROUT = 8.4;
    const float SPIN = 0.80;
    const float DPHI = 0.058;
    const int MAX_STEPS = 128;
    const float CD = 0.9983182989;
    const float SD = 0.0579674690;

    vec2 packHit(vec3 p) {
      return p.xy / ROUT * 0.5 + 0.5;
    }

    void main() {
      vec2 screen = vec2(mix(-XMAX, XMAX, vUv.x), mix(-YMAX, YMAX, vUv.y));
      float sr = length(screen);

      // Small Kerr-like screen shear. The strong lensing itself comes from
      // the Schwarzschild null-geodesic integration below.
      screen.x += SPIN * (0.023 + 0.012 * screen.x) * exp(-pow(sr / 0.38, 2.0));

      float inc = 1.2915436465; // 74 deg
      vec3 cam = vec3(0.0, -ROBS * sin(inc), ROBS * cos(inc));
      vec3 n = normalize(cam);
      vec3 forward = -n;
      vec3 right = normalize(cross(forward, vec3(0.0, 0.0, 1.0)));
      vec3 up = normalize(cross(right, forward));
      float imageScale = 1.18;
      vec3 ray = normalize(forward + imageScale * screen.x * right + imageScale * screen.y * up);

      float ndotr = dot(ray, n);
      vec3 tangentRaw = ray - ndotr * n;
      float tangentMag = length(tangentRaw);

      bool captured = false;
      bool escaped = false;
      bool active = true;
      vec3 tangent = right;
      float u = 1.0 / ROBS;
      float du = 0.0;

      if (tangentMag < 0.0005) {
        captured = ndotr < 0.0;
        escaped = !captured;
        active = false;
      } else {
        tangent = tangentRaw / tangentMag;
        du = -ndotr / tangentMag * u;
      }

      float cphi = 1.0;
      float sphi = 0.0;
      float drag = 0.0;
      float lz = clamp(cross(cam, ray).z / ROBS, -1.0, 1.0);
      vec3 previous = cam;
      vec3 finalDir = ray;
      bool have1 = false;
      bool have2 = false;
      vec2 hit1 = vec2(0.0);
      vec2 hit2 = vec2(0.0);

      for (int i = 0; i < MAX_STEPS; ++i) {
        if (!active) break;

        // Symplectic-ish leapfrog update for u(phi): u'' = -u + 3u^2/2.
        float acc0 = -u + 1.5 * u * u;
        float duh = du + 0.5 * acc0 * DPHI;
        float un = u + duh * DPHI;
        float acc1 = -un + 1.5 * un * un;
        float dun = duh + 0.5 * acc1 * DPHI;

        float cphin = cphi * CD - sphi * SD;
        float sphin = sphi * CD + cphi * SD;
        float dragn = drag + SPIN * 0.026 * max(un, 0.0) * max(un, 0.0) * DPHI;

        if (un >= 1.0) {
          captured = true;
          active = false;
          break;
        }
        if (un <= 0.0) {
          escaped = true;
          active = false;
          break;
        }

        vec3 pos = (cphin * n + sphin * tangent) / max(un, 0.0001);
        float frameAngle = dragn * (1.0 + 0.30 * lz);
        pos.xy += frameAngle * vec2(-pos.y, pos.x);

        if (previous.z * pos.z <= 0.0 && abs(previous.z - pos.z) > 0.00001) {
          float f = clamp(previous.z / (previous.z - pos.z), 0.0, 1.0);
          vec3 h = mix(previous, pos, f);
          float rr = length(h.xy);
          if (rr >= RIN && rr <= ROUT) {
            if (!have1) {
              hit1 = packHit(h);
              have1 = true;
            } else if (!have2) {
              hit2 = packHit(h);
              have2 = true;
            }
          }
        }

        previous = pos;
        u = un;
        du = dun;
        cphi = cphin;
        sphi = sphin;
        drag = dragn;

        finalDir = normalize(cphi * n + sphi * tangent);
        finalDir.xy += drag * (1.0 + 0.30 * lz) * vec2(-finalDir.y, finalDir.x);
        finalDir = normalize(finalDir);
      }

      if (active && u < 0.09 && du < 0.0) escaped = true;

      if (uMode < 0.5) {
        float skyMask = escaped && !captured ? 1.0 : 0.0;
        gl_FragColor = vec4(finalDir * 0.5 + 0.5, skyMask);
      } else {
        gl_FragColor = vec4(hit1, hit2);
      }
    }
  `;

  const DISPLAY = `
    precision ${precision} float;
    varying vec2 vUv;
    uniform sampler2D uSkyMap;
    uniform sampler2D uDiskMap;
    uniform vec2 uResolution;
    uniform vec2 uMapTexel;
    uniform float uTime;
    uniform float uPortrait;

    const float PI = 3.141592653589793;
    const float XMAX = 1.38;
    const float YMAX = 0.72;
    const float ROUT = 8.4;
    const float RIN = 1.48;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float starLayer(vec2 uv, float cells, float threshold, float radius, float salt) {
      vec2 p = uv * cells;
      vec2 id = floor(p);
      vec2 f = fract(p) - 0.5;
      float seed = hash21(id + salt);
      vec2 jitter = vec2(hash21(id + salt + 11.7), hash21(id + salt + 43.1)) - 0.5;
      float d = length(f - jitter * 0.72);
      return (1.0 - smoothstep(0.0, radius, d)) * step(threshold, seed);
    }

    vec3 skyColor(vec3 dir, vec2 screen, float escaped) {
      float lon = atan(dir.y, dir.x) / (2.0 * PI) + 0.5;
      float lat = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
      vec2 suv = vec2(lon, lat);

      vec3 galNormal = normalize(vec3(0.29, 0.80, 0.52));
      float band = exp(-pow(abs(dot(dir, galNormal)) * 4.2, 2.0));
      float dust = valueNoise(suv * vec2(9.0, 5.0) + vec2(3.1, 8.7));
      vec3 col = vec3(0.0032, 0.0068, 0.0155);
      col += vec3(0.014, 0.027, 0.060) * band * (0.42 + 0.58 * dust);

      float s1 = starLayer(suv, 470.0, 0.895, 0.115, 7.0);
      float s2 = starLayer(suv + vec2(0.17, 0.09), 205.0, 0.925, 0.095, 31.0);
      float s3 = starLayer(suv + vec2(0.41, 0.23), 96.0, 0.955, 0.070, 61.0);
      float tw = 0.84 + 0.16 * sin(uTime * 0.36 + hash21(floor(suv * 190.0)) * 31.0);
      vec3 tint = mix(vec3(0.58, 0.74, 1.00), vec3(1.00, 0.84, 0.63), hash21(floor(suv * 190.0) + 9.0));
      col += tint * (0.46 * s1 + 1.05 * s2 + 1.85 * s3) * tw;

      // A sparse screen-space layer keeps visible star points far from the lens.
      vec2 qp = screen * vec2(0.80, 1.0) + vec2(0.31, 0.62);
      float clean = starLayer(qp, 92.0, 0.94, 0.078, 67.0);
      clean *= smoothstep(0.30, 0.52, length(screen));
      col += vec3(0.86, 0.92, 1.0) * clean * 1.35;
      return col * escaped;
    }

    float hitValid(vec2 uv) {
      return step(0.015, uv.x + uv.y);
    }

    vec3 diskEmission(vec2 packedUv, float strength, vec2 screen) {
      float valid = hitValid(packedUv);
      if (valid < 0.5) return vec3(0.0);

      vec2 xy = (packedUv * 2.0 - 1.0) * ROUT;
      float r = length(xy);
      float phi = atan(xy.y, xy.x);
      float omega = 0.82 / pow(max(r, RIN), 1.5);
      float a = phi - uTime * omega;

      float n1 = valueNoise(vec2(r * 1.45, a * 2.85 + 0.15 * uTime));
      float n2 = valueNoise(vec2(r * 3.35 - 0.08 * uTime, a * 5.3));
      float spiral = 0.5 + 0.5 * sin(5.4 * log(max(r, RIN)) + 8.5 * a + 1.7 * n1);
      float rings = 0.5 + 0.5 * sin(r * 12.0 - 0.30 * uTime + 2.0 * n2);
      float structure = 0.44 + 0.30 * n1 + 0.15 * n2 + 0.18 * spiral + 0.10 * rings;

      float heat = pow(clamp((ROUT - r) / (ROUT - RIN), 0.0, 1.0), 0.62);
      vec3 outer = vec3(0.34, 0.028, 0.002);
      vec3 warm = vec3(1.00, 0.28, 0.025);
      vec3 hot = vec3(1.00, 0.82, 0.48);
      vec3 whiteHot = vec3(1.00, 0.95, 0.82);
      vec3 color = mix(outer, warm, smoothstep(0.02, 0.60, heat));
      color = mix(color, hot, smoothstep(0.56, 0.88, heat));
      color = mix(color, whiteHot, smoothstep(0.86, 0.995, heat) * 0.66);

      // Cheap relativistic beaming surrogate evaluated from the disk hit.
      float v = clamp(sqrt(0.52 / max(r - 0.88, 0.72)), 0.0, 0.73);
      float gamma = inversesqrt(max(1.0 - v * v, 0.10));
      float mu = -0.96 * cos(phi);
      float grav = sqrt(clamp(1.0 - 1.0 / max(r, 1.02), 0.05, 1.0));
      float g = grav / max(gamma * (1.0 - v * mu), 0.22);
      float beam = clamp(pow(g, 3.0), 0.15, 5.3);

      float edge = smoothstep(RIN, RIN + 0.24, r) * (1.0 - smoothstep(7.55, ROUT, r));
      float radial = 0.20 + 1.70 * pow(heat, 1.52);
      float screenBoost = 0.90 + 0.18 * smoothstep(-0.6, 0.7, screen.x);
      return color * structure * edge * beam * radial * strength * screenBoost * valid;
    }

    vec3 jetColor(vec2 q) {
      float ca = 0.9993876;
      float sa = -0.0349929;
      q = mat2(ca, -sa, sa, ca) * q;
      float z = abs(q.y);
      float width = 0.010 + 0.084 * z;
      float spine = exp(-pow(q.x / max(width * 0.31, 0.002), 2.0));
      float sheath = exp(-pow(q.x / max(width * 1.60, 0.004), 2.0));
      float window = smoothstep(0.095, 0.145, z) * (1.0 - smoothstep(0.54, 0.94, z));
      float knots = 0.66 + 0.34 * sin(z * 43.0 - uTime * 1.70 + 0.72 * sin(z * 14.0));
      float turbulence = 0.72 + 0.28 * valueNoise(vec2(q.x * 82.0, z * 24.0 - uTime * 0.78));
      float fade = 1.0 - 0.62 * smoothstep(0.18, 0.92, z);
      float j = window * knots * turbulence * fade;
      return vec3(0.040, 0.24, 0.78) * sheath * j * 1.82
           + vec3(0.34, 0.76, 1.00) * spine * j * 1.70;
    }

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      vec2 center = mix(vec2(0.20, -0.012), vec2(0.0, 0.018), uPortrait);
      float sceneScale = mix(0.97, 0.78, uPortrait);
      vec2 q = (p - center) / sceneScale;

      vec2 mapUv = vec2(q.x / (2.0 * XMAX) + 0.5, q.y / (2.0 * YMAX) + 0.5);
      vec2 safeUv = clamp(mapUv, uMapTexel * 0.5, vec2(1.0) - uMapTexel * 0.5);
      float inside = step(0.0, mapUv.x) * step(mapUv.x, 1.0) * step(0.0, mapUv.y) * step(mapUv.y, 1.0);

      vec4 sky = texture2D(uSkyMap, safeUv);
      vec3 dir = normalize(sky.rgb * 2.0 - 1.0);
      float escaped = smoothstep(0.18, 0.82, sky.a) * inside;
      vec3 color = skyColor(dir, q, escaped);

      vec4 diskMap = texture2D(uDiskMap, safeUv);
      vec2 h1 = diskMap.rg;
      vec2 h2 = diskMap.ba;
      float v1 = hitValid(h1) * inside;
      float v2 = hitValid(h2) * inside;

      // Secondary image is rendered first, then the primary disk image.
      color += diskEmission(h2, 0.50 * v2, q);
      color += jetColor(q);
      color += diskEmission(h1, 1.00 * v1, q);

      float diskAlpha = max(v1, 0.70 * v2);
      float darkness = (1.0 - escaped) * (1.0 - diskAlpha);
      color = mix(color, vec3(0.00004, 0.00006, 0.00012), darkness);

      // Thin highlight near the capture/escape separatrix. This is derived from
      // the low-resolution beam map, so it follows the actual strong-field lens.
      float aL = texture2D(uSkyMap, safeUv - vec2(uMapTexel.x, 0.0)).a;
      float aR = texture2D(uSkyMap, safeUv + vec2(uMapTexel.x, 0.0)).a;
      float aD = texture2D(uSkyMap, safeUv - vec2(0.0, uMapTexel.y)).a;
      float aU = texture2D(uSkyMap, safeUv + vec2(0.0, uMapTexel.y)).a;
      float boundary = clamp(abs(aR - aL) + abs(aU - aD), 0.0, 1.0) * inside;
      float sideBoost = 0.55 + 0.70 * smoothstep(-0.28, 0.62, q.x);
      color += vec3(1.00, 0.58, 0.20) * boundary * sideBoost * 0.55;

      // Outside the beam-map rectangle, continue with a simple star field.
      float outsideStar = starLayer(p + vec2(0.37, 0.61), 105.0, 0.945, 0.078, 83.0) * (1.0 - inside);
      color += vec3(0.75, 0.86, 1.0) * outsideStar * 1.10;
      color += vec3(0.0025, 0.0050, 0.0110) * (1.0 - inside);

      float vignette = 1.0 - smoothstep(0.40, 1.08, length(vec2(p.x * 0.72, p.y)));
      color *= 0.74 + 0.26 * vignette;
      color = color / (1.0 + 0.44 * color);
      color = pow(max(color, 0.0), vec3(0.86));
      fragColor = vec4(color, 1.0);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Academic black-hole shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const makeProgram = fragmentSource => {
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Academic black-hole program link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  };

  const preProgram = makeProgram(PRECOMPUTE);
  const displayProgram = makeProgram(DISPLAY);
  if (!preProgram || !displayProgram) {
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  const vertices = new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const bindQuad = program => {
    gl.useProgram(program);
    const loc = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };

  let mapWidth = 0;
  let mapHeight = 0;
  let skyMap = null;
  let diskMap = null;
  let framebuffer = null;

  const destroyMaps = () => {
    if (skyMap) gl.deleteTexture(skyMap);
    if (diskMap) gl.deleteTexture(diskMap);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    skyMap = diskMap = framebuffer = null;
  };

  const makeTexture = (width, height) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
  };

  const renderMap = (texture, mode) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    gl.viewport(0, 0, mapWidth, mapHeight);
    bindQuad(preProgram);
    gl.uniform1f(gl.getUniformLocation(preProgram, 'uMode'), mode);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return gl.getError() === gl.NO_ERROR;
  };

  const buildBeamMaps = () => {
    destroyMaps();
    const lowPower = mobileQuery.matches || (navigator.hardwareConcurrency || 4) <= 4;
    mapWidth = lowPower ? 256 : 384;
    mapHeight = lowPower ? 128 : 192;
    skyMap = makeTexture(mapWidth, mapHeight);
    diskMap = makeTexture(mapWidth, mapHeight);
    framebuffer = gl.createFramebuffer();

    // Make the canvas visibly dark-blue immediately while the GPU builds maps.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width || 1, canvas.height || 1);
    gl.clearColor(0.003, 0.007, 0.016, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const ok = renderMap(skyMap, 0.0) && renderMap(diskMap, 1.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      document.body.classList.add('academic-cosmos-fallback');
      return false;
    }
    document.body.classList.remove('academic-cosmos-fallback');
    return true;
  };

  let lowPower = false;
  let renderScale = 0.68;
  let maxPixels = 620000;
  let frameInterval = 1000 / 40;
  let frame = 0;
  let lastFrame = -Infinity;
  let startTime = performance.now();
  let mapsReady = false;

  const configurePerformance = () => {
    lowPower = mobileQuery.matches || (navigator.hardwareConcurrency || 4) <= 4;
    renderScale = lowPower ? 0.54 : 0.72;
    maxPixels = lowPower ? 340000 : 760000;
    frameInterval = lowPower ? 1000 / 30 : 1000 / 42;
  };

  const resizeCanvas = () => {
    configurePerformance();
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.0 : 1.15);
    let width = Math.max(1, Math.round(window.innerWidth * dpr * renderScale));
    let height = Math.max(1, Math.round(window.innerHeight * dpr * renderScale));
    const pixels = width * height;
    if (pixels > maxPixels) {
      const correction = Math.sqrt(maxPixels / pixels);
      width = Math.max(1, Math.round(width * correction));
      height = Math.max(1, Math.round(height * correction));
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const draw = now => {
    frame = 0;
    if (document.hidden || !mapsReady) return;
    if (now - lastFrame < frameInterval) {
      frame = requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    bindQuad(displayProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, skyMap);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uSkyMap'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, diskMap);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uDiskMap'), 1);

    gl.uniform2f(gl.getUniformLocation(displayProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(displayProgram, 'uMapTexel'), 1 / mapWidth, 1 / mapHeight);
    gl.uniform1f(gl.getUniformLocation(displayProgram, 'uTime'), (now - startTime) * 0.001);
    gl.uniform1f(gl.getUniformLocation(displayProgram, 'uPortrait'), window.innerWidth / Math.max(window.innerHeight, 1) < 0.82 ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
  };

  const start = () => {
    if (!mapsReady || document.hidden || frame) return;
    if (reducedMotion.matches) {
      draw(startTime + 9000);
      return;
    }
    lastFrame = -Infinity;
    frame = requestAnimationFrame(draw);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const rebuild = () => {
    stop();
    resizeCanvas();
    mapsReady = buildBeamMaps();
    startTime = performance.now();
    if (mapsReady) start();
  };

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const oldLowPower = lowPower;
      resizeCanvas();
      const newLowPower = mobileQuery.matches || (navigator.hardwareConcurrency || 4) <= 4;
      if (newLowPower !== oldLowPower) {
        rebuild();
      } else if (mapsReady) {
        if (reducedMotion.matches) draw(performance.now());
      }
    }, 140);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  reducedMotion.addEventListener('change', () => {
    stop();
    start();
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stop();
    document.body.classList.add('academic-cosmos-fallback');
  }, false);

  resizeCanvas();
  mapsReady = buildBeamMaps();
  if (mapsReady) start();
})();
