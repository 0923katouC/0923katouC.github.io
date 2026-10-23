/* SPDX-License-Identifier: GPL-3.0-only
 * Interactive Pond Kerr renderer, 2026. Uses unchanged NPGS metric helpers.
 * NPGS by baopinshui and contributors: ../vendor/npgs/README.md and LICENSE.
 * Public radii and time are in r_g=GM/c² and t_g=GM/c³. Only the geodesic
 * shader internally converts to the upstream Rs=2r_g convention.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const shaderBase = new URL('../shaders/', script ? script.src : document.baseURI);
  const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
  const VERTEX = `${HEADER}
    void main() {
      vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
      gl_Position=vec4(p*2.0-1.0,0.0,1.0);
    }`;
  const DEFAULTS = Object.freeze({ spin:0.7, inclination:65, exposure:1.15,
    quality:'balanced', mode:'temperature', mass:4e6, accretionRate:0.25,
    thickness:0.06, alpha:0.1, zoom:1 });
  const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
  const finite = (x, fallback) => Number.isFinite(Number(x)) ? Number(x) : fallback;
  function isco(spin) {
    const z1=1+Math.cbrt(1-spin*spin)*(Math.cbrt(1+spin)+Math.cbrt(1-spin));
    const z2=Math.sqrt(3*spin*spin+z1*z1);
    return 3+z2-Math.sign(spin)*Math.sqrt((3-z1)*(3+z1+2*z2));
  }

  class PondRenderer {
    constructor(canvas, onStatus) {
      if (!canvas) throw new Error('A canvas is required.');
      this.canvas=canvas;
      this.onStatus=typeof onStatus==='function' ? onStatus : () => {};
      this.parameters={...DEFAULTS};
      this.state='loading'; this.progress=0; this.ready=false; this.failed=false;
      this.width=0; this.height=0; this._programs=[]; this._textures=[];
      this._framebuffers=[]; this._current=null; this._pending=null;
      this._dirty=true; this._traceAt=0; this._profile=null;
      this._profileVersion=null; this._profileReference=null;
      this._mapWidth=0; this._mapHeight=0; this._destroyed=false;
      this._lost=event => {
        event.preventDefault(); this.failed=true; this.ready=false;
        this._status('error',0,'WebGL 上下文已中断，请刷新页面恢复。');
      };
      this.canvas.addEventListener('webglcontextlost',this._lost,false);
      this.canvas.dataset.renderer='pond-kerr';
    }

    async init() {
      try {
        const gl=this.gl=this.canvas.getContext('webgl2',{
          alpha:false, antialias:false, depth:false, stencil:false,
          preserveDrawingBuffer:false, powerPreference:'high-performance'
        });
        if(!gl || !gl.getExtension('EXT_color_buffer_float'))
          throw new Error('此设备需要支持 WebGL 2 与浮点渲染目标。');
        const names=['npgs-kerr.glsl','pond-trace.frag','pond-shade.frag','pond-compose.frag'];
        const source=await Promise.all(names.map(async name => {
          const response=await fetch(new URL(name,shaderBase));
          if(!response.ok)throw new Error(`无法加载着色器 ${name} (${response.status})`);
          return response.text();
        }));
        if(this._destroyed)return this;
        this._trace=this._program(source[0]+'\n'+source[1]);
        this._shade=this._program(source[2]);
        this._compose=this._program(source[3]);
        this._vao=gl.createVertexArray();gl.bindVertexArray(this._vao);
        gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
        this._profileTexture=this._texture(256,1,gl.RGBA32F);
        this._uploadProfile(null);
        this.resize();
        this._status('tracing',0,'正在计算 Kerr 光线…');
        return this;
      } catch(error) {
        this.failed=true;this._status('error',0,error.message);
        throw error;
      }
    }

    _status(state,progress,message='') {
      this.state=state;this.progress=progress;
      this.canvas.dataset.state=state;
      this.canvas.dataset.progress=String(Math.round(progress*100));
      this.onStatus({state,progress,message,width:this._mapWidth,height:this._mapHeight});
    }

    _program(source) {
      const gl=this.gl, program=gl.createProgram(),shaders=[];
      this._programs.push(program);
      for(const [type,code] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,HEADER+source]]) {
        const shader=gl.createShader(type);shaders.push(shader);
        gl.shaderSource(shader,code);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
          const log=gl.getShaderInfoLog(shader);
          shaders.forEach(s=>gl.deleteShader(s));throw new Error(`GLSL: ${log}`);
        }
        gl.attachShader(program,shader);
      }
      gl.linkProgram(program);shaders.forEach(s=>gl.deleteShader(s));
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      return {handle:program,locations:new Map()};
    }

    _uniform(program,name,type,...values) {
      if(!program.locations.has(name))program.locations.set(name,this.gl.getUniformLocation(program.handle,name));
      const location=program.locations.get(name);
      if(location!==null)this.gl[type](location,...values);
    }

    _texture(width,height,format) {
      const gl=this.gl,texture=gl.createTexture();this._textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,gl.RGBA,gl.FLOAT,null);
      return texture;
    }

    _framebuffer(textures) {
      const gl=this.gl,fbo=gl.createFramebuffer();this._framebuffers.push(fbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      textures.forEach((texture,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0));
      gl.drawBuffers(textures.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
        throw new Error('无法创建浮点光线缓存。');
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      return fbo;
    }

    _releaseCache(cache) {
      if(!cache)return;
      const gl=this.gl;
      [cache.hit,cache.sky,cache.radiance].forEach(texture=>{
        gl.deleteTexture(texture);this._textures=this._textures.filter(item=>item!==texture);
      });
      [cache.fbo,cache.shadeFbo].forEach(fbo=>{
        gl.deleteFramebuffer(fbo);this._framebuffers=this._framebuffers.filter(item=>item!==fbo);
      });
    }

    setParameters(next={}) {
      const old=this.parameters,p={...old,...next};
      p.spin=clamp(finite(p.spin,old.spin),-0.95,0.998);
      p.inclination=clamp(finite(p.inclination,old.inclination),0,88);
      p.exposure=clamp(finite(p.exposure,old.exposure),0.05,8);
      p.zoom=clamp(finite(p.zoom,old.zoom),0.6,2.0);
      p.thickness=clamp(finite(p.thickness,old.thickness),0,0.2);
      p.mass=Math.max(1,finite(p.mass,old.mass));
      if(next.accretion!==undefined && next.accretionRate===undefined)p.accretionRate=next.accretion;
      this.parameters=p;
      if(['spin','inclination','thickness','quality','zoom'].some(key=>p[key]!==old[key])) {
        this._dirty=true;this._traceAt=performance.now()+(this._current?120:0);
        this._status('tracing',0,'正在准备重新追踪光线…');
        if(p.quality!==old.quality)this.resize();
      }
      return this;
    }

    resize(width,height) {
      if(!this.gl || this._destroyed)return;
      const rect=this.canvas.getBoundingClientRect();
      const w=Math.max(1,Math.round(finite(width,rect.width||this.canvas.clientWidth||800)));
      const h=Math.max(1,Math.round(finite(height,rect.height||this.canvas.clientHeight||480)));
      const mobile=typeof matchMedia==='function' && matchMedia('(max-width: 760px), (pointer: coarse)').matches;
      const quality=this.parameters.quality;
      const base=typeof quality==='number'?clamp(quality,240,1024):
        quality==='high'?(mobile?480:840):quality==='low'?(mobile?280:440):(mobile?360:640);
      const mapW=Math.max(160,Math.min(base,Math.round(w*1.1)));
      const mapH=Math.max(120,Math.round(mapW*h/w));
      const maxPixels=mobile?500000:1600000;
      const dpr=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(maxPixels/(w*h)));
      const outputW=Math.max(1,Math.round(w*dpr)),outputH=Math.max(1,Math.round(h*dpr));
      if(this.canvas.width!==outputW || this.canvas.height!==outputH) {
        this.canvas.width=outputW;this.canvas.height=outputH;
      }
      this.width=w;this.height=h;this._mobile=mobile;
      if(mapW!==this._mapWidth || mapH!==this._mapHeight) {
        this._mapWidth=mapW;this._mapHeight=mapH;this._dirty=true;
        this._traceAt=performance.now()+(this._current?120:0);
        this._status('tracing',0,'正在适配画面尺寸…');
      }
    }

    _uploadProfile(profile) {
      if(profile && profile===this._profileReference && profile.version===this._profileVersion)return;
      const gl=this.gl;
      const inner=profile && Number.isFinite(profile.innerRadius)?profile.innerRadius:isco(this.parameters.spin);
      const outer=profile && Number.isFinite(profile.outerRadius)?profile.outerRadius:40;
      if(this._profile && (Math.abs(inner-this._profile.inner)>1e-5 || Math.abs(outer-this._profile.outer)>1e-5)) {
        this._dirty=true;this._traceAt=performance.now()+(this._current?80:0);
        this._status('tracing',0,'正在更新吸积盘内缘…');
      }
      const count=profile && profile.flux && profile.flux.length>=2?profile.flux.length:256;
      const data=new Float32Array(count*4);
      let fallbackMax=0;
      if(!profile) {
        for(let i=0;i<count;i++) {
          const r=inner*Math.pow(outer/inner,i/(count-1));
          data[4*i]=Math.pow(r,-3)*Math.max(0,1-Math.sqrt(inner/r));
          fallbackMax=Math.max(fallbackMax,data[4*i]);
        }
      }
      let tempMax=profile && profile.tempMax>0?profile.tempMax:0;
      for(let i=0;i<count;i++) {
        const f=profile?Math.max(0,finite(profile.flux[i],0)):data[4*i]/Math.max(fallbackMax,1e-20);
        const density=profile && profile.density?Math.max(0,finite(profile.density[i],0)):Math.sqrt(f);
        const temp=profile && profile.temperature?Math.max(0,finite(profile.temperature[i],0)):1e5*Math.pow(f,0.25);
        data[4*i]=f;data[4*i+1]=density;data[4*i+2]=temp;data[4*i+3]=1;
        tempMax=Math.max(tempMax,temp);
      }
      gl.bindTexture(gl.TEXTURE_2D,this._profileTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,count,1,0,gl.RGBA,gl.FLOAT,data);
      this._profile={inner,outer,tempMax:Math.max(1,tempMax)};
      this._profileReference=profile;this._profileVersion=profile?profile.version:null;
    }

    _beginTrace() {
      const gl=this.gl;
      this._releaseCache(this._pending);
      const width=this._mapWidth,height=this._mapHeight;
      const hit=this._texture(width,height,gl.RGBA32F),sky=this._texture(width,height,gl.RGBA32F);
      const fbo=this._framebuffer([hit,sky]);
      const radiance=this._texture(width,height,gl.RGBA16F);
      const shadeFbo=this._framebuffer([radiance]);
      this._pending={hit,sky,radiance,fbo,shadeFbo,width,height,row:0,
        parameters:{...this.parameters},profile:{...this._profile},started:performance.now()};
      this._dirty=false;
      this._status('tracing',0,'正在重算弯曲时空中的光线…');
    }

    _traceBatch() {
      const gl=this.gl,cache=this._pending,p=cache.parameters,program=this._trace;
      gl.bindFramebuffer(gl.FRAMEBUFFER,cache.fbo);
      gl.viewport(0,0,cache.width,cache.height);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.useProgram(program.handle);gl.bindVertexArray(this._vao);
      this._uniform(program,'uMapSize','uniform2f',cache.width,cache.height);
      this._uniform(program,'uSpin','uniform1f',p.spin);
      this._uniform(program,'uInclination','uniform1f',p.inclination);
      this._uniform(program,'uInner','uniform1f',cache.profile.inner*0.5);
      this._uniform(program,'uOuter','uniform1f',cache.profile.outer*0.5);
      this._uniform(program,'uThickness','uniform1f',p.thickness);
      // Constant vertical framing preserves the hole as the viewport changes.
      // On narrow screens widen vertically until the bright disk also fits.
      this._uniform(program,'uSpan','uniform1f',Math.max(28,40*cache.height/cache.width)/p.zoom);
      const rows=Math.min(this._mobile?6:8,cache.height-cache.row);
      gl.enable(gl.SCISSOR_TEST);gl.scissor(0,cache.row,cache.width,rows);
      gl.drawArrays(gl.TRIANGLES,0,3);gl.disable(gl.SCISSOR_TEST);
      cache.row+=rows;
      const progress=cache.row/cache.height;
      if(cache.row>=cache.height) {
        this._releaseCache(this._current);this._current=cache;this._pending=null;
        this.ready=true;
        this.canvas.dataset.rays=String(cache.width*cache.height);
        this.canvas.dataset.traceMs=String(Math.round(performance.now()-cache.started));
        this._status('ready',1,'Kerr 光线已就绪');
      } else if(Math.floor(progress*20)!==Math.floor(this.progress*20))
        this._status('tracing',progress,'正在计算 Kerr 光线…');
    }

    _bind(program,name,texture,unit) {
      const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
      this._uniform(program,name,'uniform1i',unit);
    }

    render(time,profile) {
      if(!this.gl || !this._trace || this.failed || this._destroyed)return;
      try {
        if(profile)this._uploadProfile(profile);
        if(this._dirty && performance.now()>=this._traceAt)this._beginTrace();
        if(this._pending && !this._dirty)this._traceBatch();
        const gl=this.gl,cache=this._current;
        if(!cache) {
          gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(0.003,0.005,0.009,1);
          gl.clear(gl.COLOR_BUFFER_BIT);return;
        }
        gl.bindVertexArray(this._vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER,cache.shadeFbo);
        gl.viewport(0,0,cache.width,cache.height);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        const shade=this._shade;gl.useProgram(shade.handle);
        this._bind(shade,'uHits',cache.hit,0);this._bind(shade,'uSky',cache.sky,1);
        this._bind(shade,'uProfile',this._profileTexture,2);
        const mode={temperature:0,thermal:0,redshift:1,density:2,intensity:3}[this.parameters.mode]||0;
        this._uniform(shade,'uTime','uniform1f',finite(time,0));
        this._uniform(shade,'uSpin','uniform1f',cache.parameters.spin);
        this._uniform(shade,'uInner','uniform1f',this._profile.inner);
        this._uniform(shade,'uOuter','uniform1f',this._profile.outer);
        this._uniform(shade,'uAccretionScale','uniform1f',Math.max(0,finite(this.parameters.accretionRate,0.25))/0.25);
        this._uniform(shade,'uMode','uniform1i',mode);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        gl.viewport(0,0,this.canvas.width,this.canvas.height);
        const compose=this._compose;gl.useProgram(compose.handle);
        this._bind(compose,'uRadiance',cache.radiance,0);
        this._uniform(compose,'uResolution','uniform2f',this.canvas.width,this.canvas.height);
        this._uniform(compose,'uExposure','uniform1f',this.parameters.exposure);
        this._uniform(compose,'uDiagnostic','uniform1i',mode===1 || mode===2?1:0);
        gl.drawArrays(gl.TRIANGLES,0,3);
      } catch(error) {
        this.failed=true;this._status('error',0,error.message);
        console.error('Pond Kerr renderer:',error);
      }
    }

    getDiagnostics() {
      const cache=this._current;
      return {state:this.state,progress:this.progress,ready:this.ready,
        rays:cache?cache.width*cache.height:0,width:cache?cache.width:0,
        height:cache?cache.height:0,parameters:{...this.parameters},
        profile:this._profile?{...this._profile}:null,
        traceMilliseconds:Number(this.canvas.dataset.traceMs||0)};
    }

    // Explicit test-only readback; the animation path never synchronizes or
    // reads the ray cache to CPU. Returned rows follow WebGL bottom-up order.
    readDebugCache() {
      const cache=this._current;
      if(!cache)return null;
      const gl=this.gl,count=cache.width*cache.height*4;
      const hits=new Float32Array(count),sky=new Float32Array(count);
      gl.bindFramebuffer(gl.FRAMEBUFFER,cache.fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(0,0,cache.width,cache.height,gl.RGBA,gl.FLOAT,hits);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,cache.width,cache.height,gl.RGBA,gl.FLOAT,sky);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      return {width:cache.width,height:cache.height,hits,sky};
    }

    destroy() {
      this._destroyed=true;this.ready=false;
      this.canvas.removeEventListener('webglcontextlost',this._lost,false);
      if(!this.gl)return;
      const gl=this.gl;
      this._textures.forEach(t=>gl.deleteTexture(t));
      this._framebuffers.forEach(f=>gl.deleteFramebuffer(f));
      this._programs.forEach(p=>gl.deleteProgram(p));
      if(this._vao)gl.deleteVertexArray(this._vao);
      this._textures=[];this._framebuffers=[];this._programs=[];
    }
  }
  window.PondRenderer=PondRenderer;
})();
