/* SPDX-License-Identifier: GPL-3.0-only
 * Project completed ray radiance, never interpolate unrelated volume nodes.
 */
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uRadiance;
uniform vec2 uRadianceResolution;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uViewSpan;
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

void main() {
    vec2 plane=(vUv*uResolution-uCenter*uResolution)/uResolution.y*uViewSpan;
    vec2 uv=planeToMap(plane);
    vec3 color;
    if(any(lessThan(uv,vec2(0.001))) || any(greaterThan(uv,vec2(0.999))))
        color=background(sceneDirection(plane));
    else
        color=texture(uRadiance,clamp(uv,0.5/uRadianceResolution,1.0-0.5/uRadianceResolution)).rgb;
    fragColor=vec4(color,1.0);
}
