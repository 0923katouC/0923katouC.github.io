/* SPDX-License-Identifier: GPL-3.0-only
 * Direct manipulation for the Kerr viewport. Camera changes never alter fluid state.
 */
(function(root){
  'use strict';
  const DEFAULTS=Object.freeze({azimuth:0,inclination:65,zoom:1});
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
  function normalize(camera={}){
    const azimuth=finite(camera.azimuth,0);
    return {azimuth:((azimuth+180)%360+360)%360-180,
      inclination:clamp(finite(camera.inclination,65),5,175),
      zoom:clamp(finite(camera.zoom,1),.6,2)};
  }
  function orbit(camera,dx,dy,width,height){
    return normalize({...camera,
      azimuth:camera.azimuth-180*finite(dx,0)/Math.max(1,finite(width,1)),
      inclination:camera.inclination-120*finite(dy,0)/Math.max(1,finite(height,1))});
  }
  function pinch(camera,previousDistance,nextDistance){
    if(!Number.isFinite(previousDistance)||!Number.isFinite(nextDistance)||previousDistance<2||nextDistance<2)return normalize(camera);
    return normalize({...camera,zoom:camera.zoom*nextDistance/previousDistance});
  }
  function wheel(camera,deltaY,deltaMode=0,viewportHeight=600){
    const pixels=finite(deltaY,0)*(deltaMode===1?16:deltaMode===2?Math.max(1,viewportHeight):1);
    return normalize({...camera,zoom:camera.zoom*Math.exp(-clamp(pixels,-500,500)*.0015)});
  }
  function attach(canvas,{getCamera,onChange,onActiveChange=()=>{}}){
    const pointers=new Map(),listeners=[];
    let active=false,wheelActive=false,keyActive=false,wheelTimer=0,keyTimer=0,destroyed=false;
    const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
    const notifyActive=()=>{const next=pointers.size>0||wheelActive||keyActive;if(next!==active){active=next;canvas.dataset.interacting=String(active);onActiveChange(active);}};
    const position=event=>({x:event.clientX,y:event.clientY});
    const distance=()=>{const [a,b]=pointers.values();return a&&b?Math.hypot(b.x-a.x,b.y-a.y):0;};
    const release=id=>{try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{/* The browser may already have released capture. */}};
    function removePointer(event){if(!pointers.has(event.pointerId))return;pointers.delete(event.pointerId);release(event.pointerId);notifyActive();}
    function cancel(){
      const ids=[...pointers.keys()];pointers.clear();ids.forEach(release);
      clearTimeout(wheelTimer);clearTimeout(keyTimer);wheelActive=false;keyActive=false;notifyActive();
    }
    listen(canvas,'pointerdown',event=>{
      if(destroyed||event.button!==0||pointers.size>=2)return;
      if(event.pointerType!=='touch'&&pointers.size)return;
      event.preventDefault();canvas.focus({preventScroll:true});pointers.set(event.pointerId,position(event));
      try{canvas.setPointerCapture(event.pointerId);}catch{/* Window-level end handlers still clean up. */}
      notifyActive();
    });
    listen(canvas,'pointermove',event=>{
      const previous=pointers.get(event.pointerId);if(!previous)return;
      if(event.pointerType==='mouse'&&(event.buttons&1)===0){removePointer(event);return;}
      event.preventDefault();
      const before=distance(),next=position(event);pointers.set(event.pointerId,next);
      if(pointers.size===2)onChange(pinch(getCamera(),before,distance()));
      else{const rect=canvas.getBoundingClientRect();onChange(orbit(getCamera(),next.x-previous.x,next.y-previous.y,rect.width,rect.height));}
    });
    listen(window,'pointerup',removePointer);listen(window,'pointercancel',removePointer);
    listen(canvas,'lostpointercapture',removePointer);
    listen(canvas,'wheel',event=>{
      if(destroyed)return;
      event.preventDefault();wheelActive=true;notifyActive();
      onChange(wheel(getCamera(),event.deltaY,event.deltaMode,canvas.clientHeight));
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelActive=false;notifyActive();},140);
    },{passive:false});
    listen(canvas,'keydown',event=>{
      if(event.altKey||event.ctrlKey||event.metaKey)return;
      let next=getCamera(),handled=true;const amount=event.shiftKey?10:3;
      switch(event.key){
        case 'ArrowLeft':next={...next,azimuth:next.azimuth+amount};break;
        case 'ArrowRight':next={...next,azimuth:next.azimuth-amount};break;
        case 'ArrowUp':next={...next,inclination:next.inclination+amount};break;
        case 'ArrowDown':next={...next,inclination:next.inclination-amount};break;
        case '+':case '=':next={...next,zoom:next.zoom*1.1};break;
        case '-':case '_':next={...next,zoom:next.zoom/1.1};break;
        case '0':next={...DEFAULTS};break;
        default:handled=false;
      }
      if(!handled)return;event.preventDefault();keyActive=true;notifyActive();onChange(normalize(next));
      clearTimeout(keyTimer);keyTimer=setTimeout(()=>{keyActive=false;notifyActive();},140);
    });
    listen(window,'blur',cancel);
    listen(document,'visibilitychange',()=>{if(document.hidden)cancel();});
    return {cancel,reset:()=>{cancel();onChange({...DEFAULTS});},destroy:()=>{cancel();destroyed=true;listeners.splice(0).forEach(remove=>remove());},getActive:()=>active};
  }
  const api={DEFAULTS,normalize,orbit,pinch,wheel,attach};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PondCamera=api;
})(typeof window==='undefined'?{}:window);
