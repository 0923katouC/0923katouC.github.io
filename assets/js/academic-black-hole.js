(() => {
  const canvas = document.getElementById('academic-black-hole');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
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

  const VERTEX = `#version 300 es
    layout(location=0) in vec2 aPosition;
    out vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  // One-time screen-space beam tracing. The expensive geodesic integration is
  // performed once into three lookup textures, not on every animation frame.
  const PRECOMPUTE = `#version 300 es
    precision highp float;
    in vec2 vUv;
    layout(location=0) out vec4 oSky;
    layout(location=1) out vec4 oHit1;
    layout(location=2) out vec4 oHit2;

    const float ROBS = 15.0;
    const float XMAX = 1.35;
    const float YMAX = 0.675;
    const float RIN = 1.45;
    const float ROUT = 8.50;
    const float SPIN = 0.82;
    const float DPHI = 0.055;
    const int MAX_STEPS = 170;

    vec4 packHit(vec3 p, float g) {
      return vec4(p.xy / ROUT * 0.5 + 0.5, (clamp(g,0.30,1.95)-0.30)/1.65, 1.0);
    }

    void main() {
      vec2 screen = vec2(mix(-XMAX, XMAX, vUv.x), mix(-YMAX, YMAX, vUv.y));
      float screenR = length(screen);
      screen.x += SPIN * (0.021 + 0.012 * screen.x) * exp(-pow(screenR/0.32, 2.0));

      float inc = radians(74.0);
      vec3 cam = vec3(0.0, -ROBS*sin(inc), ROBS*cos(inc));
      vec3 n = normalize(cam);
      vec3 forward = -n;
      vec3 right = normalize(cross(forward, vec3(0.0,0.0,1.0)));
      vec3 up = normalize(cross(right, forward));
      float imageScale = 2.0 * tan(radians(29.0));
      vec3 ray = normalize(forward + imageScale*screen.x*right + imageScale*screen.y*up);

      float ndotr = dot(ray, n);
      vec3 tangentRaw = ray - ndotr*n;
      float tangentMag = max(length(tangentRaw), 1e-6);
      vec3 tangent = tangentRaw / tangentMag;

      float u = 1.0 / ROBS;
      float du = -ndotr / tangentMag * u;
      float cphi = 1.0;
      float sphi = 0.0;
      float drag = 0.0;
      float lz = clamp(cross(cam, ray).z / ROBS, -1.0, 1.0);
      vec3 previous = cam;
      bool active = true;
      bool escaped = false;
      bool captured = false;
      bool have1 = false;
      bool have2 = false;
      vec4 hit1 = vec4(0.5,0.5,0.5,0.0);
      vec4 hit2 = vec4(0.5,0.5,0.5,0.0);
      vec3 finalDir = ray;

      for (int i=0; i<MAX_STEPS; ++i) {
        if (!active) break;

        float un = u + du*DPHI;
        float dun = du + (-un + 1.5*un*un)*DPHI;
        const float CD = 0.9984878812;
        const float SD = 0.0549722750;
        float cphin = cphi*CD - sphi*SD;
        float sphin = sphi*CD + cphi*SD;
        float dragn = drag + SPIN*0.035*un*un*DPHI;

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

        vec3 pos = (cphin*n + sphin*tangent) / max(un, 1e-5);
        float frameAngle = dragn*(1.0 + 0.35*lz);
        pos.xy += frameAngle*vec2(-pos.y,pos.x);

        if (previous.z * pos.z <= 0.0 && abs(previous.z-pos.z) > 1e-6) {
          float f = previous.z / (previous.z-pos.z);
          vec3 h = mix(previous, pos, clamp(f,0.0,1.0));
          float rr = length(h.xy);
          if (rr >= RIN && rr <= ROUT && !have2) {
            vec3 seg = normalize(pos-previous);
            vec3 orbital = normalize(vec3(-h.y,h.x,0.0));
            float vv = clamp(sqrt(max(0.5/max(rr-1.0,0.55),0.0)),0.0,0.76);
            float gamma = inversesqrt(max(1.0-vv*vv,0.08));
            float mu = dot(-seg,orbital);
            float grav = sqrt(clamp(1.0-1.0/max(rr,1.001),0.03,1.0));
            float g = grav/(gamma*max(1.0-vv*mu,0.20));
            if (!have1) {
              hit1 = packHit(h,g);
              have1 = true;
            } else {
              hit2 = packHit(h,g);
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
        finalDir = normalize(cphi*n + sphi*tangent);
        finalDir.xy += drag*(1.0+0.35*lz)*vec2(-finalDir.y,finalDir.x);
        finalDir = normalize(finalDir);
      }

      float skyMask = escaped && !captured ? 1.0 : 0.0;
      oSky = vec4(finalDir*0.5+0.5, skyMask);
      oHit1 = hit1;
      oHit2 = hit2;
    }
  `;

  const DISPLAY = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D uSkyMap;
    uniform sampler2D uHit1;
    uniform sampler2D uHit2;
    uniform vec2 uResolution;
    uniform vec2 uMapTexel;
    uniform float uTime;
    uniform float uPortrait;

    const float PI = 3.141592653589793;
    const float XMAX = 1.35;
    const float YMAX = 0.675;
    const float ROUT = 8.50;

    float hash21(vec2 p) {
      p = fract(p*vec2(123.34,456.21));
      p += dot(p,p+45.32);
      return fract(p.x*p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i=floor(p), f=fract(p);
      f=f*f*(3.0-2.0*f);
      float a=hash21(i);
      float b=hash21(i+vec2(1.0,0.0));
      float c=hash21(i+vec2(0.0,1.0));
      float d=hash21(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }

    float starLayer(vec2 uv, float cells, float threshold, float radius, float salt) {
      vec2 p = uv*cells;
      vec2 id = floor(p);
      vec2 f = fract(p)-0.5;
      float seed = hash21(id+salt);
      vec2 jitter = vec2(hash21(id+salt+11.7),hash21(id+salt+43.1))-0.5;
      float d = length(f-jitter*0.70);
      return (1.0-smoothstep(0.0,radius,d))*step(threshold,seed);
    }

    vec3 skyColor(vec3 dir, vec2 screen, float escaped) {
      float lon = atan(dir.y,dir.x)/(2.0*PI)+0.5;
      float lat = asin(clamp(dir.z,-1.0,1.0))/PI+0.5;
      vec2 suv=vec2(lon,lat);

      vec3 galNormal=normalize(vec3(0.29,0.80,0.52));
      float band=exp(-pow(abs(dot(dir,galNormal))*4.2,2.0));
      float dust=valueNoise(suv*vec2(9.0,5.0)+vec2(3.1,8.7));
      vec3 col=vec3(0.0025,0.0055,0.0120);
      col += vec3(0.010,0.018,0.040)*band*(0.38+0.62*dust);

      float s1=starLayer(suv,430.0,0.91,0.105,7.0);
      float s2=starLayer(suv+vec2(0.17,0.09),180.0,0.935,0.085,31.0);
      float tw=0.84+0.16*sin(uTime*0.38+hash21(floor(suv*180.0))*31.0);
      vec3 tint=mix(vec3(0.62,0.78,1.00),vec3(1.00,0.84,0.65),hash21(floor(suv*180.0)+9.0));
      col += tint*(0.46*s1+1.15*s2)*tw;

      vec2 qp=screen*vec2(0.77,1.0)+vec2(0.31,0.62);
      float clean=starLayer(qp,95.0,0.947,0.075,67.0);
      clean *= smoothstep(0.34,0.56,length(screen));
      col += vec3(0.83,0.90,1.0)*clean*1.45;
      return col*escaped;
    }

    vec3 diskEmission(vec4 packed, float secondary) {
      float valid=smoothstep(0.16,0.80,packed.a);
      if (valid<=0.0) return vec3(0.0);
      vec2 xy=(packed.rg*2.0-1.0)*ROUT;
      float r=length(xy);
      float g=mix(0.30,1.95,packed.b);
      float phi=atan(xy.y,xy.x);
      float kepler=uTime*0.68/pow(max(r,1.45),1.5);
      float a=phi-kepler;

      float n1=valueNoise(vec2(r*1.55,a*2.65+0.16*uTime));
      float n2=valueNoise(vec2(r*3.15-0.08*uTime,a*5.10));
      float spiral=0.5+0.5*sin(5.5*log(max(r,1.46))+8.0*a+1.6*n1);
      float rings=0.5+0.5*sin(r*11.5-0.32*uTime+2.0*n2);
      float structure=0.46+0.31*n1+0.15*n2+0.17*spiral+0.10*rings;

      float heat=pow(clamp((ROUT-r)/(ROUT-1.45),0.0,1.0),0.66);
      vec3 outer=vec3(0.31,0.030,0.0025);
      vec3 warm=vec3(1.00,0.31,0.035);
      vec3 hot=vec3(1.00,0.83,0.48);
      vec3 color=mix(outer,warm,smoothstep(0.02,0.62,heat));
      color=mix(color,hot,smoothstep(0.58,0.96,heat));

      float edge=smoothstep(1.45,1.72,r)*(1.0-smoothstep(7.5,8.5,r));
      float beam=clamp(pow(g,3.0),0.13,5.6);
      float radial=0.20+1.55*pow(heat,1.58);
      return color*structure*edge*beam*radial*valid*secondary;
    }

    vec3 jetColor(vec2 q) {
      float ca=cos(-0.035), sa=sin(-0.035);
      q=mat2(ca,-sa,sa,ca)*q;
      float z=abs(q.y);
      float width=0.010+0.082*z;
      float spine=exp(-pow(q.x/max(width*0.34,0.002),2.0));
      float sheath=exp(-pow(q.x/max(width*1.55,0.004),2.0));
      float window=smoothstep(0.105,0.145,z)*(1.0-smoothstep(0.52,0.88,z));
      float knots=0.64+0.36*sin(z*43.0-uTime*1.75+0.75*sin(z*14.0));
      float turbulence=0.72+0.28*valueNoise(vec2(q.x*84.0,z*24.0-uTime*0.8));
      float fade=1.0-0.62*smoothstep(0.18,0.88,z);
      float j=window*knots*turbulence*fade;
      return vec3(0.045,0.25,0.72)*sheath*j*1.72
           + vec3(0.30,0.70,1.00)*spine*j*1.58;
    }

    void main() {
      vec2 p=(gl_FragCoord.xy-0.5*uResolution.xy)/uResolution.y;
      vec2 center=mix(vec2(0.20,-0.012),vec2(0.0,0.018),uPortrait);
      float sceneScale=mix(0.96,0.76,uPortrait);
      vec2 q=(p-center)/sceneScale;
      vec2 mapUv=vec2(q.x/(2.0*XMAX)+0.5,q.y/(2.0*YMAX)+0.5);
      mapUv=clamp(mapUv,uMapTexel*0.5,vec2(1.0)-uMapTexel*0.5);

      vec4 sky=texture(uSkyMap,mapUv);
      vec3 dir=normalize(sky.rgb*2.0-1.0);
      float escaped=smoothstep(0.18,0.82,sky.a);
      vec3 color=skyColor(dir,q,escaped);

      color += jetColor(q);
      vec4 h2=texture(uHit2,mapUv);
      vec4 h1=texture(uHit1,mapUv);
      vec3 d2=diskEmission(h2,0.58);
      vec3 d1=diskEmission(h1,1.00);
      color += d2+d1;

      float diskAlpha=max(smoothstep(0.16,0.80,h1.a),smoothstep(0.16,0.80,h2.a));
      float darkness=(1.0-escaped)*(1.0-diskAlpha);
      color=mix(color,vec3(0.00005,0.00008,0.00015),darkness);

      float ringBand=smoothstep(0.05,0.42,sky.a)*(1.0-smoothstep(0.42,0.90,sky.a));
      float sideBoost=0.58+0.55*smoothstep(-0.25,0.32,q.x);
      color += vec3(1.00,0.70,0.30)*ringBand*sideBoost*0.74;

      float vignette=1.0-smoothstep(0.38,1.16,length(vec2(p.x*0.72,p.y)));
      color*=0.74+0.26*vignette;
      color=vec3(1.0)-exp(-color*1.34);
      color=pow(max(color,0.0),vec3(0.88));
      fragColor=vec4(color,1.0);
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
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Academic black-hole shader link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  };

  const precomputeProgram = makeProgram(PRECOMPUTE);
  const displayProgram = makeProgram(DISPLAY);
  if (!precomputeProgram || !displayProgram) {
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 1,-1, -1,1,
    -1, 1, 1,-1, 1,1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hardwareThreads = navigator.hardwareConcurrency || 4;
  const deviceMemory = navigator.deviceMemory || 8;
  const lowPower = window.innerWidth <= 820 || hardwareThreads <= 4 || deviceMemory <= 4;
  const mapWidth = lowPower ? 384 : 512;
  const mapHeight = lowPower ? 192 : 256;

  const makeMapTexture = () => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,mapWidth,mapHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    return texture;
  };

  const maps = [makeMapTexture(),makeMapTexture(),makeMapTexture()];
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  maps.forEach((texture,index) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0+index, gl.TEXTURE_2D, texture, 0);
  });
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    document.body.classList.add('academic-cosmos-fallback');
    return;
  }

  gl.viewport(0,0,mapWidth,mapHeight);
  gl.useProgram(precomputeProgram);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteProgram(precomputeProgram);

  gl.useProgram(displayProgram);
  const resolutionLoc=gl.getUniformLocation(displayProgram,'uResolution');
  const texelLoc=gl.getUniformLocation(displayProgram,'uMapTexel');
  const timeLoc=gl.getUniformLocation(displayProgram,'uTime');
  const portraitLoc=gl.getUniformLocation(displayProgram,'uPortrait');
  gl.uniform2f(texelLoc,1/mapWidth,1/mapHeight);
  maps.forEach((texture,index) => {
    gl.activeTexture(gl.TEXTURE0+index);
    gl.bindTexture(gl.TEXTURE_2D,texture);
  });
  gl.uniform1i(gl.getUniformLocation(displayProgram,'uSkyMap'),0);
  gl.uniform1i(gl.getUniformLocation(displayProgram,'uHit1'),1);
  gl.uniform1i(gl.getUniformLocation(displayProgram,'uHit2'),2);

  let animationFrame=0;
  let lastFrame=-Infinity;
  let startedAt=performance.now();
  let renderScale=lowPower ? 0.62 : 0.82;
  let maxPixels=lowPower ? 460000 : 1050000;
  let frameInterval=lowPower ? 1000/30 : 1000/45;

  const resize = () => {
    const mobile=window.innerWidth<=820;
    renderScale=mobile ? 0.62 : (lowPower ? 0.70 : 0.82);
    maxPixels=mobile ? 460000 : (lowPower ? 690000 : 1050000);
    frameInterval=mobile ? 1000/30 : (lowPower ? 1000/36 : 1000/45);
    const dpr=Math.min(window.devicePixelRatio||1,mobile ? 1.0 : 1.15);
    let width=Math.max(1,Math.round(window.innerWidth*dpr*renderScale));
    let height=Math.max(1,Math.round(window.innerHeight*dpr*renderScale));
    const pixels=width*height;
    if (pixels>maxPixels) {
      const factor=Math.sqrt(maxPixels/pixels);
      width=Math.max(1,Math.round(width*factor));
      height=Math.max(1,Math.round(height*factor));
    }
    if (canvas.width!==width || canvas.height!==height) {
      canvas.width=width;
      canvas.height=height;
    }
    gl.viewport(0,0,width,height);
    gl.useProgram(displayProgram);
    gl.uniform2f(resolutionLoc,width,height);
    gl.uniform1f(portraitLoc,window.innerWidth/Math.max(window.innerHeight,1)<0.82 ? 1 : 0);
  };

  const draw = now => {
    animationFrame=0;
    if (document.hidden) return;
    if (now-lastFrame<frameInterval) {
      animationFrame=requestAnimationFrame(draw);
      return;
    }
    lastFrame=now;
    gl.useProgram(displayProgram);
    gl.uniform1f(timeLoc,(now-startedAt)*0.001);
    gl.drawArrays(gl.TRIANGLES,0,6);
    if (!reducedMotion.matches) animationFrame=requestAnimationFrame(draw);
  };

  const start = () => {
    if (animationFrame || document.hidden) return;
    if (reducedMotion.matches) {
      gl.uniform1f(timeLoc,9.0);
      gl.drawArrays(gl.TRIANGLES,0,6);
      return;
    }
    startedAt=performance.now();
    lastFrame=-Infinity;
    animationFrame=requestAnimationFrame(draw);
  };

  const stop = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame=0;
  };

  window.addEventListener('resize',() => {
    resize();
    if (reducedMotion.matches) {
      gl.uniform1f(timeLoc,9.0);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
  },{passive:true});

  document.addEventListener('visibilitychange',() => {
    if (document.hidden) stop(); else start();
  });
  reducedMotion.addEventListener('change',() => { stop(); start(); });

  resize();
  start();
})();
