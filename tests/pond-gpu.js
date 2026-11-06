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
    const defaultThickness=renderer.parameters.thickness;
    const views=[[.7,5,defaultThickness],[.7,65,defaultThickness],[.7,90,defaultThickness],
      [.7,65,0],[0,15,.06],[0,65,.06],[.7,82,.06],[.98,82,.02],[-.95,65,.06]];
    for(const [spin,inclination,thickness] of views){
      renderer.setParameters({spin,inclination,thickness,quality:240});
      const model=PondPhysics.createModel({spin,thickness});
      const start=performance.now(); let rendered=false;
      do{
        renderer.render(0,model.getProfile());
        await frame();
        const d=renderer.getDiagnostics();
        const params=d.renderedParameters;
        rendered=d.state==='ready'&&!d.preview&&params&&params.spin===spin&&
          params.inclination===inclination&&params.thickness===thickness;
        if(renderer.failed)throw Error('Renderer failed');
        if(performance.now()-start>90000)throw Error('GPU trace timed out');
      }while(!rendered);
      const cache=renderer.readDebugCache();
      let count=0,sky=0,dark=0,minG=Infinity,maxG=0,bad=0,rim=0,border=0,missingCap=0,unresolved=0;
      for(let i=0;i<cache.hits.length;i+=4){
        const h=cache.hits;
        if(!Number.isFinite(h[i]+h[i+1]+h[i+2]+h[i+3]))bad++;
        const mark=cache.sky[i+3];
        if(mark===-3)unresolved++;
        if(mark===-1||mark===-2){rim++;if(!(h[i+3]>0))missingCap++;}
        if(h[i+3]>0){
          const col=(i/4)%cache.width,row=Math.floor(i/(4*cache.width));
          if(!col||!row||col===cache.width-1||row===cache.height-1)border++;
          count++;minG=Math.min(minG,h[i+3]);maxG=Math.max(maxG,h[i+3]);
          if(h[i]<model.getDiagnostics().isco*.998||h[i]>40.1||h[i+2]>0)bad++;
        }else if(cache.sky[i+3]>0)sky++;else dark++;
      }
      const label=`a=${spin}, i=${inclination}, H/r=${thickness}`;
      check(bad===0,label+' finite, exterior emission and retarded time');
      check(count>150&&sky>150&&dark>10,label+' resolves disk, escaped sky and shadow');
      check(minG>0&&minG<1&&maxG<8,label+' positive finite relativistic shifts');
      if(thickness===defaultThickness)check(border===0,label+' complete default zoom silhouette fits inside the frame');
      if(inclination===65)check(maxG>1,label+' approaching side is blueshifted');
      check(missingCap===0,label+' opaque cap entries have a valid emitting surface');
      check(unresolved<Math.max(4,cache.width*cache.height/10000),label+' no appreciable gaps from exhausted ray steps');
      if(inclination===82&&thickness===.06)check(rim>100,label+' resolves curved rims near edge-on');
      log(`  unconverged=${unresolved}, rim=${rim}, disk=${count}, sky=${sky}, dark=${dark}, g=[${minG.toFixed(4)}, ${maxG.toFixed(4)}]`);
    }
    // The finite-lifetime procedural material must also remain finite at late times.
    renderer.render(1e7,PondPhysics.createModel({spin:-.95}).getProfile());
    check(!renderer.failed,'large animation time stays renderable');
    // Exercise the production first-entry helper on rays with known symmetries,
    // equatorial roots, and two competing intersections inside a single step.
    const [metric,surface]=await Promise.all(['npgs-kerr.glsl','pond-trace.frag'].map(name=>
      fetch('/assets/shaders/'+name+'?v=20261106-thin-rim1').then(r=>r.text())));
    const probeMain=`void main(){
      int i=int(gl_FragCoord.x); const float a=.35;
      vec3 origin=vec3(19.7,.08,-5), delta=vec3(0,0,10);
      if(i==1)origin.y=-origin.y;
      if(i==2 || i==3) {
        float radius=(i==2?uOuter:uInner), direction=(i==2?-1.0:1.0);
        origin=vec3(0,0,sqrt(radius*radius+a*a)-direction*.5); delta=vec3(0,0,2.0*direction);
      }
      if(i>=4 && i<=7) {
        // At the join the body has y=h*r and cylindrical radius
        // sqrt((r²+a²)(1-h²)). Cast either side of that circle.
        float join=i<6 ? uInner*1.5 : uOuter-.24*(uOuter-uInner);
        float cylinder=sqrt((join*join+a*a)*(1.-uThickness*uThickness));
        origin=vec3(cylinder+(i%2==0?-.001:.001),2,0);delta=vec3(0,-4,0);
      }
      if(i==8){origin=vec3(22,2,0);delta=vec3(0,-4,0);}
      if(i==9 || i==10){origin=vec3(1.80,2,0);delta=vec3(0,-4,0);
        if(i==10){origin.y=-origin.y;delta.y=-delta.y;}}
      float first;int boundary;intersectOpaqueSegment(origin,delta,a,rimShape(a),first,boundary);
      vec3 xyz=origin+first*delta;
      diskHit=vec4(first,float(boundary),KerrSchildRadius(xyz,a,1.),xyz.y);skyHit=vec4(0);
    }`;
    const probe=renderer._program(metric+'\n'+surface.replace('void main()','void productionMain()')+'\n'+probeMain);
    const gl=renderer.gl, probes=11, texture=renderer._texture(probes,1,gl.RGBA32F),fbo=renderer._framebuffer([texture]);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,probes,1);gl.useProgram(probe.handle);
    renderer._uniform(probe,'uInner','uniform1f',1.7);renderer._uniform(probe,'uOuter','uniform1f',20);
    renderer._uniform(probe,'uThickness','uniform1f',.06);gl.drawArrays(gl.TRIANGLES,0,3);
    const roots=new Float32Array(probes*4);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,probes,1,gl.RGBA,gl.FLOAT,roots);
    const time=i=>roots[4*i], kind=i=>roots[4*i+1], radius=i=>roots[4*i+2], height=i=>roots[4*i+3];
    for(const i of [0,1])check(time(i)>0&&time(i)<.5&&kind(i)===1,'short grazing chord meets nearer outer cap, side '+i);
    check(Math.abs(time(0)-time(1))<1e-5,'opposite grazing rays agree across the midplane');
    for(const [i,r,k] of [[2,20,1],[3,1.7,2]])check(kind(i)===k&&Math.abs(time(i)-.25)<1e-4&&Math.abs(radius(i)-r)<1e-4,
      'rounded rim closes at equatorial radius '+r);
    for(const [i,left,right] of [[4,2,0],[6,0,1]])check(kind(i)===left&&kind(i+1)===right&&
      Math.abs(height(i)-height(i+1))<.003&&height(i)>0,'both pieces meet continuously across join '+i);
    check(kind(8)===-1&&time(8)>1,'sky outside the disk stays unobstructed');
    check(kind(9)===2&&kind(10)===2&&time(9)<.5&&time(9)>0&&Math.abs(time(9)-time(10))<1e-5,
      'inner cap emits first on both faces');
    // Sample the actual radiance shader on a constant physical profile, so
    // a bright diagnostic floor cannot conceal a discontinuity at either end.
    const inner=3,outer=40,innerWidth=1.5,outerWidth=.24*(outer-inner);
    const radii=[inner,inner+.15*innerWidth,inner+.75*innerWidth,12,
      outer-.75*outerWidth,outer-.15*outerWidth,outer];
    function floatTexture(values) {
      const texture=renderer._texture(values.length/4,1,gl.RGBA32F);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,values.length/4,1,gl.RGBA,gl.FLOAT,new Float32Array(values));
      return texture;
    }
    const hits=floatTexture(radii.flatMap(r=>[r,0,0,1]));
    const sky=floatTexture(new Float32Array(radii.length*4));
    const profile=floatTexture([1,1,150000,1,1,1,150000,1]);
    const target=renderer._framebuffer([renderer._texture(radii.length,1,gl.RGBA32F)]);
    const shade=renderer._shade;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.viewport(0,0,radii.length,1);gl.useProgram(shade.handle);
    renderer._bind(shade,'uHits',hits,0);renderer._bind(shade,'uSky',sky,1);renderer._bind(shade,'uProfile',profile,2);
    for(const [name,value] of [['uInner',inner],['uOuter',outer],['uTime',0],['uSpin',.7],['uAzimuth',0],['uAccretionScale',1]])
      renderer._uniform(shade,name,'uniform1f',value);
    for(const [mode,name] of ['thermal','frequency shift','density','intensity'].entries()) {
      renderer._uniform(shade,'uMode','uniform1i',mode);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const rgb=new Float32Array(4*radii.length);
      gl.readPixels(0,0,radii.length,1,gl.RGBA,gl.FLOAT,rgb);
      const light=radii.map((_,i)=>rgb[4*i]+rgb[4*i+1]+rgb[4*i+2]);
      check(light.every(Number.isFinite)&&light[3]>.01&&light[0]<1e-6&&light[6]<1e-6&&
        light[1]>0&&light[1]<light[2]&&light[5]>0&&light[5]<light[4],
        name+' fades to zero at both physical ends while the disk interior stays bright');
    }
    // Paint stripes at known screen pixel centers into a nonuniform cache using
    // trace's production forward map, then recover them through the real compose pass.
    const outputW=192,outputH=128,cacheW=240,cacheH=160;
    const stripesMain=`void main(){
      vec2 uv=screenPlane(gl_FragCoord.xy/uMapSize,1.)+.5;
      vec2 p=uv*vec2(192,128);
      float dx=min(abs(p.x-16.5),min(abs(p.x-96.5),abs(p.x-171.5)));
      float dy=min(abs(p.y-13.5),min(abs(p.y-62.5),abs(p.y-109.5)));
      diskHit=vec4(exp(-.25*dx*dx),exp(-.25*dy*dy),0,1);skyHit=vec4(0);
    }`;
    const stripes=renderer._program(metric+'\n'+surface.replace('void main()','void productionMain()')+'\n'+stripesMain);
    const radiance=renderer._texture(cacheW,cacheH,gl.RGBA32F);
    const cacheFbo=renderer._framebuffer([radiance]);
    gl.bindFramebuffer(gl.FRAMEBUFFER,cacheFbo);gl.viewport(0,0,cacheW,cacheH);gl.useProgram(stripes.handle);
    renderer._uniform(stripes,'uMapSize','uniform2f',cacheW,cacheH);
    // Use the same center spacing currently bound to the production ray program.
    const spacing=gl.getUniform(renderer._trace.handle,gl.getUniformLocation(renderer._trace.handle,'uCenterSpacing'));
    renderer._uniform(stripes,'uCenterSpacing','uniform1f',spacing);gl.drawArrays(gl.TRIANGLES,0,3);
    const compose=renderer._compose;
    const outputFbo=renderer._framebuffer([renderer._texture(outputW,outputH,gl.RGBA32F)]);
    gl.bindFramebuffer(gl.FRAMEBUFFER,outputFbo);gl.viewport(0,0,outputW,outputH);gl.useProgram(compose.handle);
    renderer._bind(compose,'uRadiance',radiance,0);
    renderer._uniform(compose,'uResolution','uniform2f',outputW,outputH);
    renderer._uniform(compose,'uDiagnostic','uniform1i',1);
    renderer._uniform(compose,'uExposure','uniform1f',1);
    gl.drawArrays(gl.TRIANGLES,0,3);
    const mapped=new Float32Array(outputW*outputH*4);
    gl.readPixels(0,0,outputW,outputH,gl.RGBA,gl.FLOAT,mapped);
    for(const [axis,centers] of [['x',[16,96,171]],['y',[13,62,109]]]) {
      for(const center of centers) {
        const value=n=>axis==='x'?mapped[4*(41*outputW+n)]:mapped[4*(n*outputW+80)+1];
        const floor=Math.min(value(center-7),value(center+7));
        let sum=0,moment=0;
        for(let n=center-7;n<=center+7;n++){
          const light=Math.max(0,value(n)-floor);sum+=light;moment+=n*light;
        }
        check(spacing>0&&spacing<1&&value(center)>.6&&sum>0&&Math.abs(moment/sum-center)<1,
          'forward sampling and composed stripe agree within one pixel at '+axis+'='+(center+.5));
      }
    }
    document.body.dataset.result=failed?'fail':'pass';
    log(failed?'FAILED':'ALL GPU CHECKS PASSED');
  }catch(error){document.body.dataset.result='fail';log('ERROR '+error.message);}
})();
