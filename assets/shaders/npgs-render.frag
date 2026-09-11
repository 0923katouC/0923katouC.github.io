/* SPDX-License-Identifier: GPL-3.0-only
 * Animated emission on stationary Kerr transfer maps; adapted from NPGS.
 * Thin-disk surface approximation, two images, emission-weighted jet motion.
 */
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDiskNear;
uniform sampler2D uDiskFar;
uniform sampler2D uSky;
uniform sampler2D uJet;
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

vec4 diskEmission(vec4 hit, float coverage, float imageOrder) {
    if (coverage < 0.001 || hit.w <= 0.0) return vec4(0.0);
    float r = sqrt(max(0.0, dot(hit.xy, hit.xy) - PHYSICAL_A * PHYSICAL_A));
    if (r <= DISK_INNER || r >= DISK_OUTER) return vec4(0.0);
    float radial = (r - DISK_INNER) / (DISK_OUTER - DISK_INNER);
    float emissionTime = uTime * 3.6 + hit.z;
    float omega = sqrt(0.5 * r) / (r * r + PHYSICAL_A * sqrt(0.5 * r));
    float theta = atan(hit.x, hit.y);
    // NPGS's inflowing spiral coordinates, plus local orbital advection.
    float u = sqrt(r);
    float eps3 = PHYSICAL_A * 0.70710678 / (u * u * u);
    float spiral = -16.9705627 / u * (1.0 - 0.25 * eps3 + 0.142857 * eps3 * eps3);
    float phase = theta - 0.65 * omega * emissionTime - spiral;
    float advectedR = r + emissionTime / 12.0;
    // Circular embedding avoids an azimuth seam without an extra noise pass.
    vec3 noisePoint = vec3(0.28 * advectedR, 0.58 * cos(phase), 0.58 * sin(phase));
    float turbulence = GenerateAccretionDiskNoise(noisePoint, 2.0, 4.0, 45.0);
    float filaments = 0.72 + 0.28 * sin(15.0 * r + 4.0 * phase + 2.6 * turbulence);
    float textureValue = clamp(0.28 + 1.2 * turbulence, 0.25, 2.4) * filaments;
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
    vec2 mapUv = plane / MAP_SPAN + 0.5;
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
        vec4 jet = texture(uJet, mapUv);
        if (jet.x > 0.001) {
            float flowTime = uTime * 3.6;
            float height = abs(jet.y / jet.x);
            vec2 phaseMoment = jet.zw / jet.x;
            float phase = 0.736 * flowTime;
            float coil = dot(phaseMoment, vec2(cos(phase), -sin(phase)));
            float ribbons = pow(clamp(0.5 + 0.5 * coil, 0.0, 1.0), 2.6);
            // Outward-moving knots and smaller eddies modulate the two
            // helical filaments, while a dim sheath connects the bright arcs.
            float advected = height - 0.8 * flowTime;
            float knots = 0.70 + 0.65 * pow(0.5 + 0.5 * PerlinNoise1D(advected * 0.72), 2.0);
            float eddies = 0.88 + 0.12 * PerlinNoise(vec3(advected * 1.5, phaseMoment * 2.8));
            float structure = (0.15 + 2.4 * ribbons) * knots * eddies;
            vec3 jetColor = KelvinToRgb(18500.0);
            color += jetColor * jet.x * structure * 3.2;
        }
    }
    float edge = max(abs(mapUv.x - 0.5), abs(mapUv.y - 0.5));
    if (edge > 0.46 && edge < 0.5) {
        color = mix(color, background(sceneDirection(plane)), smoothstep(0.46, 0.5, edge));
    }
    fragColor = vec4(max(color, vec3(0.0)), 1.0);
}
