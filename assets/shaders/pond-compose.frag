/* SPDX-License-Identifier: GPL-3.0-only
 * Linear-radiance reconstruction followed by a modest display PSF and tone
 * mapping. This bloom does not contribute geometry or synthetic photon rings.
 */
uniform sampler2D uRadiance;
uniform vec2 uResolution;
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
void main() {
    vec2 uv=gl_FragCoord.xy/uResolution;
    vec3 value=fetchLinear(uv);
    if(uDiagnostic==0) {
        vec3 bloom=vec3(0.0);
        vec2 stepSize=1.0/vec2(textureSize(uRadiance,0));
        for(int i=0;i<8;++i) {
            float a=float(i)*0.78539816339;
            vec2 offset=vec2(cos(a),sin(a))*stepSize;
            bloom+=max(fetchLinear(uv+offset*3.0)-0.5,0.0)*0.018;
            bloom+=max(fetchLinear(uv+offset*9.0)-0.7,0.0)*0.008;
        }
        value+=bloom;
    }
    value=aces(value*uExposure);
    fragColor=vec4(pow(value,vec3(1.0/2.2)),1.0);
}
