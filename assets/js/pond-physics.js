/* SPDX-License-Identifier: GPL-3.0-only
 * Kerr thin-disk experiment. Units: G = c = M = 1 unless stated.
 * Optical geometry is relativistic; this transport model is explicitly the
 * Newtonian, height-integrated Pringle equation with a prescribed stress.
 * References and limitations: /projects/pond/MODEL.md
 */
(function (root) {
  'use strict';
  const PI = Math.PI;
  const C = 299792458, G = 6.67430e-11, MSUN = 1.98847e30;
  const SIGMA = 5.670374419e-8, MP = 1.67262192369e-27, THOMSON = 6.6524587321e-29;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  function isco(a) {
    a = clamp(finite(a, 0), -.998, .998);
    const z1 = 1 + Math.cbrt(1 - a*a) * (Math.cbrt(1+a) + Math.cbrt(1-a));
    const z2 = Math.sqrt(3*a*a + z1*z1);
    return 3 + z2 - Math.sign(a) * Math.sqrt((3-z1)*(3+z1+2*z2));
  }
  const horizon = a => 1 + Math.sqrt(1-clamp(a,-.998,.998)**2);
  function orbit(r, a) {
    const sr = Math.sqrt(r), r32 = r*sr;
    const d = Math.pow(r,.75)*Math.sqrt(Math.max(1e-15,r32-3*sr+2*a));
    return {omega:1/(r32+a), energy:(r32-2*sr+a)/d,
      angularMomentum:(r*r-2*a*sr+a*a)/d};
  }
  function fluxIntegrand(r, a) {
    const o = orbit(r,a), sr=Math.sqrt(r), q=r*sr-3*sr+2*a;
    const d=Math.pow(r,.75)*Math.sqrt(q), numerator=r*r-2*a*sr+a*a;
    const dl=(2*r-a/sr-numerator*(.75/r+.75*(sr-1/sr)/q))/d;
    return Math.max(0,(o.energy-o.omega*o.angularMomentum)*dl);
  }
  // Page–Thorne Eq. (15): flux from ONE face for unit mass accretion rate.
  function novikovThorne(a, outer=40, count=512) {
    const inner = isco(a), radii = new Float64Array(count), flux = new Float64Array(count);
    let integral=0;
    for(let i=0;i<count;i++) {
      const r = inner*Math.pow(outer/inner,i/(count-1)); radii[i]=r;
      if(i===0) continue;
      const prev=radii[i-1], mid=.5*(r+prev);
      integral += (r-prev)*(fluxIntegrand(prev,a)+4*fluxIntegrand(mid,a)+fluxIntegrand(r,a))/6;
      const o=orbit(r,a), derivative=-1.5*Math.sqrt(r)/(r**1.5+a)**2;
      flux[i] = Math.max(0,-derivative*integral/(4*PI*r*(o.energy-o.omega*o.angularMomentum)**2));
    }
    return {radii,flux,inner,outer};
  }
  function clean(p) {
    return {spin:clamp(finite(p.spin,.7),-.95,.98),
      mass:clamp(finite(p.mass,4e6),3,1e10),
      accretionRate:clamp(finite(p.accretionRate,.25),.001,1),
      thickness:clamp(finite(p.thickness,.06),.015,.15),
      alpha:clamp(finite(p.alpha,.1),.005,.3),
      magneticBeta:clamp(finite(p.magneticBeta,30),1,1000),
      outerSupply:p.outerSupply===false?false:true};
  }
  function createModel(initial={}) {
    let p=clean(initial), version=0, time=0, injected=0, supplied=0, accreted=0;
    const n=128, samples=256, outer=40;
    const edges=new Float64Array(n+1), radii=new Float64Array(n), area=new Float64Array(n);
    const masses=new Float64Array(n), nu=new Float64Array(n), qcoeff=new Float64Array(n);
    const steadyQ=new Float64Array(n), conduct=new Float64Array(n), flow=new Float64Array(n+1);
    let inner, totalInitial, maxStep, nt, fluxNorm, sigmaReference, profile, profileVersion=-1;
    const sum = values => values.reduce((a,b)=>a+b,0);
    const effectiveAlpha = () => Math.min(.6,p.alpha + .3/p.magneticBeta);
    function viscosity() {
      let maxLoss=0;
      for(let i=0;i<n;i++) {
        // c_s=H Ω_K and H=h r; prescribed h, no energy equation.
        nu[i]=effectiveAlpha()*p.thickness*p.thickness*Math.sqrt(radii[i]);
        qcoeff[i]=nu[i]*Math.sqrt(radii[i])/area[i];
        maxLoss=Math.max(maxLoss,qcoeff[i]*(conduct[i]+(i<n-1?conduct[i+1]:0)));
      }
      maxStep=.42/maxLoss;
    }
    function reset() {
      time=0; injected=0; supplied=0; accreted=0;
      inner=isco(p.spin);
      for(let i=0;i<=n;i++) edges[i]=inner*Math.pow(outer/inner,i/n);
      for(let i=0;i<n;i++) {
        radii[i]=Math.sqrt(edges[i]*edges[i+1]);
        area[i]=PI*(edges[i+1]**2-edges[i]**2);
        conduct[i]=6*PI*Math.sqrt(edges[i])/(radii[i]-(i?radii[i-1]:inner));
        steadyQ[i]=(i?steadyQ[i-1]:0)+1/conduct[i];
      }
      viscosity();
      for(let i=0;i<n;i++) masses[i]=steadyQ[i]/qcoeff[i];
      totalInitial=sum(masses);
      sigmaReference=Math.max(...Array.from(masses,(m,i)=>m/area[i]));
      flow.fill(1);
      nt=novikovThorne(p.spin,outer,samples);
      fluxNorm=Math.max(...nt.flux);
      profile={innerRadius:inner,outerRadius:outer,radii:new Float32Array(nt.radii),
        flux:new Float32Array(samples),density:new Float32Array(samples),
        temperature:new Float32Array(samples),version:0,tempMax:0,fluxMax:0};
      version++;
    }
    function setParameters(next) {
      const old=p; p=clean({...p,...next});
      if(p.spin!==old.spin) reset();
      else if(p.alpha!==old.alpha||p.magneticBeta!==old.magneticBeta||p.thickness!==old.thickness) viscosity();
      version++;
    }
    function step(dt) {
      dt=Math.max(0,finite(dt,0));
      // This is a physical-time integrator, never an unbounded catch-up loop.
      dt=Math.min(dt,2000);
      if(!dt)return;
      const steps=Math.ceil(dt/maxStep), h=dt/steps;
      for(let s=0;s<steps;s++) {
        let qprev=0;
        for(let i=0;i<n;i++) {
          const q=qcoeff[i]*masses[i]; flow[i]=conduct[i]*(q-qprev); qprev=q;
        }
        flow[n]=p.outerSupply?1:0;
        for(let i=0;i<n;i++) masses[i]+=h*(flow[i+1]-flow[i]);
        accreted+=h*flow[0]; supplied+=h*flow[n];
      }
      time+=dt; version++;
    }
    function injectRing(radius=18, fraction=.15) {
      radius=clamp(finite(radius,18),inner*1.3,outer*.85);
      fraction=clamp(finite(fraction,.15),.001,.5);
      const weights=Array.from(radii,(r,i)=>Math.exp(-.5*((r-radius)/(radius*.075))**2)*area[i]);
      const norm=sum(weights), add=totalInitial*fraction;
      for(let i=0;i<n;i++)masses[i]+=add*weights[i]/norm;
      injected+=add; version++;
    }
    function getProfile() {
      if(profileVersion===version)return profile;
      const efficiency=1-orbit(inner,p.spin).energy;
      const mkg=p.mass*MSUN, ledd=4*PI*G*mkg*MP*C/THOMSON;
      const mdot=p.accretionRate*ledd/(efficiency*C*C);
      const physicalFactor=mdot*C**6/(G*G*mkg*mkg);
      let peak=0, peakFlux=0;
      for(let j=0;j<samples;j++) {
        const x=j/(samples-1)*n-.5;
        const lo=clamp(Math.floor(x),0,n-1), hi=Math.min(n-1,lo+1), f=clamp(x-lo,0,1);
        const ratio=(1-f)*qcoeff[lo]*masses[lo]/steadyQ[lo]+f*qcoeff[hi]*masses[hi]/steadyQ[hi];
        const localFlux=nt.flux[j]*Math.max(0,ratio);
        profile.flux[j]=localFlux/fluxNorm;
        profile.density[j]=((1-f)*masses[lo]/area[lo]+f*masses[hi]/area[hi])/sigmaReference;
        profile.temperature[j]=Math.pow(localFlux*physicalFactor/SIGMA,.25);
        peak=Math.max(peak,profile.temperature[j]); peakFlux=Math.max(peakFlux,profile.flux[j]);
      }
      profile.tempMax=peak; profile.fluxMax=peakFlux; profile.version=version;
      profileVersion=version; return profile;
    }
    function getDiagnostics() {
      const mass=sum(masses), accounted=totalInitial+injected+supplied;
      return {isco:inner,horizon:horizon(p.spin),timeUnit:G*p.mass*MSUN/C**3,
        tempMax:getProfile().tempMax,effectiveAlpha:effectiveAlpha(),
        efficiency:1-orbit(inner,p.spin).energy,time,
        massBalanceError:Math.abs(mass+accreted-accounted)/Math.max(accounted,1e-20),
        diskMass:mass,initialMass:totalInitial,injectedMass:injected,suppliedMass:supplied,
        accretedMass:accreted,accretionFlux:conduct[0]*qcoeff[0]*masses[0],maxStableStep:maxStep};
    }
    reset();
    return {setParameters,step,reset,injectRing,getProfile,getDiagnostics,
      // Independent verification/plot data, copies avoid mutating the integrator.
      snapshot:()=>({radii:radii.slice(),masses:masses.slice(),areas:area.slice(),viscosity:nu.slice()})};
  }
  const api={isco,horizon,orbit,novikovThorne,createModel};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PondPhysics=api;
})(typeof window==='undefined'?{}:window);
