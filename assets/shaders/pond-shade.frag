/* SPDX-License-Identifier: GPL-3.0-only
 * Cached-ray radiative display. Lensing and g come from the Kerr solve.
 * Bolometric surface intensity obeys I_obs = g^4 I_em. Thermal RGB is an
 * explicitly illustrative false-colour display, not a visible-band spectrum.
 * Fine turbulent texture is procedural and is NOT an evolved GRMHD field.
 */
uniform sampler2D uHits;
uniform sampler2D uSky;
uniform sampler2D uProfile;
uniform float uTime;
uniform float uSpin;
uniform float uInner;
uniform float uOuter;
uniform float uAccretionScale;
uniform int uMode;
out vec4 fragColor;
const float PI=3.141592653589793;

float hash31(vec3 p) {
    p=fract(p*0.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                   mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                   mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float material(float r,float phi,float t,float offset) {
    // Birth labels reset only when their sin² weight and its derivative vanish.
    // Finite lifetimes prevent accumulated differential shear at late times.
    float lifetime=120.0;
    float epoch=floor((t+offset)/lifetime);
    float age=(t+offset)-epoch*lifetime;
    float omega=1.0/(pow(r,1.5)+uSpin); // units 1/t_g
    float phase=phi-omega*age;
    vec3 p=vec3(log(r)*7.0,cos(phase)*r*0.36,sin(phase)*r*0.36);
    p.x+=epoch*13.731;
    float n=0.55*noise3(p)+0.28*noise3(p*2.11)+0.17*noise3(p*4.19);
    float weight=pow(sin(PI*age/lifetime),2.0);
    return (0.62+0.8*n)*weight;
}
vec4 radialProfile(float r) {
    float u=clamp(log(r/uInner)/log(uOuter/uInner),0.0,1.0);
    int size=textureSize(uProfile,0).x;
    float index=u*float(size-1);
    int lo=int(floor(index)),hi=min(size-1,lo+1);
    return mix(texelFetch(uProfile,ivec2(lo,0),0),texelFetch(uProfile,ivec2(hi,0),0),fract(index));
}
vec3 warmThermal(float temperature) {
    float q=clamp(temperature,0.0,1.4);
    vec3 red=vec3(1.0,0.12,0.025);
    vec3 gold=vec3(1.0,0.57,0.18);
    vec3 white=vec3(1.0,0.94,0.76);
    vec3 hot=vec3(0.67,0.82,1.0);
    vec3 c=mix(red,gold,smoothstep(0.05,0.48,q));
    c=mix(c,white,smoothstep(0.40,0.92,q));
    return mix(c,hot,smoothstep(0.92,1.40,q));
}
vec3 diagnostic(float x) {
    vec3 low=vec3(0.035,0.24,0.59),mid=vec3(0.92,0.92,0.79),high=vec3(0.93,0.28,0.08);
    return x<0.5?mix(low,mid,x*2.0):mix(mid,high,clamp(x*2.0-1.0,0.0,1.0));
}
vec3 sky(vec3 d) {
    // Directions have already been lensed. A sparse deterministic sky is used
    // as context, with no unrelated image composited over the shadow.
    vec3 p=d*520.0;
    vec3 cell=floor(p),f=fract(p)-0.5;
    float seed=hash31(cell);
    float star=(1.0-smoothstep(0.0,0.18,length(f)))*step(0.9985,seed);
    float halo=0.0012+0.0012*pow(max(0.0,1.0-abs(d.y)),4.0);
    return vec3(0.42,0.54,0.75)*halo+star*mix(vec3(0.7,0.8,1),vec3(1,0.8,0.6),seed)*0.6;
}
void main() {
    ivec2 pixel=ivec2(gl_FragCoord.xy);
    vec4 hit=texelFetch(uHits,pixel,0);
    if(hit.w<=0.0) {
        vec4 escaped=texelFetch(uSky,pixel,0);
        fragColor=vec4(escaped.w>0.0?sky(escaped.xyz):vec3(0.0),1.0);return;
    }
    vec4 profile=radialProfile(hit.x);
    float time=uTime+hit.z;
    float turbulence=material(hit.x,hit.y,time,0.0)+material(hit.x,hit.y,time,60.0);
    float flux=max(profile.r,0.0)*turbulence;
    float g=clamp(hit.w,0.015,8.0);
    float received=flux*pow(g,4.0)*uAccretionScale;
    // A fixed Kelvin reference keeps physical mass/mdot temperature changes
    // visible. These RGB hues illustrate thermal structure (mainly UV/X-ray),
    // rather than claiming that the actual spectrum is optical orange.
    float temperature=profile.b/200000.0;
    vec3 colour=warmThermal(temperature*pow(turbulence,0.25)*g);
    if(uMode==1) {
        // Legend convention: blue = blueshift (>1), orange = redshift (<1).
        float scale=g<1.0?0.5+(1.0-g)/1.4:0.5-(g-1.0)/1.2;
        colour=diagnostic(clamp(scale,0.0,1.0));
        fragColor=vec4(colour*(0.48+0.22*sqrt(max(flux,0.0))),1.0);return;
    }
    if(uMode==2) {
        float density=clamp(profile.g/1.5,0.0,1.0);
        colour=mix(vec3(0.055,0.13,0.22),vec3(0.33,0.96,0.79),sqrt(density));
        fragColor=vec4(colour*(0.28+0.65*sqrt(density))*turbulence,1.0);return;
    }
    if(uMode==3)colour=vec3(0.83,0.89,1.0);
    fragColor=vec4(colour*received*1.7,1.0);
}
