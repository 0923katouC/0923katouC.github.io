const {test}=require('node:test');
const assert=require('node:assert/strict');
const camera=require('../assets/js/pond-camera.js');
const initial={...camera.DEFAULTS};
function close(a,b,tolerance=1e-10){for(const key of ['azimuth','inclination','zoom'])assert.ok(Math.abs(a[key]-b[key])<tolerance,`${key}: ${a[key]} vs ${b[key]}`);}

test('drag behavior is independent of viewport pixels and reversible away from the poles',()=>{
  const desktop=camera.orbit(initial,160,30,1000,600);
  const phone=camera.orbit(initial,64,12,400,240);
  close(desktop,phone);
  close(camera.orbit(desktop,-160,-30,1000,600),initial);
  close(camera.orbit(initial,2000,0,1000,600),initial);
});

test('vertical drag can orbit under the disk without crossing a coordinate pole',()=>{
  const below=camera.orbit(initial,0,-300,600,400);
  assert.ok(below.inclination>90&&below.inclination<175);
  close(camera.orbit(below,0,300,600,400),initial);
});

test('pinching apart zooms in; reciprocal pinches return to the starting view',()=>{
  const closer=camera.pinch(initial,120,180);
  assert.ok(closer.zoom>initial.zoom);
  assert.equal(closer.inclination,initial.inclination);
  assert.equal(closer.azimuth,initial.azimuth);
  close(camera.pinch(closer,180,120),initial);
  close(camera.pinch(initial,0,100),initial);
  close(camera.pinch(initial,100,NaN),initial);
});

test('wheel pixel, line and page units describe the same zoom; all gestures stay in bounds',()=>{
  close(camera.wheel(initial,16,0),camera.wheel(initial,1,1));
  close(camera.wheel(initial,120,0),camera.wheel(initial,1,2,120));
  assert.ok(camera.wheel(initial,-40).zoom>initial.zoom);
  for(const state of [camera.orbit(initial,1e9,1e9,320,300),camera.orbit(initial,-1e9,-1e9,320,300),camera.pinch(initial,2,1e10),camera.pinch(initial,1e10,2)]){
    assert.ok(state.inclination>=5&&state.inclination<=175);
    assert.ok(state.zoom>=.6&&state.zoom<=2);
    assert.ok(state.azimuth>=-180&&state.azimuth<180);
    assert.ok(Object.values(state).every(Number.isFinite));
  }
});

class Target extends EventTarget {}
class Canvas extends Target{
  constructor(){super();this.dataset={};this.captured=new Set();this.clientHeight=400;this.focused=false;}
  focus(){this.focused=true;}
  getBoundingClientRect(){return {width:600,height:400};}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);dispatch(this,'lostpointercapture',{pointerId:id});}
}
function dispatch(target,type,properties={}){
  const event=new Event(type,{cancelable:true});
  for(const [key,value]of Object.entries(properties))Object.defineProperty(event,key,{value});
  target.dispatchEvent(event);return event;
}
function setup(){
  global.window=new Target();global.document=new Target();global.document.hidden=false;
  const canvas=new Canvas();let current={...initial};const changes=[],activity=[];
  const input=camera.attach(canvas,{getCamera:()=>current,onChange:next=>{current=next;changes.push(next);},onActiveChange:active=>activity.push(active)});
  return {canvas,input,changes,activity,get:()=>current};
}
const pointer=(id,x,y,extra={})=>({pointerId:id,clientX:x,clientY:y,button:0,buttons:1,pointerType:'touch',...extra});

test('one finger → pinch → one finger preserves orientation and has no transition jump',()=>{
  const s=setup();
  dispatch(s.canvas,'pointerdown',pointer(1,100,100));
  dispatch(s.canvas,'pointermove',pointer(1,120,110));
  const beforePinch={...s.get()};
  dispatch(s.canvas,'pointerdown',pointer(2,220,110));
  close(s.get(),beforePinch);
  dispatch(s.canvas,'pointermove',pointer(2,250,110));
  assert.ok(s.get().zoom>beforePinch.zoom);
  assert.equal(s.get().inclination,beforePinch.inclination);
  assert.equal(s.get().azimuth,beforePinch.azimuth);
  const afterPinch={...s.get()};
  dispatch(window,'pointerup',pointer(2,250,110));
  dispatch(s.canvas,'pointermove',pointer(1,120,110));
  close(s.get(),afterPinch);
  dispatch(window,'pointerup',pointer(1,120,110));
  assert.deepEqual(s.activity,[true,false]);assert.equal(s.canvas.captured.size,0);
  s.input.destroy();
});

test('right-click remains native; cancellation and lost capture cannot leave a stuck drag',()=>{
  const s=setup();
  const right=dispatch(s.canvas,'pointerdown',pointer(1,10,10,{pointerType:'mouse',button:2,buttons:2}));
  assert.equal(right.defaultPrevented,false);assert.equal(s.input.getActive(),false);
  dispatch(s.canvas,'pointerdown',pointer(1,10,10));
  dispatch(window,'pointercancel',pointer(1,10,10));
  assert.equal(s.input.getActive(),false);
  dispatch(s.canvas,'pointerdown',pointer(2,20,20));
  s.canvas.releasePointerCapture(2);
  dispatch(s.canvas,'pointermove',pointer(2,200,200));
  close(s.get(),initial);assert.equal(s.input.getActive(),false);
  dispatch(s.canvas,'pointerdown',pointer(3,20,20));
  dispatch(window,'blur');assert.equal(s.input.getActive(),false);assert.equal(s.canvas.captured.size,0);
  s.input.destroy();
});

test('wheel is captured only on the canvas, keyboard reset restores view, destroy detaches listeners',()=>{
  const s=setup();
  const outside=dispatch(window,'wheel',{deltaY:-100,deltaMode:0});
  assert.equal(outside.defaultPrevented,false);close(s.get(),initial);
  const inside=dispatch(s.canvas,'wheel',{deltaY:-100,deltaMode:0});
  assert.equal(inside.defaultPrevented,true);assert.ok(s.get().zoom>1);
  dispatch(s.canvas,'keydown',{key:'ArrowRight'});
  assert.notEqual(s.get().azimuth,0);
  dispatch(s.canvas,'keydown',{key:'0'});close(s.get(),initial);
  const tab=dispatch(s.canvas,'keydown',{key:'Tab'});assert.equal(tab.defaultPrevented,false);
  s.input.destroy();assert.equal(s.input.getActive(),false);
  const after=dispatch(s.canvas,'wheel',{deltaY:-100,deltaMode:0});assert.equal(after.defaultPrevented,false);close(s.get(),initial);
});
