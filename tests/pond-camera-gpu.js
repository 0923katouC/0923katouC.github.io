/* Integration checks execute the production renderer on the actual GPU. */
(async()=>{
  const output=document.getElementById('results'),lines=[];
  const log=s=>{lines.push(s);output.textContent=lines.join('\n');};
  const check=(ok,s)=>{log((ok?'PASS ':'FAIL ')+s);if(!ok)throw Error(s);};
  const model=PondPhysics.createModel(), profile=model.getProfile();
  const renderer=new PondRenderer(document.getElementById('camera-test'));
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  async function settle(){
    const start=performance.now();
    do{renderer.render(0,profile);if(renderer.failed)throw Error('Renderer failed');
      if(renderer.state==='ready'&&!renderer.getDiagnostics().preview)return;
      if(performance.now()-start>60000)throw Error('Refinement timed out');
      await tick();
    }while(true);
  }
  function pixels(){const gl=renderer.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const a=new Uint8Array(renderer.canvas.width*renderer.canvas.height*4);
    gl.readPixels(0,0,renderer.canvas.width,renderer.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;}
  try{
    await renderer.init();renderer.setParameters({quality:480});await settle();
    const mass=model.getDiagnostics().diskMass;
    renderer.setInteractionActive(true);
    let lastPreview=renderer.getDiagnostics().previewFrames;
    for(const inclination of [40,90,135]){
      renderer.setParameters({inclination});renderer.render(0,profile);
      const d=renderer.getDiagnostics();
      check(d.preview&&d.previewFrames===lastPreview+1&&d.renderedParameters.inclination===inclination,
        `actual camera i=${inclination} drawn in one render call, before release`);
      lastPreview=d.previewFrames;
      const cache=renderer.readDebugCache();
      check(cache.hits.every(Number.isFinite),`finite ray cache at i=${inclination}`);
    }
    renderer.render(0,profile);const before=pixels(),cacheBefore=renderer.readDebugCache();
    const generation=renderer.getDiagnostics().traceGeneration;
    renderer.setParameters({azimuth:73});renderer.render(0,profile);
    const after=pixels(),cacheAfter=renderer.readDebugCache();
    check(cacheBefore.hits.every((v,i)=>v===cacheAfter.hits[i])&&renderer.getDiagnostics().traceGeneration===generation,
      'horizontal orbit uses identical axisymmetric geodesics');
    const differences=after.reduce((n,v,i)=>n+(Math.abs(v-before[i])>2?1:0),0);
    check(differences>50&&renderer.getDiagnostics().renderedParameters.azimuth===73,
      `horizontal orbit changes displayed pixels immediately (${differences} channels)`);
    renderer.setInteractionActive(false);await settle();
    const refined=renderer.getDiagnostics();
    check(!refined.preview&&refined.width===480&&refined.renderedParameters.inclination===135,
      'release refines the same view at final resolution');
    check(model.getDiagnostics().time===0&&model.getDiagnostics().diskMass===mass,
      'camera motion does not advance fluid time or change stored mass');
    renderer.render(1e7,profile);const late=pixels();
    check(!renderer.failed&&late.some((v,i)=>i%4!==3&&v>20),'late-time filtered texture remains renderable');
    document.body.dataset.result='pass';log('ALL CAMERA GPU CHECKS PASSED');
  }catch(error){document.body.dataset.result='fail';log('ERROR '+error.message);}
})();
