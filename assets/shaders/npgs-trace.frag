/* SPDX-License-Identifier: GPL-3.0-only
 * Stationary Kerr null-geodesic maps for the two thin-disk images and sky.
 * No additional emitters, volume integration, or object occlusion.
 */
uniform vec2 uMapSize;
layout(location=0) out vec4 diskNear;
layout(location=1) out vec4 diskFar;
layout(location=2) out vec4 skyRay;

vec4 diskIntersection(vec4 x,vec4 p,float energy) {
    float r=KerrSchildRadius(x.xyz,PHYSICAL_A,1.0);
    if(r<=DISK_INNER || r>=DISK_OUTER) return vec4(0.0);
    float omega=GetKeplerianAngularVelocity(r,1.0,PHYSICAL_A,0.0);
    float potential=1.0/r;
    float gtt=-1.0+potential;
    float gtp=-PHYSICAL_A*potential;
    float gpp=r*r+PHYSICAL_A*PHYSICAL_A*(1.0+potential);
    float ut=inversesqrt(max(0.01,-(gtt+2.0*omega*gtp+omega*omega*gpp)));
    float pphi=x.z*p.x-x.x*p.z;
    float shift=clamp(1.0/max(1e-5,ut*(energy-omega*pphi)),0.05,3.0);
    return vec4(x.x,x.z,x.w,shift);
}

void main() {
    vec2 plane=mapToPlane(gl_FragCoord.xy/uMapSize);
    vec4 x=vec4(CAMERA,0.0);
    vec4 p=GetInitialMomentum(sceneDirection(plane),x,0,1.0,PHYSICAL_A,0.0,1.0,false);
    float energy=-p.w;
    diskNear=vec4(0.0);diskFar=vec4(0.0);skyRay=vec4(0.0);
    int hits=0;
    for(int index=0;index<420;++index) {
        KerrGeometry geo;
        ComputeGeometryScalars(x.xyz,PHYSICAL_A,0.0,1.0,1.0,false,geo);
        if(geo.r<HORIZON+0.012 || any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) break;
        State state;state.X=x;state.P=p;
        State k1=GetDerivativesAnalytic(state,PHYSICAL_A,0.0,1.0,false,geo);
        if(geo.r>90.0 && dot(x.xyz,-k1.X.xyz)>0.0) {
            skyRay=vec4(normalize(-k1.X.xyz),1.0);break;
        }
        float distanceToRing=length(vec2(x.y,length(x.xz)-PHYSICAL_A));
        float dt=0.22*min(distanceToRing/max(length(k1.X),1e-6),length(p)/max(length(k1.P),1e-8));
        if(geo.r<24.0) dt=min(dt,0.55/max(length(k1.X.xyz),1e-6));
        dt=max(dt,1e-6);
        vec4 previousX=x,previousP=p;
        StepGeodesicRK4_Optimized(x,p,energy,-dt,PHYSICAL_A,0.0,1.0,1.0,false,geo,k1);
        if(previousX.y*x.y<0.0) {
            float crossing=previousX.y/(previousX.y-x.y);
            vec4 hit=diskIntersection(mix(previousX,x,crossing),mix(previousP,p,crossing),energy);
            if(hit.w>0.0) {
                if(hits==0) diskNear=hit;else diskFar=hit;
                if(++hits>=2) break;
            }
        }
    }
}
