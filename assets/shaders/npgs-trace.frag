/* SPDX-License-Identifier: GPL-3.0-only
 * Stationary-camera transfer maps using NPGS's analytic Hamiltonian + RK4.
 * Outputs: two equatorial disk intersections; escaping sky direction;
 * covariantly integrated jet intensity, harmonic moments and absolute height.
 * The jet is a semi-analytic optically thin representative-band model, not
 * a GRMHD evolution. Frequency-dependent transfer follows the invariant
 * conventions of ipole (https://arxiv.org/abs/1712.03057) and RAPTOR
 * (https://arxiv.org/abs/1801.10452); the prescribed funnel geometry is
 * motivated by https://arxiv.org/abs/1810.09963, not fitted to a WD TDE.
 */
uniform vec2 uMapSize;
layout(location = 0) out vec4 diskNear;
layout(location = 1) out vec4 diskFar;
layout(location = 2) out vec4 skyRay;
layout(location = 3) out vec4 jetRay;

vec4 diskIntersection(vec4 x, vec4 p, float energy) {
    float r = KerrSchildRadius(x.xyz, PHYSICAL_A, 1.0);
    if (r <= DISK_INNER || r >= DISK_OUTER) return vec4(0.0);
    float omega = GetKeplerianAngularVelocity(r, 1.0, PHYSICAL_A, 0.0);
    // NPGS DiskColor: emitter four-velocity and -p_mu u^mu.
    float potential = 1.0 / r;
    float gtt = -1.0 + potential;
    float gtp = -PHYSICAL_A * potential;
    float gpp = r * r + PHYSICAL_A * PHYSICAL_A * (1.0 + potential);
    float ut = inversesqrt(max(0.01, -(gtt + 2.0 * omega * gtp + omega * omega * gpp)));
    float pphi = x.z * p.x - x.x * p.z;
    float emitEnergy = ut * (energy - omega * pphi);
    float shift = clamp(1.0 / max(1e-5, emitEnergy), 0.05, 3.0);
    return vec4(x.x, x.z, x.w, shift);
}

void integrateJet(vec4 x, vec4 p, float affineLength, float transmission,
                  inout vec4 moments) {
    float height = abs(x.y);
    float rho = length(x.xz);
    if (height <= 1.0 || height >= 35.0) return;
    // A broad plasma sheath surrounds a faint spine; both belong to the same
    // finite-base parabolic funnel. There is no image-space warp or mask.
    float width = jetWidthAtHeight(height);
    float radius = rho / width;
    if (radius >= 1.85) return;
    float sheath = exp(-0.5 * pow((radius - 0.72) / 0.32, 2.0)) *
                   smoothstep(0.0, 0.35, radius);
    float spine = 0.035 * exp(-0.5 * pow(radius / 0.28, 2.0));
    float shape = (sheath + spine) * (1.0 - smoothstep(1.5, 1.85, radius));
    shape *= smoothstep(1.0, 1.8, height);
    // Moderate, positive, multiscale inhomogeneity in the prescribed snapshot.
    // Unlike the small time harmonic below, these are not evolved fluid modes.
    shape *= 1.0 + 0.16 * sin(2.7 * height + 1.7 * sin(4.0 * x.x) +
                            1.1 * cos(3.0 * x.z)) +
                   0.08 * sin(7.3 * height - 3.4 * x.x + 2.9 * x.z);
    shape *= 1.0 - smoothstep(27.0, 35.0, height);
    vec4 velocity, magneticField;
    float fieldStrength, properDensity;
    if (!jetPlasmaFrame(x.xyz, velocity, magneticField, fieldStrength, properDensity)) return;
    float emissionEnergy = emitterPhotonEnergy(p, velocity);
    if (!(emissionEnergy > 0.0) || isinf(emissionEnergy)) return;
    float perpendicularField = jetFieldPerpendicular(p, velocity, magneticField, fieldStrength);
    // Isotropic power-law electrons with p=2.4 give alpha=(p-1)/2=0.7 and
    // j'_nu ~ n*B_perp^1.7*nu'^-0.7. At fixed observer frequency nu_obs,
    // g^3*j'_nu(nu_obs/g) becomes g^3.7*j'_nu(nu_obs). Units, electron
    // normalization and the representative frequency are in the amplitude.
    // Volume absorption is explicitly neglected; T is foreground disk transfer.
    float shift = 1.0 / emissionEnergy;
    float emittedLength = emissionEnergy * affineLength;
    float emissivity = 0.32 * properDensity * shape * pow(perpendicularField, 1.7);
    float dw = emissivity * emittedLength * pow(shift, 3.7) * transmission;
    if (!(dw > 0.0) || isinf(dw)) return;
    // Linear harmonic moments reproduce the integral of j0*(1+A*cos(phi))
    // exactly under the chosen segment quadrature, including retarded time.
    float azimuth = rho > 1e-8 ? atan(x.x, x.z) : 0.0;
    float phase = 2.0 * azimuth - 0.92 * (height - 1.0) + 0.736 * x.w;
    // Keep the spine steady. Weak modulation avoids globally coherent rods;
    // the renderer's 0.6 multiplier limits the resulting contrast to 12%.
    float harmonicFraction = 0.20 * sheath / (sheath + spine);
    moments += dw * vec4(1.0, harmonicFraction * cos(phase),
                        harmonicFraction * sin(phase), height);
}

void integrateJetSegment(vec4 startX, vec4 endX, vec4 startP, vec4 endP,
                         float affineLength, float transmission, inout vec4 moments) {
    if (affineLength <= 0.0 || transmission <= 0.0) return;
    vec3 chord = endX.xyz - startX.xyz;
    float maxHeight = max(abs(startX.y), abs(endX.y));
    float minHeight = startX.y * endX.y < 0.0 ? 0.0 : min(abs(startX.y), abs(endX.y));
    if (maxHeight <= 1.0 || minHeight >= 35.0) return;
    float closestFraction = clamp(-dot(startX.xz, chord.xz) /
                                  max(dot(chord.xz, chord.xz), 1e-8), 0.0, 1.0);
    float closestRadius = length(startX.xz + closestFraction * chord.xz);
    if (closestRadius >= 1.85 * jetWidthAtHeight(maxHeight)) return;
    // Resolve the small launch region more finely, with bounded quadrature.
    float spacing = clamp(0.45 * jetWidthAtHeight(minHeight), 0.045, 0.16);
    int samples = clamp(int(ceil(length(chord) / spacing)), 3, 32);
    for (int sampleIndex = 0; sampleIndex < 32; ++sampleIndex) {
        if (sampleIndex >= samples) break;
        float fraction = (float(sampleIndex) + 0.5) / float(samples);
        integrateJet(mix(startX, endX, fraction), mix(startP, endP, fraction),
                     affineLength / float(samples), transmission, moments);
    }
}

void main() {
    vec2 plane = mapToPlane(gl_FragCoord.xy / uMapSize);
    vec4 x = vec4(CAMERA, 0.0);
    vec4 p = GetInitialMomentum(sceneDirection(plane), x, 0, 1.0,
                                PHYSICAL_A, 0.0, 1.0, false);
    float energy = -p.w;
    diskNear = vec4(0.0);
    diskFar = vec4(0.0);
    skyRay = vec4(0.0);
    jetRay = vec4(0.0);
    vec4 jetMoments = vec4(0.0);
    float transmission = 1.0;
    int hits = 0;
    for (int stepIndex = 0; stepIndex < 420; ++stepIndex) {
        KerrGeometry geo;
        ComputeGeometryScalars(x.xyz, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
        if (geo.r < HORIZON + 0.012 || any(isnan(x)) || any(isinf(x)) ||
            any(isnan(p)) || any(isinf(p))) break;
        State s; s.X = x; s.P = p;
        State k1 = GetDerivativesAnalytic(s, PHYSICAL_A, 0.0, 1.0, false, geo);
        if (geo.r > 110.0 && dot(x.xyz, -k1.X.xyz) > 0.0) {
            skyRay = vec4(normalize(-k1.X.xyz), 1.0);
            break;
        }
        float ringDistance = length(vec2(x.y, length(x.xz) - PHYSICAL_A));
        float stepGeo = ringDistance / max(length(k1.X), 1e-6);
        float stepForce = length(p) / max(length(k1.P), 1e-8);
        float dt = 0.22 * min(stepGeo, stepForce);
        // Resolve the thin disk crossing and the jet sheath near the hole.
        if (geo.r < 24.0) dt = min(dt, 0.55 / max(length(k1.X.xyz), 1e-6));
        dt = max(hydroStepLimit(x.xyz, length(k1.X.xyz), dt), 1e-6);
        vec4 previousX = x;
        vec4 previousP = p;
        StepGeodesicRK4_Optimized(x, p, energy, -dt, PHYSICAL_A, 0.0,
                                   1.0, 1.0, false, geo, k1);
        if (any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) break;
        // The star is opaque: only surface crossings and jet emission in
        // front of its first intersection contribute to the base scene.
        float starFraction = hydroCoreIntersection(previousX.xyz, x.xyz);
        bool hitStar = starFraction <= 1.0;
        float segmentFraction = hitStar ? starFraction : 1.0;
        vec4 segmentX = mix(previousX, x, segmentFraction);
        vec4 segmentP = mix(previousP, p, segmentFraction);
        float segmentLength = dt * segmentFraction;
        float crossing = 1.0;
        vec4 hit = vec4(0.0);
        if (previousX.y * segmentX.y < 0.0) {
            crossing = previousX.y / (previousX.y - segmentX.y);
            hit = diskIntersection(mix(previousX, segmentX, crossing),
                                   mix(previousP, segmentP, crossing), energy);
        }
        if (hit.w > 0.0) {
            vec4 crossingX = mix(previousX, segmentX, crossing);
            vec4 crossingP = mix(previousP, segmentP, crossing);
            integrateJetSegment(previousX, crossingX, previousP, crossingP,
                                segmentLength * crossing, transmission, jetMoments);
            if (hits == 0) diskNear = hit;
            else if (hits == 1) diskFar = hit;
            ++hits;
            transmission *= 1.0 - diskOpacityAtRadius(KerrSchildRadius(crossingX.xyz, PHYSICAL_A, 1.0));
            if (transmission < 0.005) break;
            integrateJetSegment(crossingX, segmentX, crossingP, segmentP,
                                segmentLength * (1.0 - crossing), transmission, jetMoments);
        } else {
            integrateJetSegment(previousX, segmentX, previousP, segmentP,
                                segmentLength, transmission, jetMoments);
        }
        if (hitStar) break;
    }
    // Premultiplied moments remain well-defined under bilinear interpolation
    // at a narrow sheath's boundary, including between valid and empty texels.
    if (jetMoments.x > 1e-6) jetRay = jetMoments;
}
