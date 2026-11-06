/* SPDX-License-Identifier: GPL-3.0-only
 * Linear-radiance reconstruction followed by a modest display PSF and tone
 * mapping. This bloom does not contribute geometry or synthetic photon rings.
 */
uniform sampler2D uRadiance;
uniform vec2 uResolution;
uniform float uCenterSpacing;
uniform float uExposure;
uniform int uDiagnostic;
out vec4 fragColor;
vec3 fetchLinear(vec2 uv) {
    vec2 size=vec2(textureSize(uRadiance,0));
    vec2 p=uv*size-0.5;
    ivec2 base=ivec2(floor(p));vec2 f=fract(p);
    ivec2 hi=ivec2(size)-1;
    vec3 a=texelFetch(uRadiance,clamp(base,ivec2(0),hi),0).rgb;
    vec3 b=texelFetch(uRadiance,clamp(base+ivec2(1,0),ivec2(0),hi),0).rgb;
    vec3 c=texelFetch(uRadiance,clamp(base+ivec2(0,1),ivec2(0),hi),0).rgb;
    vec3 d=texelFetch(uRadiance,clamp(base+ivec2(1,1),ivec2(0),hi),0).rgb;
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
vec3 aces(vec3 x) {
    return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
}
float edgeLuminance(vec3 colour) {
    float y=dot(colour,vec3(0.2126,0.7152,0.0722))*uExposure;
    return sqrt(max(y,0.0)/(1.0+max(y,0.0)));
}
vec3 reconstructEdge(vec2 uv) {
    // Edge-directed antialiasing of completed radiance, never of r/phi/g.
    // Samples follow the local silhouette tangent; low-contrast disk regions
    // retain the original bilinear result rather than a full-image blur.
    vec2 texel=1.0/vec2(textureSize(uRadiance,0));
    vec3 center=fetchLinear(uv);
    float m=edgeLuminance(center);
    float nw=edgeLuminance(fetchLinear(uv+texel*vec2(-1,1)));
    float ne=edgeLuminance(fetchLinear(uv+texel*vec2(1,1)));
    float sw=edgeLuminance(fetchLinear(uv+texel*vec2(-1,-1)));
    float se=edgeLuminance(fetchLinear(uv+texel*vec2(1,-1)));
    float low=min(m,min(min(nw,ne),min(sw,se)));
    float high=max(m,max(max(nw,ne),max(sw,se)));
    if(high-low<max(0.045,high*0.12))return center;
    vec2 direction=vec2(-((nw+ne)-(sw+se)),(ne+se)-(nw+sw));
    float reduce=max((nw+ne+sw+se)*0.03125,0.0078125);
    float inverse=1.0/(min(abs(direction.x),abs(direction.y))+reduce);
    direction=clamp(direction*inverse,vec2(-4),vec2(4))*texel;
    vec3 a=0.5*(fetchLinear(uv-direction/6.0)+fetchLinear(uv+direction/6.0));
    vec3 b=0.5*a+0.25*(fetchLinear(uv-direction*0.5)+fetchLinear(uv+direction*0.5));
    float lb=edgeLuminance(b);
    return (lb<low||lb>high)?a:b;
}
// Invert grid*(a+(1-a)*abs(grid)) without cancellation near the origin.
vec2 cacheUV(vec2 screenUV) {
    vec2 p=2.0*screenUV-1.0;
    return 0.5+p/(uCenterSpacing+sqrt(uCenterSpacing*uCenterSpacing+4.0*(1.0-uCenterSpacing)*abs(p)));
}
void main() {
    vec2 uv=gl_FragCoord.xy/uResolution, coord=cacheUV(uv);
    vec2 footprint=fwidth(coord);
    vec2 cells=footprint*vec2(textureSize(uRadiance,0));
    float resolve=smoothstep(1.05,1.60,max(cells.x,cells.y));
    vec3 value=reconstructEdge(coord);
    if(resolve>0.0) {
        // Average the traced radiance over a display pixel. No interpolation
        // of hit radius, angle, frequency shift or hit type across the shadow.
        vec3 total=vec3(0.0);
        for(int y=-1;y<=1;++y)for(int x=-1;x<=1;++x)
            total+=fetchLinear(coord+vec2(x,y)*footprint/3.0);
        value=mix(value,total/9.0,resolve);
    }
    if(uDiagnostic==0) {
        vec3 bloom=vec3(0.0);
        vec2 stepSize=1.0/vec2(textureSize(uRadiance,0));
        for(int i=0;i<8;++i) {
            float a=float(i)*0.78539816339;
            vec2 offset=vec2(cos(a),sin(a))*stepSize;
            bloom+=max(fetchLinear(cacheUV(uv+offset*3.0))-0.5,0.0)*0.018;
            bloom+=max(fetchLinear(cacheUV(uv+offset*9.0))-0.7,0.0)*0.008;
        }
        value+=bloom;
    }
    value=aces(value*uExposure);
    // Zero disk radiance and an unlit patch of sky share one display black.
    // A tapered, opaque surface still blocks stars behind it.
    vec3 displayBlack=vec3(0.008,0.012,0.018);
    fragColor=vec4(mix(displayBlack,vec3(1.0),pow(value,vec3(1.0/2.2))),1.0);
}
