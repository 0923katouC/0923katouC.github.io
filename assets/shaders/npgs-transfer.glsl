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

bool jetEmitterVelocity(vec3 position, out vec4 velocity) {
    velocity = vec4(0.0);
    KerrGeometry geo;
    ComputeGeometryScalars(position, PHYSICAL_A, 0.0, 1.0, 1.0, false, geo);
    // A static observer does not exist inside the stationary limit.
    if (!(geo.f < 0.98) || geo.r <= HORIZON) return false;
    vec4 observer = vec4(0.0, 0.0, 0.0, inversesqrt(1.0 - geo.f));
    vec4 axis = vec4(0.0, position.y < 0.0 ? -1.0 : 1.0, 0.0, 0.0);
    axis += dot(axis, LowerIndex(observer, geo)) * observer;
    float axisNorm = dot(axis, LowerIndex(axis, geo));
    if (!(axisNorm > 0.0) || isinf(axisNorm)) return false;
    axis *= inversesqrt(axisNorm);
    // Exactly 0.8c in the local static observer's orthonormal frame.
    velocity = (5.0 / 3.0) * (observer + 0.8 * axis);
    return true;
}

float emitterPhotonEnergy(vec4 momentum, vec4 velocity) {
    // Momentum is covariant; the emitter four-velocity is contravariant.
    return -dot(momentum, velocity);
}

float whiteDwarfIntersection(vec3 start, vec3 end, vec3 center, float radius) {
    if (!(radius > 0.0)) return 2.0;
    float radialLength = length(center.xz);
    vec2 radial = radialLength > 1e-8 ? center.xz / radialLength : vec2(1.0, 0.0);
    vec2 tangent = vec2(-radial.y, radial.x);
    vec3 offset = start - center;
    vec3 chord = end - start;
    vec3 axes = radius * vec3(1.5, 0.8, 0.8);
    vec3 origin = vec3(dot(offset.xz, radial), offset.y, dot(offset.xz, tangent)) / axes;
    vec3 direction = vec3(dot(chord.xz, radial), chord.y, dot(chord.xz, tangent)) / axes;
    float c = dot(origin, origin) - 1.0;
    if (c <= 0.0) return 0.0;
    float a = dot(direction, direction);
    float b = dot(origin, direction);
    if (a < 1e-20 || b >= 0.0) return 2.0;
    float discriminant = b * b - a * c;
    if (discriminant < 0.0) return 2.0;
    // Stable smaller root of a*t*t + 2*b*t + c = 0.
    float fraction = c / (-b + sqrt(discriminant));
    return fraction <= 1.0 ? fraction : 2.0;
}
