'use strict';
const assert = require('node:assert/strict');
const {generate} = require('../assets/js/tidal-stream.js');

// Independently contract the emitted four-velocity with the Kerr-Schild
// metric. This catches accidentally packing photon/null momenta, covariant
// momenta, or velocities using the wrong rotation/signature.
function norm(position, u, spin) {
  const [x, y, z] = position;
  const b = x * x + y * y + z * z - spin * spin;
  const r = Math.sqrt((b + Math.sqrt(b * b + 4 * spin * spin * y * y)) / 2);
  const inv = 1 / (r * r + spin * spin);
  const l = [(r * x - spin * z) * inv, y / r, (r * z + spin * x) * inv];
  const f = r ** 3 / (r ** 4 + spin * spin * y * y);
  const lu = l[0] * u[0] + l[1] * u[1] + l[2] * u[2] + u[3];
  return u[0] ** 2 + u[1] ** 2 + u[2] ** 2 - u[3] ** 2 + f * lu * lu;
}

const s = generate();
assert.equal(s.points.length, 64 * 4);
assert.equal(s.velocities.length, s.points.length);
assert.equal(s.groups.length, 8);
assert(s.diagnostics.maxMassShellError < 2e-8);
assert(s.diagnostics.maxAngularMomentumDrift < 3e-8);
assert.equal(s.diagnostics.maxEnergyDrift, 0);
assert(s.diagnostics.minRadius > 3);
assert(Math.abs(norm(s.star.position, s.star.velocity, 0.43) + 1) < 2e-8);
let minRadius = Infinity, maxRadius = 0;
for (let i = 0; i < s.points.length; i += 4) {
  const p = s.points.slice(i, i + 3), u = s.velocities.slice(i, i + 4);
  assert([...p, ...u].every(Number.isFinite));
  assert(Math.abs(norm(p, u, 0.43) + 1) < 3e-7);
  assert(u[3] > 0, 'Matter must remain future-directed.');
  const radius = Math.hypot(...p);
  minRadius = Math.min(minRadius, radius); maxRadius = Math.max(maxRadius, radius);
}
assert(minRadius < 8 && maxRadius > 11, 'Debris must straddle the outer disk.');
assert(s.star.position[0] > 9 && s.star.position[0] < 10);
for (let g = 0; g < s.groups.length; g++) {
  const group = s.groups[g];
  assert.equal(group.start, 8 * g);
  assert.equal(group.end, Math.min(8 * g + 8, 63));
  for (let i = group.start; i <= group.end; i++) for (let j = 0; j < 3; j++) {
    const p = s.points[i * 4 + j], margin = 3 * s.points[i * 4 + 3];
    assert(group.min[j] <= p - margin && group.max[j] >= p + margin);
  }
}

// Test the maximum invariant drift over the entire integration, before any
// viewing rotation or Float32 packing. A single final core position is a poor
// convergence observable: fixing its azimuth projects out orbital phase error,
// and radial errors can cancel near a turning point. The massive Hamiltonian
// residual has no such viewing dependence and has a known exact value of -1.
const coarse = generate({samples: 16, step: 0.5});
const medium = generate({samples: 16, step: 0.25});
const fine = generate({samples: 16, step: 0.125});
const distance = (a, b) => Math.hypot(...a.star.position.map((v, i) => v - b.star.position[i]));
const coarsePositionDifference = distance(coarse, medium);
const finePositionDifference = distance(medium, fine);
assert(coarsePositionDifference < 1e-5);
assert(finePositionDifference < 5e-7 && finePositionDifference < coarsePositionDifference);
const invariantErrors = [coarse, medium, fine].map(result => result.diagnostics.maxMassShellError);
const ratios = [invariantErrors[0] / invariantErrors[1], invariantErrors[1] / invariantErrors[2]];
for (const ratio of ratios) {
  assert(ratio > 12 && ratio < 20, `Expected fourth-order invariant convergence; ratio ${ratio}.`);
}

// The later fallback snapshot must remain a continuous, resolved stream. A
// ballistic self-crossing would imply shocks that this model does not include.
const path = Array.from({length: 64}, (_, i) => [s.points[i * 4], s.points[i * 4 + 2]]);
const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
let previousDirection;
for (let i = 1; i < path.length; i++) {
  const delta = path[i].map((v, j) => v - path[i - 1][j]);
  const separation = Math.hypot(...delta);
  assert(separation > 0 && separation < 0.7, 'Neighboring debris samples must resolve the stream.');
  const direction = delta.map(v => v / separation);
  if (previousDirection) {
    const cosine = direction[0] * previousDirection[0] + direction[1] * previousDirection[1];
    assert(cosine > Math.cos(0.13), 'A large local kink would not resolve the geodesic bundle.');
  }
  previousDirection = direction;
  for (let j = i + 2; j < path.length; j++) {
    const first = orientation(path[i - 1], path[i], path[j - 1]) * orientation(path[i - 1], path[i], path[j]);
    const second = orientation(path[j - 1], path[j], path[i - 1]) * orientation(path[j - 1], path[j], path[i]);
    assert(!(first < 0 && second < 0), 'The selected ballistic centerline must not self-intersect.');
  }
}

// A different viewing azimuth is a Kerr symmetry, not an arbitrary warp.
const rotated = generate({angle: -0.36 + Math.PI / 2});
for (let i = 0; i < s.points.length; i += 4) {
  assert(Math.abs(rotated.points[i] + s.points[i + 2]) < 2e-6);
  assert(Math.abs(rotated.points[i + 2] - s.points[i]) < 2e-6);
}
for (const options of [{step: 0}, {step: NaN}, {samples: Infinity}, {spin: 0.5}]) {
  assert.throws(() => generate(options), RangeError);
}
console.log(`Tidal bundle passed: massive normalization, Killing invariants, RK4 invariant convergence (${ratios.map(v => v.toFixed(2)).join(', ')}), packing, bounds, disk overlap, and continuous nonintersecting stream.`);
console.log(`Mass-shell errors: ${invariantErrors.map(v => v.toExponential(3)).join(', ')}; position differences: ${coarsePositionDifference.toExponential(3)}, ${finePositionDifference.toExponential(3)} Rs.`);
