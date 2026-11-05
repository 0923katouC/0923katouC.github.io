import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceleration, componentPositions, equatorialStrain, initialState, makeOrbit, orbitStep, polarizations,
  REF_PERIOD, sampleAt, SEMIMAJOR, sourceTensor, STOP_RADIUS, STRAIN_UNIT, symmetricRatio
} from '../projects/pond/binary-waves/model.mjs';

import { mapGeometry, paintField } from '../projects/pond/binary-waves/field.mjs';

const close = (a,b,tol) => assert.ok(Math.abs(a-b) <= tol, `${a} differs from ${b} by more than ${tol}`);

// Independent values obtained by evaluating the author's TeX for Eqs. (219)–(220)
// https://arxiv.org/src/1310.1528v2, with c=G=M=r'0=1. The conservative values
// are the even part under c -> -c. Nonzero radial velocities exercise all terms.
test('generic eccentric accelerations agree with the published 3.5PN formula', () => {
  const fixtures = [
    [[16,12,-.072,.211],.65,[-.0018123744230685735,-.0012131800573466666],[-.001813348600369086,-.0012123916360673598]],
    [[28,-21,.13,.085],.1,[-.0005788000372366718,.00046358326981800393],[-.000578787713275109,.0004636216460152401]],
    [[11,7,-.18,.29],1,[-.0046045035546268325,-.002906399334182213],[-.004606885746670957,-.002902794448198663]],
  ];
  for (const [state,q,full,even] of fixtures) {
    for (const [radiating,expected] of [[true,full],[false,even]]) {
      acceleration(state,symmetricRatio(q),radiating).forEach((v,i)=>close(v,expected[i],2e-17));
    }
  }
});

test('initial conservative turning radii reproduce the requested geometric eccentricity and advance', () => {
  for (const [e,q] of [[.01,1],[.4,.65],[.65,.1],[.65,1]]) {
    const n = symmetricRatio(q);
    let state = initialState(e,q), ra = 0, passedApocenter = false, advance = 0;
    const rp = state[0];
    for (let t = 0; t < 2*REF_PERIOD; t++) {
      state = orbitStep(state,1,n,false);
      const [x,y,vx,vy] = state;
      ra = Math.max(ra,Math.hypot(x,y));
      if (x*vx + y*vy < 0) passedApocenter = true;
      else if (passedApocenter) { advance = Math.atan2(y,x); break; }
    }
    close((ra-rp)/(ra+rp),e,6e-7);
    assert.ok(advance > 0.3 && advance < 1.2);
  }
});

test('no free eccentricity in conservative circular motion, and a radiating circular binary inspirals', () => {
  const state = initialState(0,1);
  assert.ok(state[2] < 0);
  const radialForce = acceleration([SEMIMAJOR,0,0,state[3]],.25,false)[0];
  close(-radialForce*SEMIMAJOR,state[3]**2,1e-13);
  const orbit = makeOrbit(0,1);
  const end = sampleAt(orbit,orbit.end);
  assert.ok(Math.hypot(end[0],end[1]) < SEMIMAJOR-1);
});

test('leading quadrupole oscillates twice per circular orbit and cross vanishes edge-on', () => {
  const r=40, n=.25, amplitude=4*STRAIN_UNIT*n/r;
  for (const theta of [0,.2,.6,1.4,Math.PI]) {
    const c=Math.cos(theta),s=Math.sin(theta);
    const tensor = sourceTensor([r*c,r*s,-s/Math.sqrt(r),c/Math.sqrt(r)]);
    const [plus,cross] = polarizations(...tensor,n,1);
    close(plus,-amplitude*Math.cos(2*theta),1e-34);
    close(cross,-amplitude*Math.sin(2*theta),1e-34);
    close(polarizations(...tensor,n,0)[1],0,0);
    // At azimuth zero the map's tangent and the observer's first sky axis
    // are exchanged; reversing the plus basis changes the sign.
    close(equatorialStrain(...tensor,n,1,0),-polarizations(...tensor,n,0)[0]/STRAIN_UNIT,1e-15);
  }
});

test('body markers give the integrated separation for equal and unequal masses', () => {
  for (const q of [1,.1,.65]) {
    const state=[18,-12,.12,.19], [x1,y1,x2,y2]=componentPositions(state,q);
    close(x1-x2,state[0],1e-14); close(y1-y2,state[1],1e-14);
    if (q===1) { close(x1,-x2,1e-14); close(y1,-y2,1e-14); }
  }
});

test('history is continuous at zero, and the last fractional step lands on the cutoff', () => {
  const orbit = makeOrbit(.65,1);
  assert.ok(orbit.stopped);
  const start = initialState(.65,1);
  start.forEach((v,i)=>close(sampleAt(orbit,0)[i],v,1e-14));
  const early=sampleAt(orbit,-1.8*REF_PERIOD),end=sampleAt(orbit,orbit.end);
  assert.ok(early.every(Number.isFinite));
  close(Math.hypot(end[0],end[1]),STOP_RADIUS,1e-11);
  assert.deepEqual(sampleAt(orbit,orbit.end+10),end);
  const a=sampleAt(orbit,-.001), b=sampleAt(orbit,.001);
  close((b[1]-a[1])/.002,start[3],2e-4);
  assert.throws(()=>makeOrbit(.7,.5),RangeError);
});

test('halving the time step converges on an eccentric orbit and on its cutoff time', () => {
  const orbits=[4,2,1].map(h=>makeOrbit(.65,1,h));
  const states=orbits.map(o=>sampleAt(o,1500));
  const error=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  assert.ok(error(states[0],states[1]) > 12*error(states[1],states[2]));
  assert.ok(error(states[1],states[2]) < 0.00003);
  assert.ok(Math.abs(orbits[1].end-orbits[2].end) < .003);
});

test('outer wavefront repeats an earlier inner signal with inverse-distance attenuation', () => {
  const orbit=makeOrbit(.4,.65), map=mapGeometry(32,24), pixel=new Uint8ClampedArray(32*24*4);
  paintField(map,orbit,0,pixel);
  const inner=map.sources.slice(0,3);
  // The outer edge is 3 reference wavelengths beyond the inner edge, R = 7 lambda_0.
  paintField(map,orbit,3*REF_PERIOD/2,pixel);
  const outer=map.sources.slice(-3);
  for (let i=0;i<3;i++) close(outer[i],4*inner[i]/7,1e-14);
});
