const {test}=require('node:test');
const assert=require('node:assert/strict');
const physics=require('../assets/js/pond-physics.js');

test('Kerr reference radii and orbital energy match analytic limits',()=>{
  assert.equal(physics.isco(0),6);
  assert.equal(physics.horizon(0),2);
  assert.ok(Math.abs(physics.isco(.9)-2.3208830418)<1e-9);
  assert.ok(Math.abs(physics.isco(-.9)-8.7173522796)<1e-9);
  assert.ok(Math.abs(physics.orbit(6,0).energy-Math.sqrt(8/9))<1e-12);
});
test('Page–Thorne flux has zero inner torque and correct Newtonian far-field limit',()=>{
  for(const spin of [-.95,0,.7,.98]){
    const nt=physics.novikovThorne(spin,1e7,10000);
    assert.equal(nt.flux[0],0);
    assert.ok(nt.flux.every(Number.isFinite));
    assert.ok(nt.flux.every(x=>x>=0));
    const r=nt.outer, f=nt.flux.at(-1);
    assert.ok(Math.abs(f/(3/(8*Math.PI*r**3))-1)<.003);
  }
});
test('Schwarzschild inner-disk flux agrees with the independent closed-form integral',()=>{
  const root3=Math.sqrt(3), antiderivative=x=>x-root3/2*Math.log((x-root3)/(x+root3));
  const nt=physics.novikovThorne(0,40,256), offset=antiderivative(Math.sqrt(6));
  for(let i=1;i<nt.radii.length;i++){
    const r=nt.radii[i];
    const exact=3/(8*Math.PI)*r**(-3.5)/(1-3/r)*(antiderivative(Math.sqrt(r))-offset);
    assert.ok(Math.abs(nt.flux[i]/exact-1)<1e-6,`r=${r}`);
  }
});
test('steady finite-volume disk remains stationary while boundaries exchange mass',()=>{
  const model=physics.createModel({spin:.7});
  const before=model.snapshot().masses;
  model.step(2000);
  const after=model.snapshot().masses;
  assert.ok(after.every((m,i)=>Math.abs(m/before[i]-1)<1e-11));
  assert.ok(model.getDiagnostics().massBalanceError<1e-12);
});
test('injected ring spreads, remains positive, conserves mass with both boundaries accounted',()=>{
  const model=physics.createModel({spin:.98,alpha:.3,magneticBeta:1,thickness:.15,outerSupply:false});
  model.injectRing();
  const before=model.snapshot().masses;
  for(let i=0;i<20;i++)model.step(1000);
  const after=model.snapshot().masses, d=model.getDiagnostics();
  assert.ok(after.every(x=>Number.isFinite(x)&&x>=0));
  assert.ok(after.some((m,i)=>Math.abs(m-before[i])>1e-3));
  assert.ok(d.accretedMass>0);
  assert.ok(d.massBalanceError<1e-10);
});
test('thermal scaling is T proportional to (mdot_Edd/M)^1/4',()=>{
  const model=physics.createModel({mass:1e6,accretionRate:.1});
  const t1=model.getDiagnostics().tempMax;
  model.setParameters({mass:16e6});
  assert.ok(Math.abs(model.getDiagnostics().tempMax/t1-.5)<1e-6);
  model.setParameters({accretionRate:.4});
  assert.ok(Math.abs(model.getDiagnostics().tempMax/t1-Math.SQRT1_2)<1e-6);
});
test('changing stress conserves stored mass and spin reset rebuilds a finite grid',()=>{
  const model=physics.createModel({spin:0}); model.step(100); model.injectRing();
  const before=model.getDiagnostics().diskMass;
  model.setParameters({magneticBeta:1,alpha:.3});
  assert.equal(model.getDiagnostics().diskMass,before);
  model.step(100);
  assert.ok(model.getDiagnostics().massBalanceError<1e-12);
  model.setParameters({spin:-.95});
  assert.ok(model.getProfile().flux.every(Number.isFinite));
  assert.equal(model.getDiagnostics().time,0);
});
