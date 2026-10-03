/* SPDX-License-Identifier: GPL-3.0-only
 * Animated emission on stationary Kerr transfer maps; adapted from NPGS.
 * Thin-disk surface approximation, two images, a luminous differentially rotating accretion disk.
 */
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDiskNear;
uniform sampler2D uDiskFar;
uniform sampler2D uSky;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uViewSpan;
uniform float uTime;

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

vec4 diskSample(sampler2D map, vec2 uv, out float coverage) {
    // Interpolate only valid hits. Zero sentinels must not drag disk coordinates
    // towards the origin at a silhouette edge or create a false glowing ring.
    ivec2 size = textureSize(map, 0);
    vec2 q = clamp(uv * vec2(size) - 0.5, vec2(0.0), vec2(size - 1));
    ivec2 base = ivec2(floor(q));
    ivec2 next = min(base + 1, size - 1);
    vec2 f = fract(q);
    vec4 a = texelFetch(map, base, 0);
    vec4 b = texelFetch(map, ivec2(next.x, base.y), 0);
    vec4 c = texelFetch(map, ivec2(base.x, next.y), 0);
    vec4 d = texelFetch(map, next, 0);
    vec4 w = vec4((1.0-f.x)*(1.0-f.y), f.x*(1.0-f.y), (1.0-f.x)*f.y, f.x*f.y);
    w *= step(vec4(0.001), vec4(a.w, b.w, c.w, d.w));
    coverage = dot(w, vec4(1.0));
    if (coverage < 0.001) return vec4(0.0);
    // Distinct images close to the photon ring must not interpolate through
    // unrelated azimuths. Select the nearest valid sample across such seams.
    vec4 nearest = w.x > w.y ? a : b;
    float best = max(w.x, w.y);
    if (w.z > best) { nearest = c; best = w.z; }
    if (w.w > best) nearest = d;
    if ((a.w > 0.0 && distance(a.xy, nearest.xy) > 1.8) ||
        (b.w > 0.0 && distance(b.xy, nearest.xy) > 1.8) ||
        (c.w > 0.0 && distance(c.xy, nearest.xy) > 1.8) ||
        (d.w > 0.0 && distance(d.xy, nearest.xy) > 1.8)) return nearest;
    return (a*w.x + b*w.y + c*w.z + d*w.w) / coverage;
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
float polarDiskNoise(vec2 point, vec2 dx, vec2 dy, vec3 seed) {
    float accumulation = 1.0;
    for (int i=0;i<3;++i) {
        float frequency = pow(3.0,float(i)+2.0);
        float footprint = max(length(dx),length(dy))*frequency;
        float weight = (1.0-smoothstep(0.2,0.8,footprint)) * (i==2 ? 0.45 : 1.0);
        float value = PerlinNoise(vec3(point.x*frequency,seed.y,point.y*frequency)+seed);
        accumulation *= 1.0 + 0.1*value*weight;
    }
    return log(1.0+pow(accumulation,28.0));
}
float diskFeature(float r, float theta, float time, float offset,
                  vec2 dr, vec2 dtheta, vec2 dt) {
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
    vec2 point = vec2(0.18*birthR,0.055*phi);
    vec2 dx = vec2(0.18*dBirthR.x,0.055*dPhase.x);
    vec2 dy = vec2(0.18*dBirthR.y,0.055*dPhase.y);
    float noise = polarDiskNoise(point,dx,dy,seedOffset);
    // Match opposite sides of the atan branch cut with a C1-continuous blend.
    // Noise gradients use the unwrapped angle, never the wrapped phi jump.
    float seam = 0.35;
    if (phi < -kPi+seam) {
        float wrapped = polarDiskNoise(point+vec2(0.0,0.055*2.0*kPi),dx,dy,seedOffset);
        noise = mix(wrapped,noise,smoothstep(-kPi,-kPi+seam,phi));
    }
    return clamp(0.30+1.0*noise,0.30,1.80);
}
float diskTexture(vec4 hit, float r) {
    float time = uTime*3.6 + hit.z; // Backward ray integration gives t_emit < t_obs.
    float theta = atan(hit.x,hit.y); // +y spin: tangent (z,0,-x), as in p_phi.
    vec2 dr = vec2(dFdx(r),dFdy(r));
    vec2 tangent = vec2(hit.y,-hit.x)/max(dot(hit.xy,hit.xy),1e-6);
    vec2 dtheta = vec2(dot(tangent,dFdx(hit.xy)),dot(tangent,dFdy(hit.xy)));
    vec2 dt = vec2(dFdx(time),dFdy(time));
    float age = mod(time,FEATURE_LIFETIME);
    float weight = pow(sin(kPi*age/FEATURE_LIFETIME),2.0);
    float a = diskFeature(r,theta,time,0.0,dr,dtheta,dt);
    float b = diskFeature(r,theta,time,FEATURE_LIFETIME*0.5,dr,dtheta,dt);
    // Complementary smooth windows prevent a visible reset or blank interval.
    return weight*a + (1.0-weight)*b;
}

vec4 diskEmission(vec4 hit, float coverage, float imageOrder) {
    if (coverage < 0.001 || hit.w <= 0.0) return vec4(0.0);
    float r = sqrt(max(0.0, dot(hit.xy, hit.xy) - PHYSICAL_A * PHYSICAL_A));
    if (r <= DISK_INNER || r >= DISK_OUTER) return vec4(0.0);
    float radial = (r - DISK_INNER) / (DISK_OUTER - DISK_INNER);
    float textureValue = diskTexture(hit,r);
    float envelope = Shape(radial, 0.9, 1.5);
    // NPGS's standard thin-disk T(r), normalized here for a warm visible palette.
    // This is an artistic temperature scale, not an observed physical spectrum.
    float tempProfile = pow(pow(DISK_INNER / r, 3.0) *
                            max(0.0, 1.0 - sqrt(DISK_INNER / r)) / 0.05665278, 0.25);
    float temperature = max(900.0, 5800.0 * tempProfile * pow(hit.w, 0.65));
    vec3 color = KelvinToRgb(temperature);
    float emission = (0.22 + 1.65 * pow(tempProfile, 1.4)) * textureValue;
    emission *= (0.24 + 0.76 * envelope) * min(pow(hit.w, 2.5), 2.8);
    emission *= 1.0 + 0.24 * imageOrder;
    float edge = smoothstep(0.0, 0.025, radial) * (1.0 - smoothstep(0.82, 1.0, radial));
    float alpha = coverage * edge * (0.90 + 0.08 * envelope);
    return vec4(color * emission * alpha * 1.65, alpha);
}

void main() {
    vec2 plane = (vUv * uResolution - uCenter * uResolution) / uResolution.y * uViewSpan;
    vec2 mapUv = planeToMap(plane);
    vec3 color;
    if (any(lessThan(mapUv, vec2(0.001))) || any(greaterThan(mapUv, vec2(0.999)))) {
        color = background(sceneDirection(plane));
    } else {
        float coverNear, coverFar;
        vec4 nearHit = diskSample(uDiskNear, mapUv, coverNear);
        vec4 farHit = diskSample(uDiskFar, mapUv, coverFar);
        vec4 nearDisk = diskEmission(nearHit, coverNear, 0.0);
        vec4 farDisk = diskEmission(farHit, coverFar, 1.0);
        // Normalize the filtered escape direction and gate the shadow mask.
        // Filtering avoids derivative spikes from quantized transfer texels.
        vec4 sky = texture(uSky, mapUv);
        vec3 skyColor = sky.w > 0.8 ? background(sky.xyz) : vec3(0.0);
        color = nearDisk.rgb + (1.0 - nearDisk.a) *
                (farDisk.rgb + (1.0 - farDisk.a) * skyColor);

    }
    float edge = max(abs(mapUv.x - 0.5), abs(mapUv.y - 0.5));
    if (edge > 0.46 && edge < 0.5) {
        color = mix(color, background(sceneDirection(plane)), smoothstep(0.46, 0.5, edge));
    }
    fragColor = vec4(max(color, vec3(0.0)), 1.0);
}
