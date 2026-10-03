/* SPDX-License-Identifier: GPL-3.0-only
 * Shared kinematic jet prescription for cache construction and emission.
 * Inspired by NPGS JetColor; units Rs=1, M=.5, spin along +y, (+++-).
 * Requires only PHYSICAL_A and HORIZON from SCENE, no Kerr shader structs.
 * This prescribes a timelike emitting outflow, not a GRMHD launch solution.
 * 0.8c is the far-field axial speed on the spine; it is NOT a constant local
 * physical speed everywhere. Local normalization and photon shifts are GR.
 */
const float JET_START = 1.15;
const float JET_LENGTH = 10.5;
const float JET_BASE_RADIUS = 0.32;
const float JET_CACHE_PADDING = 1.05;
const float JET_SPEED = 0.8; // Far-field spine limit, not a local-speed claim.
const float JET_AXIAL_U = 1.3333333333333333; // Gamma_inf * beta_inf on axis.

vec2 jetRadiusAndSlope(float height) {
    float z=max(height-JET_START,0.0);
    float softRoot=sqrt(z+1.0);
    float radius=JET_BASE_RADIUS+0.10*z+0.05*(softRoot-1.0);
    float slope=0.10+0.025/softRoot;
    return vec2(radius,slope);
}
float jetRadius(float height) { return jetRadiusAndSlope(height).x; }

float jetKerrRadius(vec3 p) {
    float a2=PHYSICAL_A*PHYSICAL_A;
    float b=dot(p,p)-a2;
    return sqrt(max(0.0,0.5*(b+sqrt(b*b+4.0*a2*p.y*p.y))));
}

float jetSupportMargin(vec3 position) {
    float height=abs(position.y);
    if (height<=JET_START || height>=JET_LENGTH) return min(height-JET_START,JET_LENGTH-height);
    float side=JET_CACHE_PADDING*jetRadius(height)-length(position.xz);
    if (side<=0.0) return side;
    return min(min(height-JET_START,JET_LENGTH-height),
               min(side,jetKerrRadius(position)-HORIZON-0.015));
}

vec4 jetEmitterVelocity(vec3 position) {
    float height=abs(position.y);
    vec2 shape=jetRadiusAndSlope(height);
    // rho/R(height) stays constant along an outflowing streamline.
    float radialRate=JET_AXIAL_U*shape.y/shape.x;
    vec3 us=vec3(radialRate*position.x,sign(position.y)*JET_AXIAL_U,
                 radialRate*position.z);
    float r=max(jetKerrRadius(position),1e-6);
    float r2=r*r, a2=PHYSICAL_A*PHYSICAL_A;
    float f=r*r2/max(r2*r2+a2*position.y*position.y,1e-12);
    vec3 l=vec3((r*position.x-PHYSICAL_A*position.z)/(r2+a2),
                 position.y/r,
                (r*position.z+PHYSICAL_A*position.x)/(r2+a2));
    float ld=dot(l,us);
    // g(U,U)=-1 gives -(1-f)Ut^2+B*Ut+C=0.
    // The chosen support is outside the ergosphere (|y|>=1.15Rs), so
    // 1-f>0 and the positive, future-directed root is unambiguous.
    float oneMinusF=1.0-f;
    if (oneMinusF<=1e-6) return vec4(0.0); // Never invent a spacelike emitter.
    float b=2.0*f*ld;
    float c=1.0+dot(us,us)+f*ld*ld;
    float ut=(b+sqrt(b*b+4.0*oneMinusF*c))/(2.0*oneMinusF);
    return vec4(us,ut);
}

float jetFlowDelayIntegrand(float height,float eta) {
    vec4 u=jetEmitterVelocity(vec3(eta*jetRadius(height),height,0.0));
    return u.w/JET_AXIAL_U;
}

float jetFlowDelay(float height,float eta) {
    float span=max(height-JET_START,0.0);
    if (span<=1e-7) return 0.0;
    // Integral Ut/Uy dh is the coordinate flight time in the same KS clock
    // as stored ray tLag. Composite Simpson with h=h0+span*s^2 places more
    // samples near the strongly redshifted launch region. 16 subintervals.
    float sum=0.0;
    for (int i=1;i<=16;++i) {
        float s=float(i)/16.0;
        float h=JET_START+span*s*s;
        float coefficient=i==16 ? 1.0 : (i%2==0 ? 2.0 : 4.0);
        sum+=coefficient*2.0*span*s*jetFlowDelayIntegrand(h,eta);
    }
    return sum/48.0;
}

vec3 jetMaterialCoordinates(vec3 position,float emissionTime) {
    float height=abs(position.y);
    float rho=length(position.xz);
    float eta=rho/jetRadius(height);
    float azimuth=rho>1e-7 ? atan(position.x,position.z) : 0.0;
    // Both eta and launchTime are constant along the prescribed outflow.
    // A periodic function of azimuth and launchTime makes outward-advected
    // helical brightness strands without moving the whole jet off its axis.
    return vec3(eta,azimuth,emissionTime-jetFlowDelay(height,eta));
}
