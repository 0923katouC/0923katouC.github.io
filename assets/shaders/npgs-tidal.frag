/* SPDX-License-Identifier: GPL-3.0-only
 * Fast-light postprocessing of an actual Phantom GRSPH partial-disruption
 * snapshot. Grey density photospheres and display temperatures are radiation
 * approximations; the fluid density, deformation and velocity are simulated.
 */
uniform vec2 uMapSize;
layout(location=0) out vec4 flowLight;
layout(location=1) out vec4 coreLight;

vec3 hydroColour(float temperature) {
    float t=clamp(temperature,2000.0,40000.0)/100.0;
    vec3 rgb=t<=66.0
        ? vec3(1.0,0.39008158*log(t)-0.63184144,t<=19.0?0.0:0.54320679*log(t-10.0)-1.19625409)
        : vec3(1.29293619*pow(t-60.0,-0.13320476),1.12989086*pow(t-60.0,-0.07551485),1.0);
    return pow(clamp(rgb,0.0,1.0),vec3(2.2));
}
void shadeHydroSurface(vec4 x,vec4 p,float transmission) {
    vec4 material=coreAt(x.xyz);
    vec3 coordinateVelocity=material.yzw/max(material.x,1e-10);
    vec4 velocity;
    if(!normalizeEmitterVelocity(x.xyz,vec4(coordinateVelocity,1.0),velocity)) return;
    float energy=emitterPhotonEnergy(p,velocity);
    if(!(energy>1e-5)) return;
    float shift=1.0/energy;
    vec3 gradient=hydroNormal(x.xyz,true);
    KerrGeometry geo;
    ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
    vec4 normalCovector=vec4(gradient,-dot(gradient,coordinateVelocity));
    vec4 normal=RaiseIndex(normalCovector,geo);
    normal+=dot(normalCovector,velocity)*velocity;
    normal/=sqrt(max(dot(normal,LowerIndex(normal,geo)),1e-12));
    float mu=clamp(dot(p,normal)/energy,0.0,1.0);
    vec3 uv=(x.xyz-uCoreMin)/(uCoreMax-uCoreMin);
    float shock=clamp(texture(uCoreHeat,uv).r/max(material.x,1e-10),0.0,1.0);
    vec3 n=normalize(gradient+vec3(1e-12));
    float irradiation=max(0.0,dot(n,normalize(-x.xyz)));
    // Entropy excess is only a display modulation, not degenerate energy as T.
    float temperature=14500.0*(1.0+0.12*irradiation+0.15*shock);
    float limb=0.28+0.72*mu;
    vec3 intensity=hydroColour(temperature*shift)*pow(shift,3.0)*limb;
    coreLight=vec4(0.9*transmission*intensity,transmission);
}
void addFlowSample(vec4 x,vec4 p,float affineLength,float transmission) {
    vec4 material=flowAt(x.xyz);
    if(material.x<1e-6) return;
    vec4 velocity;
    if(!normalizeEmitterVelocity(x.xyz,vec4(material.yzw/material.x,1.0),velocity)) return;
    float energy=emitterPhotonEnergy(p,velocity);
    if(!(energy>1e-5)) return;
    float shift=1.0/energy;
    vec3 uv=(x.xyz-uFlowMin)/(uFlowMax-uFlowMin);
    float heat=clamp(texture(uFlowHeat,uv).r/material.x,0.0,1.0);
    // Optically thin emissive-skin visualization of the simulated tails.
    // Density and velocities are SPH; absolute radiative normalization and
    // temperature proxy are not a radiation-hydrodynamics prediction.
    float temperature=10500.0+16000.0*sqrt(heat);
    float comovingDensity=material.x/velocity.w;
    float emissivity=4.0*comovingDensity*comovingDensity*sqrt(10000.0/temperature)*
        exp(clamp(2.4-24000.0/(temperature*shift),-20.0,5.0));
    float weight=transmission*pow(shift,3.0)*emissivity*energy*affineLength;
    flowLight.rgb+=weight*hydroColour(temperature*shift);
}
void integrateFlow(vec4 startX,vec4 endX,vec4 startP,vec4 endP,float lo,float hi,float dt,float transmission) {
    vec2 interval=hydroBoxInterval(startX.xyz,endX.xyz-startX.xyz,uFlowMin,uFlowMax);
    lo=max(lo,interval.x);hi=min(hi,interval.y);
    if(hi<=lo || transmission<0.005) return;
    int samples=clamp(int(ceil(length(endX.xyz-startX.xyz)*(hi-lo)/0.035)),1,12);
    float width=(hi-lo)/float(samples);
    for(int i=0;i<12;++i) {
        if(i>=samples) break;
        float fraction=lo+(float(i)+0.5)*width;
        addFlowSample(mix(startX,endX,fraction),mix(startP,endP,fraction),dt*width,transmission);
    }
}
void main() {
    vec2 plane=mapToPlane(gl_FragCoord.xy/uMapSize);
    vec4 x=vec4(CAMERA,0.0);
    vec4 p=GetInitialMomentum(sceneDirection(plane),x,0,1.0,PHYSICAL_A,0.0,1.0,false);
    float energy=-p.w,transmission=1.0;
    flowLight=vec4(0.0);coreLight=vec4(0.0);
    for(int index=0;index<420;++index) {
        KerrGeometry geo;
        ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
        if(geo.r<HORIZON+0.012 || any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) break;
        State state;state.X=x;state.P=p;
        State k1=GetDerivativesAnalytic(state,PHYSICAL_A,0.0,1.0,false,geo);
        if(geo.r>110.0 && dot(x.xyz,-k1.X.xyz)>0.0) break;
        float ringDistance=length(vec2(x.y,length(x.xz)-PHYSICAL_A));
        float dt=0.22*min(ringDistance/max(length(k1.X),1e-6),length(p)/max(length(k1.P),1e-8));
        if(geo.r<24.0) dt=min(dt,0.55/max(length(k1.X.xyz),1e-6));
        dt=max(hydroStepLimit(x.xyz,length(k1.X.xyz),dt),1e-6);
        vec4 previousX=x,previousP=p;
        StepGeodesicRK4_Optimized(x,p,energy,-dt,PHYSICAL_A,0.0,1.0,1.0,false,geo,k1);
        float surface=hydroCoreIntersection(previousX.xyz,x.xyz);
        float endFraction=min(surface,1.0),crossing=2.0,opacity=0.0;
        if(previousX.y*x.y<0.0) {
            crossing=previousX.y/(previousX.y-x.y);
            if(crossing<endFraction) {
                float r=KerrSchildRadius(mix(previousX.xyz,x.xyz,crossing),PHYSICAL_A,1.0);
                opacity=diskOpacityAtRadius(r);
            }
        }
        if(crossing<endFraction && opacity>0.0) {
            integrateFlow(previousX,x,previousP,p,0.0,crossing,dt,transmission);
            transmission*=1.0-opacity;
            integrateFlow(previousX,x,previousP,p,crossing,endFraction,dt,transmission);
        } else integrateFlow(previousX,x,previousP,p,0.0,endFraction,dt,transmission);
        if(transmission<0.005) break;
        if(surface<=1.0) {shadeHydroSurface(mix(previousX,x,surface),mix(previousP,p,surface),transmission);break;}
    }
}
