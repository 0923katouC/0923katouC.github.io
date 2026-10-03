/* SPDX-License-Identifier: GPL-3.0-only
 * Finite-height cloud emission along cached, numerically integrated Kerr rays.
 * Ordered proper-length volume samples, with front-to-back absorption.
 */
in vec2 vUv;
out vec4 fragColor;
uniform highp usampler2D uRayCache;
uniform vec2 uMapSize;
uniform vec2 uRadianceResolution;
uniform int uCacheWidth;
uniform int uNodeCount;
uniform float uTime;
uniform float uGrainDetail;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 starLayer(vec2 uv, float scale, float seed) {
    vec2 cell = floor(uv * scale);
    vec2 local = fract(uv * scale);
    float random = hash21(cell + seed);
    vec2 center = 0.2 + 0.6 * vec2(hash21(cell + seed + 5.4), hash21(cell + seed + 13.8));
    float pixelWidth = max(length(fwidth(uv * scale)), 0.02);
    float distanceToStar = length(local - center) / pixelWidth;
    float size = mix(0.36, 0.82, pow(random, 7.0));
    float point = exp(-distanceToStar * distanceToStar / (size * size));
    float glow = 0.06 * exp(-distanceToStar * distanceToStar / (8.0 * size * size));
    float brightness = step(0.969, random) * (0.12 + 0.9 * pow(random, 16.0));
    brightness *= min(1.0, 0.016 / (pixelWidth * pixelWidth));
    vec3 tint = mix(vec3(0.58, 0.73, 1.0), vec3(1.0, 0.77, 0.47), hash21(cell + 27.0));
    return tint * brightness * (point + glow);
}

vec3 background(vec3 direction) {
    vec3 d = normalize(direction);
    // Cube projection: procedural stars follow the *escaped* lensed ray.
    vec3 a = abs(d);
    vec2 uv;
    float face;
    if (a.z >= a.x && a.z >= a.y) { uv = d.xy / a.z; face = sign(d.z); }
    else if (a.x >= a.y) { uv = d.zy / a.x; face = 3.0 * sign(d.x); }
    else { uv = d.xz / a.y; face = 5.0 * sign(d.y); }
    float cloud = 0.5 + 0.5 * PerlinNoise(d * 3.0 + vec3(8.0, 2.0, 5.0));
    float dust = 0.5 + 0.5 * PerlinNoise(d * 9.0 + 11.0);
    vec3 night = vec3(0.0022, 0.0042, 0.0090);
    night += vec3(0.004, 0.005, 0.011) * cloud * cloud;
    night += vec3(0.004, 0.002, 0.005) * cloud * dust;
    return night + starLayer(uv, 55.0, 41.0 * face)
                 + starLayer(uv, 135.0, 83.0 * face) * 0.35;
}

struct RayNode { vec4 positionTime; vec4 transfer; };
RayNode readNode(ivec2 ray, int index) {
    int slot = (ray.y*int(uMapSize.x)+ray.x)*(uNodeCount+1)+index;
    uvec4 encoded = texelFetch(uRayCache,ivec2(slot%uCacheWidth,slot/uCacheWidth),0);
    RayNode node;
    node.positionTime = vec4(unpackHalf2x16(encoded.x),unpackHalf2x16(encoded.y));
    node.transfer = vec4(unpackHalf2x16(encoded.z),unpackHalf2x16(encoded.w));
    return node;
}
float volumeRadius(vec3 p) {
    float b=dot(p,p)-PHYSICAL_A*PHYSICAL_A;
    return sqrt(max(0.0,0.5*(b+sqrt(b*b+4.0*PHYSICAL_A*PHYSICAL_A*p.y*p.y))));
}

// Emission features have a finite lifetime, as turbulent structures do.
// Backtrace every texture coordinate through ONE velocity field: prograde
// Keplerian rotation plus a small inward drift. This is a kinematic surface
// model, not an evolution of the fluid stress-energy tensor.
const float FEATURE_LIFETIME = 48.0;
const float INFLOW_SPEED = 0.02;
float diskOmega(float r) {
    float root = sqrt(0.5 * r);
    return root / (r*r + PHYSICAL_A*root);
}
vec2 birthSpiral(float r) {
    float u = sqrt(r);
    float eps = PHYSICAL_A * 0.70710678 / (r*u);
    float spiral = -16.9705627 / u * (1.0 - 0.25*eps + 0.142857*eps*eps);
    float slope = 8.48528135 / (r*u) * (1.0 - eps + eps*eps);
    return vec2(spiral,slope);
}
vec2 diskBirthCoordinates(float r, float theta, float age) {
    float stepR = INFLOW_SPEED*age*0.25;
    float birthR = r + 4.0*stepR;
    // Composite Simpson quadrature of integral_r^birthR Omega(s) ds / v.
    float orbit = age/12.0 * (diskOmega(r) + 4.0*diskOmega(r+stepR)
                  + 2.0*diskOmega(r+2.0*stepR) + 4.0*diskOmega(r+3.0*stepR)
                  + diskOmega(birthR));
    return vec2(birthR,theta-orbit);
}
// Anisotropic polar noise: fine radial structure, long azimuthal filaments.
// Based on NPGS's separate radial/azimuthal coordinates, without circular
// noise embedding or noise-displaced sine contours that produced eye shapes.
float polarDiskNoise(vec3 point, vec3 dx, vec3 dy, vec3 seed) {
    float accumulation = 1.0;
    for (int i=0;i<3;++i) {
        float frequency = pow(3.0,float(i)+2.0);
        float footprint = max(length(dx),length(dy))*frequency;
        float weight = (1.0-smoothstep(0.2,0.8,footprint)) * (i==2 ? 0.45 : 1.0);
        float value = PerlinNoise(point*frequency+seed+vec3(0.0,seed.y,0.0));
        accumulation *= 1.0 + 0.1*value*weight;
    }
    return log(1.0+pow(accumulation,28.0));
}
// A separate, zero-mean density field supplies resolvable material grains.
// It shares the cloud's birth coordinates: no screen-space or per-frame noise.
const vec2 GRAIN_FREQUENCY = vec2(10.0,8.0);
const float GRAIN_EMISSION_CONTRAST = 0.65;
const float GRAIN_DENSITY_CONTRAST = 0.38;
float densityGrain(vec2 birth, vec2 dr, vec2 dphi, float phaseRate, vec3 seed) {
    vec2 dx = GRAIN_FREQUENCY*vec2(dr.x,dphi.x);
    vec2 dy = GRAIN_FREQUENCY*vec2(dr.y,dphi.y);
    float spatial = max(length(dx),length(dy));
    // Limit motion per 30 Hz frame as well as the spatial pixel footprint.
    float temporal = length(GRAIN_FREQUENCY*vec2(INFLOW_SPEED,phaseRate))*3.6/30.0;
    float filterWeight = 1.0-smoothstep(0.25,0.95,max(spatial,temporal));
    if (filterWeight <= 0.0 || uGrainDetail <= 0.0) return 0.0;
    vec2 q = GRAIN_FREQUENCY*birth + seed.xz + vec2(7.1,19.3);
    // Integer Y samples one lattice plane instead of averaging two planes.
    float grain = PerlinNoise(vec3(q.x,floor(seed.y),q.y));
    return grain*filterWeight*uGrainDetail;
}
vec2 diskFeature(float r, float theta, float height, float time, float offset,
                  vec2 dr, vec2 dtheta, vec2 dy, vec2 dt) {
    float cycle = floor((time + offset) / FEATURE_LIFETIME);
    float age = mod(time + offset, FEATURE_LIFETIME);
    vec2 birth = diskBirthCoordinates(r,theta,age);
    float birthR = birth.x;
    float omega = diskOmega(r);
    float birthOmega = diskOmega(birthR);
    vec2 spiral = birthSpiral(birthR);
    float phase = birth.y - spiral.x;
    // The layer is invisible (with zero slope) when this seed is replaced.
    float seed = mod(cycle,4096.0) + 17.0*offset;
    vec3 seedOffset = vec3(hash21(vec2(seed,1.0)), hash21(vec2(seed,2.0)),
                           hash21(vec2(seed,3.0))) * 32.0;
    vec2 dBirthR = dr + INFLOW_SPEED*dt;
    vec2 dPhase = dtheta - (birthOmega-omega)/INFLOW_SPEED*dr
                  - birthOmega*dt - spiral.y*dBirthR;
    float phi = atan(sin(phase),cos(phase));
    // Material follows a fixed relative height in the gently flared disk.
    float relativeHeight=height/volumeHalfHeight(r);
    vec2 dRelativeHeight=(dy-relativeHeight*0.075*step(3.0,r)*dr)/volumeHalfHeight(r);
    float birthHeight=relativeHeight*volumeHalfHeight(birthR);
    vec2 dBirthHeight=volumeHalfHeight(birthR)*dRelativeHeight
                      +relativeHeight*0.075*step(3.0,birthR)*dBirthR;
    vec3 point = vec3(0.18*birthR,0.14*birthHeight,0.055*phi);
    vec3 dx = vec3(0.18*dBirthR.x,0.14*dBirthHeight.x,0.055*dPhase.x);
    vec3 ddy = vec3(0.18*dBirthR.y,0.14*dBirthHeight.y,0.055*dPhase.y);
    float noise = polarDiskNoise(point,dx,ddy,seedOffset);
    float phaseRate = -birthOmega-spiral.y*INFLOW_SPEED;
    float grain = densityGrain(vec2(birthR,phi),dBirthR,dPhase,phaseRate,seedOffset);
    // Match opposite sides of the atan branch cut with a C1-continuous blend.
    // Noise gradients use the unwrapped angle, never the wrapped phi jump.
    float seam = 0.35;
    if (phi < -kPi+seam) {
        float wrapped = polarDiskNoise(point+vec3(0.0,0.0,0.055*2.0*kPi),dx,ddy,seedOffset);
        float wrappedGrain = densityGrain(vec2(birthR,phi+2.0*kPi),dBirthR,dPhase,phaseRate,seedOffset);
        float blend = smoothstep(-kPi,-kPi+seam,phi);
        noise = mix(wrapped,noise,blend);
        grain = mix(wrappedGrain,grain,blend);
    }
    return vec2(clamp(0.30+noise,0.30,1.80),grain);
}
vec2 diskTexture(vec4 hit, float r, float height) {
    float time = uTime*3.6 + hit.z; // Backward ray integration gives t_emit < t_obs.
    float theta = atan(hit.x,hit.y); // +y spin: tangent (z,0,-x), as in p_phi.
    vec2 dr = vec2(dFdx(r),dFdy(r));
    vec2 tangent = vec2(hit.y,-hit.x)/max(dot(hit.xy,hit.xy),1e-6);
    vec2 dtheta = vec2(dot(tangent,dFdx(hit.xy)),dot(tangent,dFdy(hit.xy)));
    vec2 dt = vec2(dFdx(time),dFdy(time));
    vec2 dy = vec2(dFdx(height),dFdy(height));
    float age = mod(time,FEATURE_LIFETIME);
    float weight = pow(sin(kPi*age/FEATURE_LIFETIME),2.0);
    vec2 a = diskFeature(r,theta,height,time,0.0,dr,dtheta,dy,dt);
    vec2 b = diskFeature(r,theta,height,time,FEATURE_LIFETIME*0.5,dr,dtheta,dy,dt);
    // Complementary smooth windows prevent a visible reset or blank interval.
    vec2 material = weight*a + (1.0-weight)*b;
    // Preserve the variance of centered fine detail during population mixing.
    // The positive cloud brightness keeps the original 1.0BH interpolation.
    material.y /= sqrt(weight*weight + (1.0-weight)*(1.0-weight));
    return material;
}

vec4 volumeEmission(RayNode node) {
    float shift=node.transfer.x, lengthInEmitterFrame=node.transfer.y;
    vec3 pos=node.positionTime.xyz;
    float actualRadius=volumeRadius(pos);
    bool valid=node.transfer.w>0.5 && shift>0.0 && lengthInEmitterFrame>0.0
               && actualRadius>DISK_INNER && actualRadius<DISK_OUTER;
    if(dot(pos.xz,pos.xz)<1e-6) pos=vec3(DISK_INNER+0.05,0.0,0.0);
    float r=clamp(actualRadius,DISK_INNER+0.001,DISK_OUTER-0.001);
    // Evaluate derivatives before the validity branch: neighboring fragments
    // must evaluate the SAME ordered node, even when one ray has no material.
    vec2 material=diskTexture(vec4(pos.x,pos.z,node.positionTime.w,shift),r,pos.y);
    if(!valid) return vec4(0.0);
    float radial=(r-DISK_INNER)/(DISK_OUTER-DISK_INNER);
    float envelope=Shape(radial,0.9,1.5);
    float halfHeight=volumeHalfHeight(r);
    // Noise changes the cloud's real vertical density, inside the traced bound.
    float cloudHeight=halfHeight*(0.82+0.14*clamp(material.x,0.3,1.6));
    float vertical=pow(max(0.0,1.0-pow(pos.y/cloudHeight,2.0)),1.5);
    float density=envelope*vertical*max(0.25,0.55+0.45*material.x+GRAIN_DENSITY_CONTRAST*material.y);
    float opticalDepth=2.1*density*lengthInEmitterFrame/halfHeight;
    float alpha=1.0-exp(-min(opticalDepth,30.0));
    float tempProfile=pow(pow(DISK_INNER/r,3.0)*max(0.0,1.0-sqrt(DISK_INNER/r))/0.05665278,0.25);
    float temperature=max(900.0,5800.0*tempProfile*pow(shift,0.65));
    float source=(0.18+1.55*pow(tempProfile,1.4))*(0.35+0.65*envelope);
    source *= material.x*(1.0+GRAIN_EMISSION_CONTRAST*material.y);
    float innerCloud=max(0.0,1.0-5.0*radial*radial);
    source *= 1.0+0.08*innerCloud*max(material.y,0.0);
    // g^3 transports specific radiance; colours are an illustrative palette.
    vec3 emission=KelvinToRgb(temperature)*source*min(pow(shift,3.0),3.0)*1.30;
    return vec4(emission*alpha,alpha);
}

ivec2 rayForPixel(ivec2 pixel) {
    return min(ivec2((vec2(pixel)+0.5)*uMapSize/uRadianceResolution),ivec2(uMapSize)-1);
}
void main() {
    ivec2 pixel=ivec2(gl_FragCoord.xy);
    ivec2 ray=rayForPixel(pixel);
    RayNode raySky=readNode(ray,uNodeCount);
    vec3 escapeDirection=raySky.positionTime.w>0.5 ? normalize(raySky.positionTime.xyz)
        : sceneDirection(mapToPlane((vec2(ray)+0.5)/uMapSize));
    vec3 sky=raySky.positionTime.w*background(escapeDirection);
    // Integrate each physical ray completely before screen-space filtering.
    // Fixed passage slots keep corresponding material nodes aligned in quads.
    ivec2 quadBase=pixel-(pixel%2);
    bool evaluateMaterial=raySky.transfer.z>0.5
       || readNode(rayForPixel(quadBase),uNodeCount).transfer.z>0.5
       || readNode(rayForPixel(quadBase+ivec2(1,0)),uNodeCount).transfer.z>0.5
       || readNode(rayForPixel(quadBase+ivec2(0,1)),uNodeCount).transfer.z>0.5
       || readNode(rayForPixel(quadBase+ivec2(1,1)),uNodeCount).transfer.z>0.5;
    vec4 accumulated=vec4(0.0);
    if(evaluateMaterial) {
        for(int index=0;index<12;++index) {
            if(index>=uNodeCount) break;
            RayNode node=readNode(ray,index);
            vec4 cloud=volumeEmission(node);
            accumulated+=(1.0-accumulated.a)*cloud;
        }
    }
    fragColor=vec4(max(accumulated.rgb+(1.0-accumulated.a)*sky,vec3(0.0)),accumulated.a);
}
