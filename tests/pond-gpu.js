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
    document.body.dataset.result=failed?'fail':'pass';
    log(failed?'FAILED':'ALL GPU CHECKS PASSED');
  }catch(error){document.body.dataset.result='fail';log('ERROR '+error.message);}
})();
