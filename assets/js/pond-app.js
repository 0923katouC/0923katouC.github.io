/* SPDX-License-Identifier: GPL-3.0-only
 * Pond experiment UI. Physics time is measured in GM/c³, not wall seconds.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const defaults = Object.freeze({ spin:.7, inclination:65, azimuth:0, accretionRate:.25,
    mass:4e6, thickness:.06, alpha:.1, magneticBeta:30, exposure:1.15,
    quality:'balanced', mode:'temperature', timeScale:8, zoom:1 });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let parameters={...defaults}, paused=motion.matches, renderer=null, model=null;
  let time=0, previousFrame=0, frame=0, lastMetrics=0, lastDraw=0, ready=false, stopped=false;
  let baseline=null, noticeTimer=null, lastStatus='loading', lastProgress=0, renderNeedsUpdate=true;
  const canvas=$('black-hole-canvas'), chart=$('density-profile'), ctx=chart.getContext('2d');
  const language=()=>document.documentElement.lang.startsWith('zh')?'zh':'en';
  function localized(element,zh,en) {
    if(!element)return;
    element.dataset.zh=zh;element.dataset.en=en;element.textContent=language()==='zh'?zh:en;
  }
  const superscript=number=>String(number).replace(/[-0-9]/g,c=>({'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'})[c]);
  function scientific(value,precision=1) {
    if(!Number.isFinite(value)||value===0)return '0';
    const exponent=Math.floor(Math.log10(Math.abs(value)));
    return `${(value/10**exponent).toFixed(precision)} × 10${superscript(exponent)}`;
  }
  function compact(value) {
    if(value>=1e4||value<.001)return scientific(value,2);
    return value>=100?value.toFixed(1):value>=1?value.toFixed(2):value.toPrecision(3);
  }
  const bindings=[
    {id:'spin',key:'spin',read:v=>v,write:v=>v,format:v=>v.toFixed(2)},
    {id:'accretion-rate',key:'accretionRate',read:v=>10**v,write:v=>Math.log10(v),format:v=>`${v.toFixed(2)} ṀEdd`},
    {id:'mass',key:'mass',read:v=>10**v,write:v=>Math.log10(v),format:v=>`${scientific(v)} M☉`},
    {id:'exposure',key:'exposure',read:v=>v,write:v=>v,format:v=>`${v.toFixed(2)}×`},
    {id:'thickness',key:'thickness',read:v=>v,write:v=>v,format:v=>v.toFixed(2)},
    {id:'alpha',key:'alpha',read:v=>v,write:v=>v,format:v=>v.toFixed(2)},
    {id:'magnetic-beta',key:'magneticBeta',read:v=>10**v,write:v=>Math.log10(v),format:v=>v.toFixed(0)},
    {id:'time-scale',key:'timeScale',read:v=>10**v,write:v=>Math.log10(v),format:v=>`${v<10?v.toFixed(1):v.toFixed(0)} tg/s`}
  ];
  function updateControls(writeValues=false) {
    for(const binding of bindings) {
      const value=parameters[binding.key];
      if(writeValues)$(binding.id).value=binding.write(value);
      $(binding.id+'-value').textContent=binding.format(value);
      $(binding.id).setAttribute('aria-valuetext',binding.format(value));
    }
    $('quality').value=parameters.quality;$('display-mode').value=parameters.mode;
    updateCameraReadout();
    $('pause-button').setAttribute('aria-pressed',String(paused));
    localized($('pause-label'),paused?'▶ 继续':'Ⅱ 暂停',paused?'▶ Resume':'Ⅱ Pause');
    const modes={temperature:['热辐射 · 伪彩色 / 相对强度','Thermal · false color / relative intensity'],redshift:['频移 g = νobs / νemit','Frequency shift g = νobs / νemit'],density:['盘面密度 · 相对值','Surface density · relative scale']};
    localized($('view-mode-label'),...modes[parameters.mode]);
    $('color-legend').hidden=parameters.mode==='temperature';$('color-legend').dataset.mode=parameters.mode;
    if(parameters.mode==='redshift'){localized($('legend-left'),'红移 g < 1','Redshift g < 1');localized($('legend-right'),'蓝移 g > 1','Blueshift g > 1');}
    if(parameters.mode==='density'){localized($('legend-left'),'低密度','Lower density');localized($('legend-right'),'高密度','Higher density');}
    $('thin-disk-warning').hidden=parameters.accretionRate<=.3;
  }
  function updateCameraReadout() {
    $('camera-readout').textContent=`φ ${Math.round(parameters.azimuth)}° · i ${Math.round(parameters.inclination)}° · ${parameters.zoom.toFixed(2)}×`;
  }
  function updateCamera(next) {
    parameters={...parameters,...next};renderNeedsUpdate=true;
    if(renderer)renderer.setParameters(next);
    updateCameraReadout();
  }
  const cameraInput=window.PondCamera.attach(canvas,{
    getCamera:()=>({azimuth:parameters.azimuth,inclination:parameters.inclination,zoom:parameters.zoom}),
    onChange:updateCamera,
    onActiveChange:active=>{renderNeedsUpdate=true;if(renderer)renderer.setInteractionActive(active);}
  });
  $('reset-view').addEventListener('click',()=>cameraInput.reset());
  function setBaseline() {
    if(!model)return;
    const profile=model.getProfile();baseline={radii:Array.from(profile.radii),density:Array.from(profile.density)};
  }
  function updateParameters(next) {
    const spinChanged=next.spin!==undefined && next.spin!==parameters.spin;
    parameters={...parameters,...next};renderNeedsUpdate=true;
    if(model)model.setParameters(parameters);
    if(renderer)renderer.setParameters(parameters);
    if(spinChanged){time=0;setBaseline();localized($('injection-status'),'自旋变化：盘已重新初始化','Spin changed: disk reinitialized');}
    updateControls();updateMetrics();
  }
  function updateMetrics() {
    if(!model)return;
    const d=model.getDiagnostics();time=d.time;
    $('metric-horizon').textContent=d.horizon.toFixed(3);
    $('metric-isco').textContent=d.isco.toFixed(3);
    $('metric-temperature').textContent=scientific(d.tempMax,1);
    $('metric-time').textContent=compact(d.timeUnit);
    $('simulation-clock').textContent=`t = ${time<10000?time.toFixed(0):scientific(time,1)} tg`;
    $('alpha-effective').textContent=`αeff = ${d.effectiveAlpha.toFixed(3)}`;
    const error=d.massBalanceError<1e-10?'< 10⁻¹⁰':scientific(d.massBalanceError,1);
    localized($('mass-ledger'),`质量收支误差 ${error}`,`Mass budget error ${error}`);
    drawProfile(model.getProfile());
  }
  function drawProfile(profile) {
    if(!ctx||!profile)return;
    const rect=chart.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    if(chart.width!==Math.round(width*dpr)||chart.height!==Math.round(height*dpr)){
      chart.width=Math.round(width*dpr);chart.height=Math.round(height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const pad={l:30,r:12,t:12,b:19},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
    const maxDensity=Math.max(1.2,...profile.density,...(baseline?baseline.density:[]))*1.13;
    const x=r=>pad.l+(r-profile.innerRadius)/(profile.outerRadius-profile.innerRadius)*w;
    const y=s=>pad.t+h-s/maxDensity*h;
    ctx.font='8px Consolas,monospace';ctx.textAlign='right';ctx.fillStyle='#616c79';ctx.lineWidth=.7;
    for(let i=0;i<3;i++){
      const value=maxDensity*i/2,yp=y(value);ctx.beginPath();ctx.strokeStyle='#27303b';ctx.moveTo(pad.l,yp);ctx.lineTo(width-pad.r,yp);ctx.stroke();ctx.fillText(value.toFixed(1),pad.l-6,yp+3);
    }
    ctx.textAlign='center';for(let radius=10;radius<=40;radius+=10){ctx.fillText(String(radius),x(radius),height-4);}
    function path(radii,density){ctx.beginPath();for(let i=0;i<radii.length;i++)i?ctx.lineTo(x(radii[i]),y(density[i])):ctx.moveTo(x(radii[i]),y(density[i]));}
    if(baseline){path(baseline.radii,baseline.density);ctx.setLineDash([3,4]);ctx.strokeStyle='#7d859055';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);}
    path(profile.radii,profile.density);ctx.lineTo(x(profile.outerRadius),y(0));ctx.lineTo(x(profile.innerRadius),y(0));ctx.closePath();
    const gradient=ctx.createLinearGradient(0,pad.t,0,height);gradient.addColorStop(0,'#d7a17838');gradient.addColorStop(1,'#d7a17802');ctx.fillStyle=gradient;ctx.fill();
    path(profile.radii,profile.density);ctx.strokeStyle='#d7a178';ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.stroke();
    ctx.textAlign='left';ctx.fillStyle='#99795d';ctx.fillText('ISCO',pad.l+2,pad.t+1);
    chart.setAttribute('aria-label',language()==='zh'?`径向面密度，ISCO ${profile.innerRadius.toFixed(2)} 至 ${profile.outerRadius} 引力半径，最大相对面密度 ${Math.max(...profile.density).toFixed(2)}`:`Radial surface density from ISCO ${profile.innerRadius.toFixed(2)} to ${profile.outerRadius} gravitational radii; peak relative density ${Math.max(...profile.density).toFixed(2)}`);
  }
  function renderStatus(status) {
    lastStatus=status.state;lastProgress=status.progress||0;
    const el=$('render-status');el.dataset.state=status.state;
    if(status.state==='ready'){
      ready=true;renderNeedsUpdate=true;canvas.hidden=false;$('loading-overlay').hidden=true;$('fallback-image').hidden=true;
      localized(el,canvas.dataset.preview==='true'?'拖动预览':'画面就绪',canvas.dataset.preview==='true'?'Moving view':'View ready');
    }else if(status.state==='tracing'){
      const percent=Math.round(lastProgress*100);
      localized(el,`${ready?'细化画面':'光线计算'} ${percent}%`,`${ready?'Refining view':'Tracing rays'} ${percent}%`);
    }else if(status.state==='error'){
      ready=false;canvas.hidden=true;$('loading-overlay').hidden=false;$('loading-overlay').dataset.error='true';
      $('fallback-image').hidden=false;$('retry-button').hidden=false;
      localized(el,'静态预览','Static preview');
      localized($('loading-title'),'当前设备无法启用光线渲染','Ray tracing unavailable on this device');
      localized($('loading-description'),'下方显示默认参数的静态预览。可尝试更新浏览器或开启硬件加速；径向流体模型仍可交互。','The default-parameter static preview is shown. Try a current browser or enable hardware acceleration. The radial fluid model remains interactive.');
      console.warn('Pond renderer unavailable:',status.message);
    }else localized(el,'初始化…','Initializing…');
  }
  function animate(now) {
    if(stopped)return;
    const dt=previousFrame?Math.min((now-previousFrame)/1000,.1):0;previousFrame=now;
    if(!document.hidden){
      if(model&&!paused&&(ready||lastStatus==='error'))model.step(dt*parameters.timeScale);
      if(model)time=model.getDiagnostics().time;
      const drawDue=renderNeedsUpdate||lastStatus!=='ready'||now-lastDraw>=1000/30;
      if(renderer&&!renderer.failed&&drawDue&&(!paused||renderNeedsUpdate||lastStatus!=='ready')){lastDraw=now;renderNeedsUpdate=false;renderer.render(time,model?model.getProfile():null);}
      if(now-lastMetrics>150){updateMetrics();lastMetrics=now;}
    }
    frame=requestAnimationFrame(animate);
  }
  for(const binding of bindings)$(binding.id).addEventListener('input',event=>updateParameters({[binding.key]:binding.read(Number(event.target.value))}));
  $('quality').addEventListener('change',event=>updateParameters({quality:event.target.value}));
  $('display-mode').addEventListener('change',event=>updateParameters({mode:event.target.value}));
  $('pause-button').addEventListener('click',()=>{paused=!paused;updateControls();});
  $('reset-button').addEventListener('click',()=>{
    cameraInput.cancel();
    parameters={...defaults};paused=motion.matches;time=0;renderNeedsUpdate=true;
    if(model){model.setParameters(parameters);model.reset();setBaseline();}
    if(renderer)renderer.setParameters(parameters);
    clearTimeout(noticeTimer);localized($('injection-status'),'','');updateControls(true);updateMetrics();
  });
  $('inject-ring').addEventListener('click',()=>{
    if(!model)return;model.injectRing();renderNeedsUpdate=true;updateMetrics();
    localized($('injection-status'),'已注入 · r = 18 rg','Injected · r = 18 rg');
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>localized($('injection-status'),'',''),4500);
  });
  $('retry-button').addEventListener('click',()=>window.location.reload());
  const resizeObserver=new ResizeObserver(()=>{renderNeedsUpdate=true;if(renderer)renderer.resize();updateMetrics();});resizeObserver.observe($('viewport'));resizeObserver.observe(chart);
  const languageObserver=new MutationObserver(()=>{updateControls();updateMetrics();renderStatus({state:lastStatus,progress:lastProgress});});languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  motion.addEventListener('change',event=>{if(event.matches){paused=true;updateControls();}});
  document.addEventListener('visibilitychange',()=>{previousFrame=0;});
  window.addEventListener('pagehide',()=>{stopped=true;cancelAnimationFrame(frame);clearTimeout(noticeTimer);resizeObserver.disconnect();languageObserver.disconnect();cameraInput.destroy();if(renderer)renderer.destroy();});
  // Restore an intact page when a browser reuses its back/forward cache.
  window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
  updateControls(true);
  try {
    if(!window.PondPhysics)throw new Error('Physics module missing');
    model=window.PondPhysics.createModel(parameters);setBaseline();updateMetrics();
  }catch(error){console.error('Pond fluid model:',error);$('inject-ring').disabled=true;}
  async function start(){
    try{
      if(!window.PondRenderer)throw new Error('Renderer module missing');
      renderer=new window.PondRenderer(canvas,renderStatus);renderer.setParameters(parameters);await renderer.init();
    }catch(error){renderStatus({state:'error',message:error.message});}
    if(!stopped)frame=requestAnimationFrame(animate);
  }
  // Read-only inspection hooks keep scientific diagnostics accessible to tests.
  window.PondExperiment={getDiagnostics:()=>({parameters:{...parameters},paused,time,physics:model?model.getDiagnostics():null,renderer:renderer?renderer.getDiagnostics():null}),getRenderer:()=>renderer};
  start();
})();
