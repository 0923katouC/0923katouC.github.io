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

      vec3 color = vec3(0.004, 0.008, 0.017);
      float galacticBand = bell((p.y + 0.16 * p.x + 0.10) * 2.6);
      color += vec3(0.010, 0.018, 0.038) * galacticBand;
      color += vec3(0.010, 0.005, 0.018) * bell((p.y - 0.28 * p.x - 0.24) * 3.2);

      vec2 starCell = gl_FragCoord.xy / 18.0;
      vec2 starId = floor(starCell);
      vec2 starLocal = fract(starCell) - 0.5;
      vec2 jitter = vec2(
        hash21(starId + vec2(17.0, 3.0)),
        hash21(starId + vec2(5.0, 29.0))
      ) - 0.5;
      float starSeed = hash21(starId + vec2(41.0, 71.0));
      float starDistance = length(starLocal - 0.74 * jitter);
      float star = smoothstep(0.072, 0.0, starDistance) * step(0.885, starSeed);
      float twinkle = 0.76 + 0.24 * sin(uTime * (0.35 + starSeed) + starSeed * 31.0);
      vec3 starTint = mix(vec3(0.56, 0.72, 1.00), vec3(1.00, 0.82, 0.62), hash21(starId + 9.0));
      color += starTint * star * twinkle * (0.34 + 0.95 * starSeed);

      vec2 center = mix(vec2(0.18, 0.015), vec2(0.0, 0.055), uPortrait);
      float sceneScale = mix(1.0, 0.68, uPortrait);
      vec2 q = (p - center) / sceneScale;
      float r = length(q);

      vec2 diskPlane = rotate2d(-0.15) * q;
      float axial = abs(diskPlane.y);
      float jetWidth = 0.012 + 0.074 * axial;
      float jetCore = bell(diskPlane.x / max(jetWidth, 0.002));
      float jetSheath = bell(diskPlane.x / max(jetWidth * 2.7, 0.004));
      float jetWindow = smoothstep(0.075, 0.135, axial) * (1.0 - smoothstep(0.24, 0.78, axial));
      float jetPulse = 0.68 + 0.32 * sin(axial * 47.0 - uTime * 1.65);
      float jet = jetWindow * (0.78 * jetCore + 0.22 * jetSheath) * jetPulse;
      color += vec3(0.055, 0.21, 0.46) * jet * 0.95;
      color += vec3(0.18, 0.47, 0.78) * jetCore * jetWindow * 0.17;

      float diskY = diskPlane.y / 0.255;
      float diskR = length(vec2(diskPlane.x, diskY));
      float diskMask = smoothstep(0.50, 0.465, diskR) * smoothstep(0.135, 0.158, diskR);
      float diskAngle = atan(diskY, diskPlane.x);
      float band1 = sin(diskR * 92.0 - uTime * 0.38 + sin(diskAngle * 5.0 - uTime * 0.18) * 1.8);
      float band2 = sin(diskR * 207.0 + diskAngle * 9.0 + uTime * 0.12);
      float texture = 0.76 + 0.16 * band1 + 0.08 * band2;
      float innerHeat = 1.0 - smoothstep(0.16, 0.48, diskR);
      float doppler = 0.58 + 0.66 * smoothstep(-0.92, 0.78, diskPlane.x / max(diskR, 0.001));
      vec3 outerDisk = vec3(0.22, 0.038, 0.008);
      vec3 innerDisk = vec3(1.00, 0.64, 0.22);
      vec3 diskColor = mix(outerDisk, innerDisk, innerHeat);
      color += diskColor * diskMask * texture * doppler * 1.28;

      float lensArc = bell((r - 0.137) / 0.015);
      float farSide = 0.38 + 0.62 * smoothstep(-0.09, 0.09, diskPlane.y);
      color += vec3(1.00, 0.46, 0.12) * lensArc * farSide * 0.48;

      float shadow = 1.0 - smoothstep(0.103, 0.114, r);
      color = mix(color, vec3(0.00015, 0.0002, 0.00035), shadow);

      float photonRing = bell((r - 0.1185) / 0.0052);
      float ringAsymmetry = 0.64 + 0.36 * smoothstep(-0.9, 0.9, q.x / max(r, 0.001));
      color += vec3(1.00, 0.66, 0.27) * photonRing * ringAsymmetry * 0.86;

      float lensGlow = bell((r - 0.165) / 0.055) * (1.0 - shadow);
      color += vec3(0.07, 0.055, 0.085) * lensGlow * 0.20;

      float vignetteRadius = length(vec2(p.x / max(aspect, 0.65), p.y) * vec2(0.78, 0.90));
      float vignette = 1.0 - smoothstep(0.34, 0.86, vignetteRadius);
      color *= 0.72 + 0.28 * vignette;

      color = color / (1.0 + 0.55 * color);
      color = pow(max(color, 0.0), vec3(0.88));
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
  let renderScale = lowPower ? 0.52 : 0.76;
  let frameInterval = lowPower ? 1000 / 30 : 1000 / 45;
  let maxPixels = lowPower ? 430000 : 980000;
  let animationFrame = 0;
  let lastFrame = -Infinity;
  let startedAt = performance.now();

  const resize = () => {
    lowPower = window.innerWidth <= 820 || hardwareThreads <= 4 || deviceMemory <= 4;
    renderScale = lowPower ? 0.52 : 0.76;
    frameInterval = lowPower ? 1000 / 30 : 1000 / 45;
    maxPixels = lowPower ? 430000 : 980000;

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
