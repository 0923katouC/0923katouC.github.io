/* SPDX-License-Identifier: GPL-3.0-only
 * Stationary-camera transfer maps using NPGS's analytic Hamiltonian + RK4.
 * Outputs: two equatorial disk intersections; escaping sky direction;
 * line-integrated jet emissivity and its emission-weighted coordinates.
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

void integrateJet(vec4 x, vec4 p, float properLength, float transmission,
                  inout float weight, inout vec3 weightedPosition) {
    float height = abs(x.y);
    float rho = length(x.xz);
    // NPGS JetColor's hollow, widening sheath and longitudinal envelope.
    // Smooth shell boundaries avoid hard edges at this lower sampling density.
    float width = DISK_INNER + 0.2 * height;
    float shape = max(0.0, 1.0 - 2.0 * abs(1.0 - pow(rho / width, 2.0))) / width;
    if (shape <= 0.0 || height < 0.15 || height > 35.0) return;
    shape *= (1.0 - exp(-pow(height / DISK_INNER, 2.0)));
    shape *= exp(-0.005 * pow(height / DISK_INNER, 2.0));
    shape *= 1.0 - smoothstep(27.0, 35.0, height);
    KerrGeometry geo;
    ComputeGeometryScalars(x.xyz, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
    if (geo.f >= 0.98) return;
    // NPGS's 0.8c jet prescription, normalized in the local metric.
    vec3 us = vec3(0.0, sign(x.y) * 1.3333333333, 0.0);
    float ldu = dot(geo.l_down.xyz, us);
    float aa = -1.0 + geo.f;
    float bb = 2.0 * geo.f * ldu;
    float cc = dot(us, us) + geo.f * ldu * ldu + 1.0;
    float det = sqrt(max(0.0, bb * bb - 4.0 * aa * cc));
    float ut = bb < 0.0 ? 2.0 * cc / (-bb + det) : (-bb - det) / (2.0 * aa);
    float shift = clamp(1.0 / max(1e-5, -dot(p, vec4(us, ut))), 0.1, 2.5);
    float dw = 0.5 * shape * properLength * transmission;
    weight += dw;
    weightedPosition += dw * vec3(x.y, x.w, shift);
}

void main() {
    vec2 plane = (gl_FragCoord.xy / uMapSize - 0.5) * MAP_SPAN;
    vec4 x = vec4(CAMERA, 0.0);
    vec4 p = GetInitialMomentum(sceneDirection(plane), x, 0, 1.0,
                                PHYSICAL_A, 0.0, 1.0, false);
    float energy = -p.w;
    diskNear = vec4(0.0);
    diskFar = vec4(0.0);
    skyRay = vec4(0.0);
    jetRay = vec4(0.0);
    float jetWeight = 0.0;
    vec3 jetPosition = vec3(0.0);
    float transmission = 1.0;
    int hits = 0;
    for (int stepIndex = 0; stepIndex < 420; ++stepIndex) {
        KerrGeometry geo;
        ComputeGeometryScalars(x.xyz, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
        if (geo.r < HORIZON + 0.012 || any(isnan(x)) || any(isinf(x))) break;
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
        vec4 middle = 0.5 * (previousX + x);
        vec3 chord = x.xyz - previousX.xyz;
        float ld = dot(geo.l_down.xyz, chord);
        float properLength = sqrt(max(0.0, dot(chord, chord) + geo.f * ld * ld));
        integrateJet(middle, 0.5 * (previousP + p), properLength,
                     transmission, jetWeight, jetPosition);
        if (previousX.y * x.y < 0.0) {
            float crossing = previousX.y / (previousX.y - x.y);
            vec4 hit = diskIntersection(mix(previousX, x, crossing),
                                        mix(previousP, p, crossing), energy);
            if (hit.w > 0.0) {
                if (hits == 0) diskNear = hit;
                else if (hits == 1) diskFar = hit;
                ++hits;
                transmission *= 0.10;
                // Only the first two luminous intersections are retained.
                if (hits >= 2) break;
            }
        }
    }
    if (jetWeight > 1e-6) jetRay = vec4(jetWeight, jetPosition / jetWeight);
}
