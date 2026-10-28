// Newtonian test-particle orbits, dimensionless GM = 1.
// E and L are specific energy and the magnitude of specific angular momentum.
export function elements(E, L) {
  if (!Number.isFinite(E) || !Number.isFinite(L) || L <= 0) return { valid: false };
  const e2 = 1 + 2 * E * L * L;
  if (e2 < -2e-13) return { valid: false, Emin: -1 / (2 * L * L) };
  const e = Math.sqrt(Math.abs(e2) < 8 * Number.EPSILON ? 0 : Math.max(0, e2));
  const p = L * L, rp = p / (1 + e), alpha = -2 * E;
  return { valid: true, E, L, e, p, rp, alpha,
    ra: E < 0 ? (1 + e) / alpha : Infinity,
    a: E === 0 ? Infinity : 1 / alpha,
    period: E < 0 ? 2 * Math.PI / Math.pow(alpha, 1.5) : Infinity,
    kind: e < 1e-7 ? 'circle' : E < 0 ? 'ellipse' : E === 0 ? 'parabola' : 'hyperbola' };
}

export function potential(r, L) { return L * L / (2 * r * r) - 1 / r; }

// Stumpff functions, with series near the parabolic limit to avoid cancellation.
export function stumpff(z) {
  if (Math.abs(z) < 0.1) {
    let C = 0.5, S = 1 / 6, c = C, s = S;
    for (let k = 1; k <= 10; k++) {
      c *= -z / ((2 * k + 1) * (2 * k + 2));
      s *= -z / ((2 * k + 2) * (2 * k + 3));
      C += c; S += s;
    }
    return { C, S };
  }
  if (z > 0) { const q = Math.sqrt(z); return { C: 2 * Math.sin(q / 2) ** 2 / z, S: (q - Math.sin(q)) / q ** 3 }; }
  const q = Math.sqrt(-z);
  return { C: 2 * Math.sinh(q / 2) ** 2 / (-z), S: (Math.sinh(q) - q) / q ** 3 };
}

export function timeAtChi(o, chi) {
  return o.rp * chi + (1 - o.alpha * o.rp) * chi ** 3 * stumpff(o.alpha * chi * chi).S;
}

// Universal Kepler propagation from periapsis: the same equation handles all conics.
export function stateAtTime(o, time) {
  if (!o.valid || !Number.isFinite(time)) return null;
  let t = time;
  if (o.E < 0 && Math.abs(t) > o.period / 2) t = ((t + o.period / 2) % o.period + o.period) % o.period - o.period / 2;
  const sign = Math.sign(t), target = Math.abs(t);
  let lo = 0, hi = Math.max(1, Math.sqrt(o.rp));
  while (timeAtChi(o, hi) < target) hi *= 2;
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (timeAtChi(o, mid) < target) lo = mid; else hi = mid;
  }
  const chi = sign * (lo + hi) / 2, z = o.alpha * chi * chi;
  const { C, S } = stumpff(z);
  const x = o.rp - chi * chi * C, y = o.L * chi * (1 - z * S);
  const r = Math.hypot(x, y);
  const vx = chi * (z * S - 1) / r, vy = o.L / o.rp * (1 - chi * chi * C / r);
  return { x, y, r, vx, vy, vr: (x * vx + y * vy) / r };
}

// Open or very wide orbits are shown only inside a finite observational window.
export function windowFor(o) {
  if (!o.valid) return null;
  const limit = Math.max(12, 3 * o.rp);
  if (o.ra <= limit) return { radius: o.ra, halfTime: o.period / 2, theta: Math.PI, complete: true };
  let chi;
  if (Math.abs(o.alpha) < 1e-10) chi = Math.sqrt(2 * (limit - o.rp));
  else if (o.alpha > 0) chi = 2 * Math.asin(Math.sqrt(Math.min(1, (limit - o.rp) * o.alpha / (2 * o.e)))) / Math.sqrt(o.alpha);
  else chi = 2 * Math.asinh(Math.sqrt((limit - o.rp) * (-o.alpha) / (2 * o.e))) / Math.sqrt(-o.alpha);
  const theta = Math.acos(Math.max(-1, Math.min(1, (o.p / limit - 1) / o.e)));
  return { radius: limit, halfTime: timeAtChi(o, chi), theta, complete: false };
}

export function sampleOrbit(o, count = 500) {
  if (!o.valid) return [];
  const w = windowFor(o);
  return Array.from({ length: count + 1 }, (_, i) => {
    const theta = -w.theta + 2 * w.theta * i / count;
    const r = o.p / (1 + o.e * Math.cos(theta));
    return { x: r * Math.cos(theta), y: r * Math.sin(theta), r, vr: o.e * Math.sin(theta) / o.L };
  });
}
