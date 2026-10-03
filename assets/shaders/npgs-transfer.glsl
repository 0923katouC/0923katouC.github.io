/* SPDX-License-Identifier: GPL-3.0-only
 * Shared surface opacity, emitter frames and opaque-source intersections.
 * Include after the scene constants and Kerr geometry helpers.
 */

float diskOpacityAtRadius(float r) {
    if (r <= DISK_INNER || r >= DISK_OUTER) return 0.0;
    float radial = (r - DISK_INNER) / (DISK_OUTER - DISK_INNER);
    // The intrinsic opacity used by diskEmission, without pixel coverage.
    float normalization = pow(2.4, 2.4) / (pow(0.9, 0.9) * pow(1.5, 1.5));
    float envelope = normalization * pow(radial, 0.9) * pow(1.0 - radial, 1.5);
    float edge = smoothstep(0.0, 0.025, radial) *
                 (1.0 - smoothstep(0.82, 1.0, radial));
    return edge * (0.90 + 0.08 * envelope);
}

bool normalizeEmitterVelocity(vec3 position, vec4 candidate, out vec4 velocity) {
    velocity = vec4(0.0);
    if (candidate.w <= 0.0 || any(isnan(candidate)) || any(isinf(candidate))) return false;
    KerrGeometry geo;
    ComputeGeometryScalars(position, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
    if (geo.r <= HORIZON) return false;
    float norm = dot(candidate, LowerIndex(candidate, geo));
    if (!(norm < -1e-8) || isinf(norm)) return false;
    velocity = candidate * inversesqrt(-norm);
    return true;
}

// Prescribed, optically thin funnel plasma, not a GRMHD solution. The finite
// parabolic expansion follows the structural motivation of Nakamura et al.:
// https://arxiv.org/abs/1810.09963 . Field/density normalizations are illustrative.
float jetWidthAtHeight(float height) {
    return sqrt(0.32 * 0.32 + 0.14 * max(height - 1.0, 0.0));
}

bool jetPlasmaFrame(vec3 position, out vec4 velocity, out vec4 magneticField,
                    out float fieldStrength, out float properDensity) {
    velocity = vec4(0.0);
    magneticField = vec4(0.0);
    fieldStrength = 0.0;
    properDensity = 0.0;
    KerrGeometry geo;
    ComputeGeometryScalars(position, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
    // A static observer does not exist inside the stationary limit.
    if (!(geo.f < 0.98) || geo.r <= HORIZON) return false;
    float height = abs(position.y);
    float rho = length(position.xz);
    float side = position.y < 0.0 ? -1.0 : 1.0;
    vec2 radial = rho > 1e-8 ? position.xz / rho : vec2(1.0, 0.0);
    float width = jetWidthAtHeight(height);
    // rho/W is constant along each prescribed streamline. The cylindrical
    // radial velocity points OUT in both lobes; only the vertical sign flips.
    float slope = height > 1.0 ? rho * 0.14 / (2.0 * width * width) : 0.0;
    vec3 tangent = vec3(radial.x * slope, side, radial.y * slope);
    vec4 observer = vec4(0.0, 0.0, 0.0, inversesqrt(1.0 - geo.f));
    vec4 axis = vec4(tangent, 0.0);
    axis += dot(axis, LowerIndex(observer, geo)) * observer;
    float axisNorm = dot(axis, LowerIndex(axis, geo));
    if (!(axisNorm > 0.0) || isinf(axisNorm)) return false;
    axis *= inversesqrt(axisNorm);
    float speed = 0.30 + 0.50 * (1.0 - exp(-max(height - 1.0, 0.0) / 5.0));
    float gamma = inversesqrt(1.0 - speed * speed);
    velocity = gamma * (observer + speed * axis);
    // Boost the flow-aligned spatial basis into the plasma rest frame.
    vec4 parallel = gamma * (axis + speed * observer);
    vec4 azimuth = vec4(radial.y, 0.0, -radial.x, 0.0);
    azimuth += dot(azimuth, LowerIndex(velocity, geo)) * velocity;
    azimuth -= dot(azimuth, LowerIndex(parallel, geo)) * parallel;
    float azimuthNorm = dot(azimuth, LowerIndex(azimuth, geo));
    if (!(azimuthNorm > 0.0) || isinf(azimuthNorm)) return false;
    azimuth *= inversesqrt(azimuthNorm);
    // Expansion scalings: n ~ 1/(gamma*v*W^2), B_p ~ W^-2, B_phi ~ W^-1.
    // The toroidal field vanishes on the axis. Its sign fixes the winding;
    // the poloidal field reverses relative to the outward flow in the south.
    float expansion = 0.45 / width;
    float poloidal = expansion * expansion;
    float toroidal = 0.60 * expansion * min(rho / width, 1.85);
    magneticField = side * poloidal * parallel - toroidal * azimuth;
    fieldStrength = sqrt(poloidal * poloidal + toroidal * toroidal);
    properDensity = expansion * expansion / (gamma * speed);
    return true;
}

bool jetEmitterVelocity(vec3 position, out vec4 velocity) {
    vec4 magneticField;
    float fieldStrength, properDensity;
    return jetPlasmaFrame(position, velocity, magneticField, fieldStrength, properDensity);
}

float jetFieldPerpendicular(vec4 momentum, vec4 velocity, vec4 magneticField,
                            float fieldStrength) {
    float energy = -dot(momentum, velocity);
    if (!(energy > 0.0) || !(fieldStrength > 0.0)) return 0.0;
    // b.u=0: p.b / (-p.u) is the field component along the photon direction
    // in the plasma frame. This includes aberration without a Euclidean angle.
    float alongRay = dot(momentum, magneticField) / energy;
    return sqrt(max(0.0, fieldStrength * fieldStrength - alongRay * alongRay));
}

float emitterPhotonEnergy(vec4 momentum, vec4 velocity) {
    // Momentum is covariant; the emitter four-velocity is contravariant.
    return -dot(momentum, velocity);
}

// Fluid surface intersections are provided by npgs-hydro.glsl.
