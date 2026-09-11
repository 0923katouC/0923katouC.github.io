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

  const vertexSource = `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uPortrait;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    mat2 rotate2d(float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c);
    }

    float bell(float x) {
      return exp(-x * x);
    }

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      float aspect = uResolution.x / uResolution.y;

      vec2 center = mix(vec2(0.18, 0.015), vec2(0.0, 0.055), uPortrait);
      float sceneScale = mix(1.0, 0.68, uPortrait);
      vec2 q = (p - center) / sceneScale;
      float r = length(q);
      float spin = 0.86;

      vec3 color = vec3(0.0035, 0.0075, 0.016);
      float galacticBand = bell((p.y + 0.16 * p.x + 0.10) * 2.55);
      color += vec3(0.012, 0.022, 0.050) * galacticBand;
      color += vec3(0.012, 0.006, 0.022) * bell((p.y - 0.28 * p.x - 0.24) * 3.1);

      // Slight pseudo-lensing of the stellar background near the compact object.
      vec2 bendDirection = q / max(r, 0.035);
      float bendStrength = 0.0048 * exp(-r * 4.3) / (r + 0.075);
      vec2 starPixel = gl_FragCoord.xy + bendDirection * bendStrength * uResolution.y;

      // Dense faint star layer.
      vec2 starCellA = starPixel / 15.0;
      vec2 starIdA = floor(starCellA);
      vec2 starLocalA = fract(starCellA) - 0.5;
      vec2 jitterA = vec2(
        hash21(starIdA + vec2(17.0, 3.0)),
        hash21(starIdA + vec2(5.0, 29.0))
      ) - 0.5;
      float seedA = hash21(starIdA + vec2(41.0, 71.0));
      float distA = length(starLocalA - 0.76 * jitterA);
      float starA = (1.0 - smoothstep(0.0, 0.083, distA)) * step(0.78, seedA);
      float twinkleA = 0.78 + 0.22 * sin(uTime * (0.28 + seedA * 0.62) + seedA * 31.0);
      vec3 tintA = mix(vec3(0.55, 0.72, 1.00), vec3(1.00, 0.83, 0.64), hash21(starIdA + vec2(9.0)));
      color += tintA * starA * twinkleA * (0.24 + 0.58 * seedA);

      // Sparser, brighter stars with tiny diffraction-like cores.
      vec2 starCellB = starPixel / 34.0;
      vec2 starIdB = floor(starCellB);
      vec2 starLocalB = fract(starCellB) - 0.5;
      vec2 jitterB = vec2(
        hash21(starIdB + vec2(73.0, 11.0)),
        hash21(starIdB + vec2(19.0, 59.0))
      ) - 0.5;
      vec2 brightDelta = starLocalB - 0.72 * jitterB;
      float seedB = hash21(starIdB + vec2(91.0, 37.0));
      float distB = length(brightDelta);
      float coreB = (1.0 - smoothstep(0.0, 0.072, distB)) * step(0.86, seedB);
      float rayB = (bell(brightDelta.x / 0.025) + bell(brightDelta.y / 0.025)) * 0.10 * step(0.94, seedB);
      float twinkleB = 0.80 + 0.20 * sin(uTime * (0.20 + seedB * 0.45) + seedB * 48.0);
      vec3 tintB = mix(vec3(0.68, 0.80, 1.00), vec3(1.00, 0.90, 0.72), hash21(starIdB + vec2(13.0)));
      color += tintB * (coreB * 1.32 + rayB) * twinkleB;

      // Disk coordinates with a small near-hole frame-dragging shear.
      vec2 diskPlane = rotate2d(-0.14) * q;
      float drag = spin * 0.030 * exp(-r * 5.1) * diskPlane.y / max(r, 0.045);
      diskPlane.x += drag;

      // Bipolar jet: broad sheath, narrow spine, and moving knots.
      float axial = abs(diskPlane.y);
      float jetWidth = 0.010 + 0.080 * axial;
      float jetCore = bell(diskPlane.x / max(jetWidth * 0.48, 0.002));
      float jetSheath = bell(diskPlane.x / max(jetWidth * 2.15, 0.004));
      float jetWindow = smoothstep(0.095, 0.145, axial) * (1.0 - smoothstep(0.42, 0.93, axial));
      float jetKnots = 0.70 + 0.30 * sin(axial * 44.0 - uTime * 1.45 + 0.7 * sin(axial * 13.0));
      float jetFade = 1.0 - smoothstep(0.18, 0.93, axial) * 0.62;
      float jet = jetWindow * jetFade * jetKnots;
      color += vec3(0.055, 0.24, 0.68) * jetSheath * jet * 1.55;
      color += vec3(0.24, 0.62, 1.00) * jetCore * jet * 1.40;
      color += vec3(0.72, 0.88, 1.00) * bell(diskPlane.x / max(jetWidth * 0.22, 0.0015)) * jet * 0.34;

      // Direct image of a thin, inclined accretion disk.
      float diskY = diskPlane.y / 0.205;
      float diskR = length(vec2(diskPlane.x, diskY));
      float outerDiskMask = 1.0 - smoothstep(0.535, 0.575, diskR);
      float innerDiskMask = smoothstep(0.145, 0.170, diskR);
      float directDisk = outerDiskMask * innerDiskMask;
      float diskAngle = atan(diskY, diskPlane.x);
      float radialBands = 0.73
        + 0.17 * sin(diskR * 92.0 - uTime * 0.48 + sin(diskAngle * 5.0 - uTime * 0.19) * 1.7)
        + 0.10 * sin(diskR * 198.0 + diskAngle * 8.0 + uTime * 0.16);
      float innerHeat = 1.0 - smoothstep(0.165, 0.50, diskR);
      float approachingSide = smoothstep(-0.88, 0.76, diskPlane.x / max(diskR, 0.001));
      float doppler = 0.38 + 1.42 * approachingSide;
      vec3 coolDisk = vec3(0.26, 0.045, 0.007);
      vec3 hotDisk = vec3(1.00, 0.73, 0.31);
      vec3 whiteHot = vec3(1.00, 0.91, 0.71);
      vec3 diskColor = mix(coolDisk, hotDisk, innerHeat);
      diskColor = mix(diskColor, whiteHot, innerHeat * innerHeat * 0.46);
      float backDisk = directDisk * smoothstep(-0.045, 0.075, diskPlane.y);
      float frontDisk = directDisk * (1.0 - smoothstep(-0.060, 0.055, diskPlane.y));
      color += diskColor * backDisk * radialBands * doppler * 1.62;

      // Strong-field lensing: the far disk is lifted over the shadow and a
      // fainter secondary image appears below it.
      float arcX = clamp(diskPlane.x / 0.57, -1.0, 1.0);
      float arcRoot = sqrt(max(0.0, 1.0 - arcX * arcX));
      float upperArcY = 0.047 + 0.190 * arcRoot + 0.018 * spin * arcX;
      float upperWidth = 0.015 + 0.030 * arcRoot;
      float upperXMask = 1.0 - smoothstep(0.54, 0.59, abs(diskPlane.x));
      float upperArc = bell((diskPlane.y - upperArcY) / upperWidth) * upperXMask;
      float upperSourceR = 0.19 + 0.38 * (0.50 + 0.50 * arcRoot);
      float upperTexture = 0.76
        + 0.16 * sin(upperSourceR * 122.0 + diskPlane.x * 24.0 - uTime * 0.40)
        + 0.08 * sin(diskPlane.x * 57.0 + uTime * 0.15);
      float upperBoost = 0.50 + 1.30 * smoothstep(-0.52, 0.45, diskPlane.x);
      vec3 upperColor = mix(vec3(0.46, 0.075, 0.008), vec3(1.00, 0.72, 0.29), arcRoot);
      color += upperColor * upperArc * upperTexture * upperBoost * 1.26;

      float lowerArcY = -0.050 - 0.105 * arcRoot + 0.010 * spin * arcX;
      float lowerXMask = 1.0 - smoothstep(0.45, 0.50, abs(diskPlane.x));
      float lowerArc = bell((diskPlane.y - lowerArcY) / (0.010 + 0.014 * arcRoot)) * lowerXMask;
      color += vec3(0.65, 0.18, 0.035) * lowerArc * (0.42 + 0.50 * approachingSide) * 0.52;

      // Kerr-like shadow: horizontal displacement plus a weak D-shape.
      vec2 shadowQ = q + vec2(0.016 * spin, 0.0);
      float shadowPhi = atan(shadowQ.y, shadowQ.x);
      float shadowR = length(vec2(shadowQ.x * 0.985, shadowQ.y));
      float shadowEdge = 0.108
        * (1.0 - 0.060 * spin * cos(shadowPhi) + 0.022 * spin * cos(2.0 * shadowPhi));
      float shadow = 1.0 - smoothstep(shadowEdge, shadowEdge + 0.006, shadowR);
      color = mix(color, vec3(0.00008, 0.00012, 0.00025), shadow);

      // Offset asymmetric photon ring and a thin secondary ring.
      vec2 ringQ = q + vec2(0.011 * spin, 0.0);
      float ringPhi = atan(ringQ.y, ringQ.x);
      float ringR = length(ringQ);
      float ringTarget = 0.124 - 0.0075 * spin * cos(ringPhi);
      float photonRing = bell((ringR - ringTarget) / 0.0046);
      float secondaryRing = bell((ringR - (ringTarget + 0.0105)) / 0.0032);
      float ringBoost = 0.48 + 1.20 * smoothstep(-0.86, 0.72, cos(ringPhi));
      color += vec3(1.00, 0.72, 0.34) * photonRing * ringBoost * 1.02;
      color += vec3(1.00, 0.38, 0.08) * secondaryRing * ringBoost * 0.22;

      // Foreground disk crosses the lower part of the lensed image.
      color += diskColor * frontDisk * radialBands * doppler * 1.86;

      float lensGlow = bell((ringR - 0.158) / 0.050) * (1.0 - shadow);
      color += vec3(0.080, 0.060, 0.095) * lensGlow * 0.24;

      float vignetteRadius = length(vec2(p.x / max(aspect, 0.65), p.y) * vec2(0.78, 0.90));
      float vignette = 1.0 - smoothstep(0.34, 0.88, vignetteRadius);
      color *= 0.74 + 0.26 * vignette;

      color = color / (1.0 + 0.48 * color);
      color = pow(max(color, 0.0), vec3(0.86));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Academic background shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Academic background shader link failed:', gl.getProgramInfoLog(program));
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
  const timeLocation = gl.getUniformLocation(program, 'uTime');
  const portraitLocation = gl.getUniformLocation(program, 'uPortrait');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hardwareThreads = navigator.hardwareConcurrency || 4;
  const deviceMemory = navigator.deviceMemory || 8;
  let lowPower = window.innerWidth <= 820 || hardwareThreads <= 4 || deviceMemory <= 4;
  let renderScale = lowPower ? 0.50 : 0.74;
  let frameInterval = lowPower ? 1000 / 30 : 1000 / 45;
  let maxPixels = lowPower ? 360000 : 920000;
  let animationFrame = 0;
  let lastFrame = -Infinity;
  let startedAt = performance.now();

  const resize = () => {
    lowPower = window.innerWidth <= 820 || hardwareThreads <= 4 || deviceMemory <= 4;
    renderScale = lowPower ? 0.50 : 0.74;
    frameInterval = lowPower ? 1000 / 30 : 1000 / 45;
    maxPixels = lowPower ? 360000 : 920000;

    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.0 : 1.15);
    let width = Math.max(1, Math.round(window.innerWidth * dpr * renderScale));
    let height = Math.max(1, Math.round(window.innerHeight * dpr * renderScale));
    const pixelCount = width * height;
    if (pixelCount > maxPixels) {
      const correction = Math.sqrt(maxPixels / pixelCount);
      width = Math.max(1, Math.round(width * correction));
      height = Math.max(1, Math.round(height * correction));
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    gl.uniform2f(resolutionLocation, width, height);
    gl.uniform1f(portraitLocation, window.innerWidth / Math.max(window.innerHeight, 1) < 0.82 ? 1 : 0);
  };

  const draw = now => {
    animationFrame = 0;
    if (document.hidden) return;
    if (now - lastFrame < frameInterval) {
      animationFrame = requestAnimationFrame(draw);
      return;
    }

    lastFrame = now;
    gl.uniform1f(timeLocation, (now - startedAt) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!reducedMotion.matches) animationFrame = requestAnimationFrame(draw);
  };

  const start = () => {
    if (animationFrame || document.hidden) return;
    if (reducedMotion.matches) {
      gl.uniform1f(timeLocation, 11.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }
    startedAt = performance.now();
    lastFrame = -Infinity;
    animationFrame = requestAnimationFrame(draw);
  };

  const stop = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };

  window.addEventListener('resize', () => {
    resize();
    if (reducedMotion.matches) {
      gl.uniform1f(timeLocation, 11.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  reducedMotion.addEventListener('change', () => {
    stop();
    start();
  });

  resize();
  start();
})();
