/* SPDX-License-Identifier: GPL-3.0-only
 * Fixed ballistic debris snapshot, traced with the same Kerr null geodesics
 * as the disk/jet maps. Only its optically thin emissivity is animated through
 * retarded-time harmonic moments; this is not a hydrodynamic evolution.
 * Outputs: (W, C, S, W-weighted observed temperature / 10000 K), and opaque
 * white-dwarf surface radiance/coverage, already attenuated by foreground disk.
 */
uniform vec2 uMapSize;
uniform highp sampler2D uDebris;
uniform int uDebrisCount;
uniform vec4 uGroupMin[8];
uniform vec4 uGroupMax[8];
uniform vec3 uStarPosition;
uniform vec4 uStarVelocity;
uniform float uStarRadius;
layout(location = 0) out vec4 streamLight;
layout(location = 1) out vec4 starLight;

bool tidalBoundsOverlap(vec3 lo, vec3 hi, vec3 boxLo, vec3 boxHi) {
    return all(greaterThanEqual(hi, boxLo)) && all(lessThanEqual(lo, boxHi));
}

int tidalGroupMask(vec3 start, vec3 end, vec3 boundsLo, vec3 boundsHi) {
    if (uDebrisCount < 2) return 0;
    vec3 lo = min(start, end);
    vec3 hi = max(start, end);
    if (!tidalBoundsOverlap(lo, hi, boundsLo, boundsHi)) return 0;
    int mask = 0;
    for (int group = 0; group < 8; ++group) {
        if (group * 8 >= uDebrisCount - 1) break;
        if (tidalBoundsOverlap(lo, hi, uGroupMin[group].xyz, uGroupMax[group].xyz)) {
            mask |= 1 << group;
        }
    }
    return mask;
}

void tidalStreamSample(vec4 x, vec4 p, float affineLength, float transmission,
                       int groupMask, inout vec4 moments) {
    float closest = 1.0;
    float tubeRadius = 0.0;
    float centerline = 0.0;
    vec4 candidateVelocity = vec4(0.0);
    // Distance to the finite centerline segments defines a continuous tube;
    // choose the nearest segment so adjoining capsules do not double-count.
    for (int group = 0; group < 8; ++group) {
        if ((groupMask & (1 << group)) == 0) continue;
        if (any(lessThan(x.xyz, uGroupMin[group].xyz)) ||
            any(greaterThan(x.xyz, uGroupMax[group].xyz))) continue;
        for (int member = 0; member < 8; ++member) {
            int index = group * 8 + member;
            if (index >= uDebrisCount - 1 || index >= 63) break;
            vec4 a = texelFetch(uDebris, ivec2(index, 0), 0);
            vec4 b = texelFetch(uDebris, ivec2(index + 1, 0), 0);
            vec3 segment = b.xyz - a.xyz;
            float fraction = clamp(dot(x.xyz - a.xyz, segment) /
                                   max(dot(segment, segment), 1e-10), 0.0, 1.0);
            float radius = max(mix(a.w, b.w, fraction), 1e-4);
            vec3 offset = x.xyz - mix(a.xyz, b.xyz, fraction);
            float distanceSquared = dot(offset, offset) / (radius * radius);
            if (distanceSquared >= closest) continue;
            closest = distanceSquared;
            tubeRadius = radius;
            centerline = (float(index) + fraction) / float(max(uDebrisCount - 1, 1));
            candidateVelocity = mix(texelFetch(uDebris, ivec2(index, 1), 0),
                                    texelFetch(uDebris, ivec2(index + 1, 1), 0), fraction);
        }
    }
    if (tubeRadius <= 0.0) return;
    vec4 velocity;
    if (!normalizeEmitterVelocity(x.xyz, candidateVelocity, velocity)) return;
    float emitterEnergy = emitterPhotonEnergy(p, velocity);
    if (!(emitterEnergy > 1e-5) || isinf(emitterEnergy)) return;
    float shift = 1.0 / emitterEnergy; // Camera photons start with local energy 1.
    // Bolometric transfer: g^4 j_em dl_em, dl_em=(-p.u) |d lambda|.
    // The smooth compact profile is an illustrative optically thin emissivity.
    float profile = (1.0 - closest) * (1.0 - closest);
    float emissivity = 0.55 * profile / tubeRadius;
    // Diffuse ends of the prescribed debris tube rather than a hard cut.
    emissivity *= smoothstep(0.0, 0.08, centerline) *
                  (1.0 - smoothstep(0.88, 1.0, centerline));
    float dlEmitter = emitterEnergy * affineLength;
    float shiftSquared = shift * shift;
    float weight = transmission * emissivity * dlEmitter * shiftSquared * shiftSquared;
    if (!(weight > 0.0) || isinf(weight)) return;
    float phase = 18.0 * centerline + 0.8 * x.w;
    float temperature = clamp(12000.0 * shift, 1500.0, 40000.0);
    moments += weight * vec4(1.0, cos(phase), sin(phase), temperature / 10000.0);
}

void tidalIntegrateInterval(vec4 startX, vec4 endX, vec4 startP, vec4 endP,
                            float lo, float hi, float affineStep, int samples,
                            float transmission, int groupMask, inout vec4 moments) {
    if (groupMask == 0 || hi <= lo || samples <= 0 || transmission < 0.005) return;
    float width = (hi - lo) / float(samples);
    for (int sampleIndex = 0; sampleIndex < 12; ++sampleIndex) {
        if (sampleIndex >= samples) break;
        float fraction = lo + (float(sampleIndex) + 0.5) * width;
        tidalStreamSample(mix(startX, endX, fraction), mix(startP, endP, fraction),
                          affineStep * width, transmission, groupMask, moments);
    }
}

vec3 tidalKelvinToRgb(float temperature) {
    float t = clamp(temperature, 1500.0, 40000.0) / 100.0;
    vec3 rgb;
    if (t <= 66.0) {
        rgb.r = 1.0;
        rgb.g = 0.39008158 * log(t) - 0.63184144;
        rgb.b = t <= 19.0 ? 0.0 : 0.54320679 * log(t - 10.0) - 1.19625409;
    } else {
        rgb.r = 1.29293619 * pow(t - 60.0, -0.13320476);
        rgb.g = 1.12989086 * pow(t - 60.0, -0.07551485);
        rgb.b = 1.0;
    }
    // The Kelvin fit gives display RGB; surface radiance is accumulated linear.
    return pow(clamp(rgb, 0.0, 1.0), vec3(2.2));
}

vec4 tidalWhiteDwarfLight(vec4 x, vec4 p, float transmission) {
    vec4 velocity;
    if (!normalizeEmitterVelocity(x.xyz, uStarVelocity, velocity)) return vec4(0.0, 0.0, 0.0, transmission);
    float emitterEnergy = emitterPhotonEnergy(p, velocity);
    if (!(emitterEnergy > 1e-5) || isinf(emitterEnergy)) return vec4(0.0, 0.0, 0.0, transmission);
    float shift = 1.0 / emitterEnergy;
    vec3 radial = vec3(uStarPosition.x, 0.0, uStarPosition.z);
    radial = length(radial) > 1e-6 ? normalize(radial) : vec3(1.0, 0.0, 0.0);
    vec3 offset = x.xyz - uStarPosition;
    float minorSquared = max(0.64 * uStarRadius * uStarRadius, 1e-8);
    float majorSquared = max(2.25 * uStarRadius * uStarRadius, 1e-8);
    vec3 gradient = offset / minorSquared + radial * dot(offset, radial) *
                    (1.0 / majorSquared - 1.0 / minorSquared);
    KerrGeometry geo;
    ComputeGeometryScalars(x.xyz, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
    vec4 normalCovector = vec4(gradient, 0.0);
    vec4 normal = RaiseIndex(normalCovector, geo);
    // Project the surface normal into the emitter's rest space. The photon
    // covector remains future-directed even while the ray is traced backward.
    normal += dot(normalCovector, velocity) * velocity;
    normal /= sqrt(max(dot(normal, LowerIndex(normal, geo)), 1e-10));
    float mu = clamp(dot(p, normal) / emitterEnergy, 0.0, 1.0);
    float limb = 0.35 + 0.65 * mu;
    float shiftSquared = shift * shift;
    vec3 color = tidalKelvinToRgb(15000.0 * shift);
    return vec4(transmission * color * (2.4 * limb * shiftSquared * shiftSquared), transmission);
}

void main() {
    vec2 plane = mapToPlane(gl_FragCoord.xy / uMapSize);
    vec4 x = vec4(CAMERA, 0.0);
    vec4 p = GetInitialMomentum(sceneDirection(plane), x, 0, 1.0,
                                PHYSICAL_A, 0.0, 1.0, false);
    float energy = -p.w;
    streamLight = vec4(0.0);
    starLight = vec4(0.0);
    vec3 boundsLo = vec3(1e20);
    vec3 boundsHi = vec3(-1e20);
    for (int group = 0; group < 8; ++group) {
        if (group * 8 >= uDebrisCount - 1) break;
        boundsLo = min(boundsLo, uGroupMin[group].xyz);
        boundsHi = max(boundsHi, uGroupMax[group].xyz);
    }
    float transmission = 1.0;
    for (int stepIndex = 0; stepIndex < 420; ++stepIndex) {
        KerrGeometry geo;
        ComputeGeometryScalars(x.xyz, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
        if (geo.r < HORIZON + 0.012 || any(isnan(x)) || any(isinf(x)) ||
            any(isnan(p)) || any(isinf(p))) break;
        State state; state.X = x; state.P = p;
        State k1 = GetDerivativesAnalytic(state, PHYSICAL_A, 0.0, 1.0, false, geo);
        if (geo.r > 90.0 && dot(x.xyz, -k1.X.xyz) > 0.0) break;
        float ringDistance = length(vec2(x.y, length(x.xz) - PHYSICAL_A));
        float stepGeo = ringDistance / max(length(k1.X), 1e-6);
        float stepForce = length(p) / max(length(k1.P), 1e-8);
        float dt = 0.22 * min(stepGeo, stepForce);
        if (geo.r < 24.0) dt = min(dt, 0.55 / max(length(k1.X.xyz), 1e-6));
        dt = max(dt, 1e-6);
        vec4 previousX = x;
        vec4 previousP = p;
        StepGeodesicRK4_Optimized(x, p, energy, -dt, PHYSICAL_A, 0.0,
                                 1.0, 1.0, false, geo, k1);
        if (any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) break;
        float starFraction = whiteDwarfIntersection(previousX.xyz, x.xyz, uStarPosition, uStarRadius);
        float endFraction = min(starFraction, 1.0);
        vec3 clippedEnd = mix(previousX.xyz, x.xyz, endFraction);
        int groupMask = tidalGroupMask(previousX.xyz, clippedEnd, boundsLo, boundsHi);
        int samples = clamp(int(ceil(length(clippedEnd - previousX.xyz) / 0.045)), 2, 12);
        float crossing = 2.0;
        float opacity = 0.0;
        if (previousX.y * x.y < 0.0) {
            crossing = previousX.y / (previousX.y - x.y);
            float r = KerrSchildRadius(mix(previousX.xyz, x.xyz, crossing), PHYSICAL_A, 1.0);
            opacity = diskOpacityAtRadius(r);
        }
        // Partition the single <=12-sample budget at the disk event, then
        // terminate at the opaque star. This preserves observer-to-source order.
        if (crossing < endFraction && opacity > 0.0) {
            int beforeSamples = clamp(int(floor(float(samples) * crossing / max(endFraction, 1e-8))), 1, samples - 1);
            tidalIntegrateInterval(previousX, x, previousP, p, 0.0, crossing, dt,
                                   beforeSamples, transmission, groupMask, streamLight);
            transmission *= 1.0 - opacity;
            tidalIntegrateInterval(previousX, x, previousP, p, crossing, endFraction, dt,
                                   samples - beforeSamples, transmission, groupMask, streamLight);
        } else {
            tidalIntegrateInterval(previousX, x, previousP, p, 0.0, endFraction, dt,
                                   samples, transmission, groupMask, streamLight);
        }
        if (transmission < 0.005) break;
        if (starFraction <= 1.0) {
            starLight = tidalWhiteDwarfLight(mix(previousX, x, starFraction),
                                            mix(previousP, p, starFraction), transmission);
            break;
        }
    }
    // A uniform scale preserves signed harmonic ratios and temperature while
    // ensuring RGBA16F storage cannot overflow in unusually bright caustics.
    float peak = max(max(abs(streamLight.x), abs(streamLight.y)),
                     max(abs(streamLight.z), abs(streamLight.w)));
    streamLight *= min(1.0, 60000.0 / max(peak, 1.0));
    starLight.rgb = min(starLight.rgb, vec3(60000.0));
}
