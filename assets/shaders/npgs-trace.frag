/* SPDX-License-Identifier: GPL-3.0-only
 * Stationary-camera transfer maps using NPGS's analytic Hamiltonian + RK4.
 * Outputs: two equatorial disk intersections; escaping sky direction;
 * covariantly integrated jet intensity, harmonic moments and absolute height.
 */
uniform vec2 uMapSize;
uniform vec3 uStarPosition;
uniform float uStarRadius;
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

float jetWidthAtHeight(float height) {
    return 0.22 + 0.045 * max(height - 1.0, 0.0);
}

void integrateJet(vec4 x, vec4 p, float affineLength, float transmission,
                  inout vec4 moments) {
    float height = abs(x.y);
    float rho = length(x.xz);
    if (height <= 1.0 || height >= 35.0) return;
    // Both lobes launch on the spin axis in emitter coordinates. The soft
    // spine joins the narrower sheath without shifting its lensed image.
    float width = jetWidthAtHeight(height);
    float radius = rho / width;
    if (radius >= 1.5) return;
    float sheath = max(0.0, 1.0 - 2.0 * abs(1.0 - radius * radius));
    float spine = 0.12 * exp(-3.0 * radius * radius);
    float shape = (sheath + spine) * (1.0 - smoothstep(1.2, 1.5, radius)) / width;
    shape *= smoothstep(1.0, 1.8, height);
    // Prescribed heating is strongest in the launch zone. Its lensed image
    // follows the Kerr rays; far from the hole the jet remains nearly straight.
    shape *= 0.25 + 5.0 * exp(-0.5 * pow((height - 2.6) / 1.4, 2.0));
    // Mild comoving density structure, sampled on the curved ray itself.
    shape *= 0.75 + 0.25 * sin(4.2 * height +
              1.1 * sin(5.0 * x.x) + 0.8 * cos(5.0 * x.z));
    shape *= exp(-0.0025 * pow(height / DISK_INNER, 2.0));
    shape *= 1.0 - smoothstep(27.0, 35.0, height);
    vec4 velocity;
    if (!jetEmitterVelocity(x.xyz, velocity)) return;
    float emissionEnergy = emitterPhotonEnergy(p, velocity);
    if (!(emissionEnergy > 0.0) || isinf(emissionEnergy)) return;
    // The camera tetrad initializes observed photon energy to one. For
    // bolometric comoving emissivity, dI_obs = g^4 * j * dl_emit * T.
    float shift = 1.0 / emissionEnergy;
    float emittedLength = emissionEnergy * affineLength;
    float shift2 = shift * shift;
    float dw = 0.5 * shape * emittedLength * shift2 * shift2 * transmission;
    if (!(dw > 0.0) || isinf(dw)) return;
    // Linear harmonic moments reproduce the integral of j0*(1+A*cos(phi))
    // exactly under the chosen segment quadrature, including retarded time.
    float azimuth = rho > 1e-8 ? atan(x.x, x.z) : 0.0;
    float phase = 2.0 * azimuth - 0.92 * (height - 1.0) + 0.736 * x.w;
    // Keep the spine steady; an azimuthal mode is undefined on the axis.
    float harmonicFraction = sheath / (sheath + spine);
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
    if (closestRadius >= 1.5 * jetWidthAtHeight(maxHeight)) return;
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
        if (geo.r > 90.0 && dot(x.xyz, -k1.X.xyz) > 0.0) {
            skyRay = vec4(normalize(-k1.X.xyz), 1.0);
            break;
        }
        float ringDistance = length(vec2(x.y, length(x.xz) - PHYSICAL_A));
        float stepGeo = ringDistance / max(length(k1.X), 1e-6);
        float stepForce = length(p) / max(length(k1.P), 1e-8);
        float dt = 0.22 * min(stepGeo, stepForce);
        // Resolve the thin disk crossing and the jet sheath near the hole.
        if (geo.r < 24.0) dt = min(dt, 0.55 / max(length(k1.X.xyz), 1e-6));
        dt = max(dt, 1e-6);
        vec4 previousX = x;
        vec4 previousP = p;
        StepGeodesicRK4_Optimized(x, p, energy, -dt, PHYSICAL_A, 0.0,
                                   1.0, 1.0, false, geo, k1);
        if (any(isnan(x)) || any(isinf(x)) || any(isnan(p)) || any(isinf(p))) break;
        // The star is opaque: only surface crossings and jet emission in
        // front of its first intersection contribute to the base scene.
        float starFraction = whiteDwarfIntersection(previousX.xyz, x.xyz, uStarPosition, uStarRadius);
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
