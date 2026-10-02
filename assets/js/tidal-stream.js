/* SPDX-License-Identifier: GPL-3.0-only
 * Massive-particle companion to npgs-kerr.glsl. Coordinates (x,y,z,t),
 * signature (+++-), spin +y; Rs = 1, M = 0.5, c = 1.
 * This is a frozen ballistic tidal-debris illustration, not GR hydrodynamics.
 * A radial stellar bundle is released with a shared coordinate velocity at
 * the approximate tidal radius and followed to ONE coordinate-time slice.
 * The star/core profile and transverse stream width are emission models;
 * the calculation does not determine surviving mass, shocks, or accretion.
 * Physical scale: 10^4 solar-mass BH, 0.6 solar-mass WD, R_WD = 0.30 Rs
 * (~8860 km); r_t = R_WD (M_BH/M_WD)^(1/3) = 7.66 Rs, outside the horizon.
 * WD/IMBH scale and tidal approximation: Maguire et al., 2020,
 * https://arxiv.org/abs/2004.00146 . Full fluid/self-gravity treatment:
 * Cheng & Evans, 2013, https://arxiv.org/abs/1303.4129 .
 */
((root) => {
  'use strict';

  // Same exterior, uncharged, ingoing Kerr-Schild metric as the ray tracer:
  // g_mn = eta_mn + f l_m l_n; g^mn = eta^mn - f l^m l^n.
  function geometry(q, a) {
    const [x, y, z] = q;
    const a2 = a * a;
    const b = x * x + y * y + z * z - a2;
    const det = Math.sqrt(b * b + 4 * a2 * y * y);
    const r2 = b >= 0 ? (b + det) / 2 : 2 * a2 * y * y / (det - b);
    const r = Math.sqrt(r2);
    const den = r2 * r2 + a2 * y * y;
    const inv = 1 / (r2 + a2);
    const f = r2 * r / den;
    const l = [(r * x - a * z) * inv, y / r, (r * z + a * x) * inv];
    const dr = [x * r2 * r / den, y * (r2 + a2) * r / den, z * r2 * r / den];
    const dfdr = r * (-r2 * r2 * r + 3 * a2 * r * y * y) / (den * den);
    const df = dr.map(v => v * dfdr);
    df[1] -= 2 * a2 * y * r2 * r / (den * den);
    const dl = [[], [], []];
    for (let j = 0; j < 3; j++) {
      const dInv = -2 * r * inv * inv * dr[j];
      dl[0][j] = inv * (x * dr[j] + (j === 0 ? r : 0) - (j === 2 ? a : 0)) + (r * x - a * z) * dInv;
      dl[1][j] = (j === 1 ? 1 / r : 0) - y * dr[j] / r2;
      dl[2][j] = inv * (z * dr[j] + (j === 2 ? r : 0) + (j === 0 ? a : 0)) + (r * z + a * x) * dInv;
    }
    return {r, f, l, df, dl};
  }

  function fourVelocity(s, a) {
    const g = geometry(s, a);
    const lp = g.l[0] * s[4] + g.l[1] * s[5] + g.l[2] * s[6] - s[7];
    return [s[4] - g.f * lp * g.l[0], s[5] - g.f * lp * g.l[1],
            s[6] - g.f * lp * g.l[2], -s[7] + g.f * lp];
  }

  function massShell(s, a) {
    const u = fourVelocity(s, a);
    return s[4] * u[0] + s[5] * u[1] + s[6] * u[2] + s[7] * u[3];
  }

  // Normalize a shared initial coordinate velocity at each particle's own
  // location. Massive matter satisfies g(u,u) = -1, never the null correction
  // used by the photon integrator.
  function initialize(position, velocity, a) {
    const g = geometry(position, a);
    const lv = 1 + g.l.reduce((sum, v, j) => sum + v * velocity[j], 0);
    const lapse = 1 - velocity.reduce((sum, v) => sum + v * v, 0) - g.f * lv * lv;
    if (!(lapse > 0)) throw new RangeError('Initial debris velocity must be timelike.');
    const ut = 1 / Math.sqrt(lapse);
    const common = g.f * lv * ut;
    return [...position, 0, ...velocity.map((v, j) => ut * v + common * g.l[j]), -ut + common];
  }

  // Hamilton's equations for H = (g^mn p_m p_n)/2. Analytical derivatives
  // mirror GetDerivativesAnalytic in npgs-kerr.glsl. Dividing by u^t changes
  // only the integration parameter: all debris is sampled at the SAME t.
  function derivative(s, a) {
    const g = geometry(s, a);
    const lp = g.l[0] * s[4] + g.l[1] * s[5] + g.l[2] * s[6] - s[7];
    const ut = -s[7] + g.f * lp;
    const d = [0, 0, 0, 1, 0, 0, 0, 0];
    for (let j = 0; j < 3; j++) {
      d[j] = (s[j + 4] - g.f * lp * g.l[j]) / ut;
      const dp = s[4] * g.dl[0][j] + s[5] * g.dl[1][j] + s[6] * g.dl[2][j];
      d[j + 4] = (0.5 * lp * lp * g.df[j] + g.f * lp * dp) / ut;
    }
    return d;
  }

  function step(s, h, a) {
    const k1 = derivative(s, a);
    const k2 = derivative(s.map((v, j) => v + 0.5 * h * k1[j]), a);
    const k3 = derivative(s.map((v, j) => v + 0.5 * h * k2[j]), a);
    const k4 = derivative(s.map((v, j) => v + h * k3[j]), a);
    return s.map((v, j) => v + h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
  }

  function initialOrbit(radius, energy, angularMomentum, a) {
    const x = Math.sqrt(radius * radius + a * a);
    const g = geometry([x, 0, 0], a);
    const pz = -angularMomentum / x;
    const c = g.l[2] * pz + energy;
    const qa = 1 - g.f * g.l[0] * g.l[0];
    const qb = -2 * g.f * g.l[0] * c;
    const qc = pz * pz - energy * energy - g.f * c * c + 1;
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant < 0) throw new RangeError('Orbit cannot reach the disruption radius.');
    const px = (-qb - Math.sqrt(discriminant)) / (2 * qa);
    return [x, 0, 0, 0, px, 0, pz, -energy];
  }

  function generate(options = {}) {
    const finite = (name, value, min, max) => {
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${name} must be between ${min} and ${max}.`);
      }
      return value;
    };
    const count = Math.round(finite('samples', options.samples === undefined ? 64 : options.samples, 8, 96));
    const a = options.spin === undefined ? 0.43 : options.spin;
    finite('spin', a, -0.499, 0.499);
    // A returning-debris phase exposes the curved leading stream as it
    // wraps around the hole and overlaps the inner accretion disk.
    const time = 425;
    const dt = finite('step', options.step === undefined ? 0.25 : options.step, 0.03125, 1);
    const starRadius = 0.30;
    const radius = starRadius * Math.cbrt(1e4 / 0.6);
    // Bound equatorial encounter; these are dimensionless Killing integrals.
    // The bundle's energy/angular-momentum spread follows from its initial
    // spatial extent and per-particle timelike normalization, not manual kicks.
    const energy = 0.968;
    const angular = 1.8;
    const center = initialOrbit(radius, energy, angular, a);
    const u = fourVelocity(center, a);
    const velocity = u.slice(0, 3).map(v => v / u[3]);
    const states = [];
    for (let i = 0; i < count; i++) {
      const offset = starRadius * (-1 + 2 * i / (count - 1));
      states.push(initialize([center[0] + offset, 0, 0], velocity, a));
    }
    states.push(center);
    const initial = states.map(s => ({energy: -s[7], angular: s[2] * s[4] - s[0] * s[6]}));
    let maxMassShellError = 0;
    let maxAngularMomentumDrift = 0;
    let maxEnergyDrift = 0;
    let minRadius = Infinity;
    for (let t = 0; t < time - 1e-10; t += dt) {
      const h = Math.min(dt, time - t);
      for (let i = 0; i < states.length; i++) {
        const r = geometry(states[i], a).r;
        if (!(r > 0.5 + Math.sqrt(0.25 - a * a) + 0.05)) {
          throw new RangeError('This spin captures the debris; use the default exterior encounter.');
        }
        states[i] = step(states[i], h, a);
        maxMassShellError = Math.max(maxMassShellError, Math.abs(massShell(states[i], a) + 1));
        maxAngularMomentumDrift = Math.max(maxAngularMomentumDrift, Math.abs(states[i][2] * states[i][4] - states[i][0] * states[i][6] - initial[i].angular));
        maxEnergyDrift = Math.max(maxEnergyDrift, Math.abs(-states[i][7] - initial[i].energy));
        minRadius = Math.min(minRadius, geometry(states[i], a).r);
      }
    }
    const starState = states.pop();
    const starAngle = Math.atan2(starState[2], starState[0]);
    const targetAngle = finite('angle', options.angle === undefined ? -0.36 : options.angle, -Math.PI * 2, Math.PI * 2);
    // Rotation about the Kerr symmetry axis preserves the computed solution.
    const angle = targetAngle - starAngle;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const rotate = v => [ca * v[0] - sa * v[2], v[1], sa * v[0] + ca * v[2], ...(v.length === 4 ? [v[3]] : [])];
    const points = new Float32Array(count * 4);
    const velocities = new Float32Array(count * 4);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    states.forEach((s, i) => {
      const p = rotate(s.slice(0, 3));
      const fraction = i / (count - 1);
      const width = 0.065 + 0.075 * Math.pow(Math.sin(Math.PI * fraction), 2);
      points.set([...p, width], i * 4);
      velocities.set(rotate(fourVelocity(s, a)), i * 4);
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], p[j] - 3 * width);
        max[j] = Math.max(max[j], p[j] + 3 * width);
      }
    });
    const groups = [];
    for (let start = 0; start < count - 1; start += 8) {
      const end = Math.min(start + 8, count - 1);
      const groupMin = [Infinity, Infinity, Infinity], groupMax = [-Infinity, -Infinity, -Infinity];
      for (let i = start; i <= end; i++) for (let j = 0; j < 3; j++) {
        const margin = points[i * 4 + 3] * 3;
        groupMin[j] = Math.min(groupMin[j], points[i * 4 + j] - margin);
        groupMax[j] = Math.max(groupMax[j], points[i * 4 + j] + margin);
      }
      groups.push({start, end, min: groupMin, max: groupMax});
    }
    return {points, velocities, groups, star: {position: rotate(starState.slice(0, 3)), velocity: rotate(fourVelocity(starState, a)), radius: starRadius}, bounds: {min, max},
      diagnostics: {maxMassShellError, maxAngularMomentumDrift, maxEnergyDrift, minRadius},
      model: {spin: a, time, initialRadius: radius, samples: count, energy, angularMomentum: angular,
        blackHoleSolarMasses: 1e4, whiteDwarfSolarMasses: 0.6, whiteDwarfRadius: starRadius,
        description: 'Frozen equal-time ballistic Kerr tidal bundle; prescribed emission, no hydrodynamics or self-gravity.'}};
  }

  const api = Object.freeze({generate});
  root.AcademicTidalStream = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
