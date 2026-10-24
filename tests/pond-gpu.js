/* GPU readback tests for actual production shaders. */
(async()=>{
  const output=document.getElementById('results'), canvas=document.getElementById('test-canvas');
  const lines=[]; const log=s=>{lines.push(s);output.textContent=lines.join('\n');};
  const renderer=new PondRenderer(canvas,()=>{});
  let failed=false;
  const check=(condition,message)=>{log((condition?'PASS ':'FAIL ')+message);if(!condition)failed=true;};
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  try{
    await renderer.init();
    for(const [spin,inclination,thickness] of [[0,15,.06],[0,65,.06],[.7,65,.06],[.7,82,.06],[.98,82,.02],[-.95,65,.06]]){
      renderer.setParameters({spin,inclination,thickness,quality:240});
      const model=PondPhysics.createModel({spin,thickness});
      const start=performance.now(); let rendered=false;
      do{
        renderer.render(0,model.getProfile());
        await frame();
        const d=renderer.getDiagnostics();
        rendered=d.ready&&d.state==='ready'&&performance.now()-start>250;
        if(renderer.failed)throw Error('Renderer failed');
        if(performance.now()-start>90000)throw Error('GPU trace timed out');
      }while(!rendered);
      const cache=renderer.readDebugCache();
      let count=0,sky=0,dark=0,minG=Infinity,maxG=0,bad=0,rim=0;
      for(let i=0;i<cache.hits.length;i+=4){
        const h=cache.hits;
        if(!Number.isFinite(h[i]+h[i+1]+h[i+2]+h[i+3]))bad++;
        if(h[i+3]>0){count++;minG=Math.min(minG,h[i+3]);maxG=Math.max(maxG,h[i+3]);
          if(h[i]<model.getDiagnostics().isco*.998||h[i]>40.1||h[i+2]>0)bad++;
        }else if(cache.sky[i+3]>0)sky++;else {dark++;if(cache.sky[i+3]<0)rim++;}
      }
      const label=`a=${spin}, i=${inclination}, H/r=${thickness}`;
      check(bad===0,label+' finite, exterior emission and retarded time');
      check(count>150&&sky>150&&dark>10,label+' resolves disk, escaped sky and shadow');
      check(minG>0&&minG<1&&maxG<8,label+' positive finite relativistic shifts');
      if(inclination===65)check(maxG>1,label+' approaching side is blueshifted');
      if(inclination===82&&thickness===.06)check(rim>100,label+' radial boundaries absorb without glowing or revealing the underside');
      log(`  rim=${rim}, disk=${count}, sky=${sky}, dark=${dark}, g=[${minG.toFixed(4)}, ${maxG.toFixed(4)}]`);
    }
    // The finite-lifetime procedural material must also remain finite at late times.
    renderer.render(1e7,PondPhysics.createModel({spin:-.95}).getProfile());
    check(!renderer.failed,'large animation time stays renderable');
    // Execute the exact production segment-intersection helper. The first
    // chord enters and exits the rim with both endpoints outside: sign-only
    // crossing tests missed it, producing periodic teeth on the back edge.
    const [metric,surface]=await Promise.all(['npgs-kerr.glsl','pond-trace.frag'].map(name=>
      fetch('/assets/shaders/'+name+'?v=20261024-camera2').then(r=>r.text())));
    const probeMain=`void main(){
      int i=int(gl_FragCoord.x);vec3 origin=vec3(0,1.21,-19.8),delta=vec3(0,-.11,-.6);
      if(i==1){origin.y=-origin.y;delta.y=-delta.y;}
      if(i==2){origin=vec3(0,0,21);delta=vec3(0,0,-2);}
      if(i==3){origin=vec3(0,0,1.6);delta=vec3(0,0,1);}
      float first;int boundary;intersectOpaqueSegment(origin,delta,.35,first,boundary);
      float r=KerrSchildRadius(origin+first*delta,.35,1.0);
      diskHit=vec4(first,float(boundary),r,1.0);skyHit=vec4(0.0);
    }`;
    const probe=renderer._program(metric+'\n'+surface.replace('void main()','void productionMain()')+'\n'+probeMain);
    const gl=renderer.gl,texture=renderer._texture(4,1,gl.RGBA32F),fbo=renderer._framebuffer([texture]);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,4,1);gl.useProgram(probe.handle);
    renderer._uniform(probe,'uInner','uniform1f',1.7);renderer._uniform(probe,'uOuter','uniform1f',20);
    renderer._uniform(probe,'uThickness','uniform1f',.06);gl.drawArrays(gl.TRIANGLES,0,3);
    const roots=new Float32Array(16);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,4,1,gl.RGBA,gl.FLOAT,roots);
    for(let i=0;i<2;i++)check(Math.abs(roots[4*i]-.137201459)<2e-4&&roots[4*i+1]===0,
      `grazing chord ${i===0?'above':'below'} disk is not skipped`);
    check(roots[9]===1&&Math.abs(roots[10]-20)<1e-4,'outer radial entry stays absorbing');
    check(roots[13]===2&&Math.abs(roots[14]-1.7)<1e-4,'inner radial entry stays absorbing');
    document.body.dataset.result=failed?'fail':'pass';
    log(failed?'FAILED':'ALL GPU CHECKS PASSED');
  }catch(error){document.body.dataset.result='fail';log('ERROR '+error.message);}
})();
