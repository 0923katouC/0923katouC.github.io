import test from 'node:test';
import assert from 'node:assert/strict';
import { elements, potential, stateAtTime, windowFor, sampleOrbit } from '../projects/pond/orbits/model.mjs';

function close(a, b, tolerance = 1e-9) {
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), a + ' ≠ ' + b);
}

test('circular boundary, forbidden region and conic classification', () => {
  for (const L of [0.25, 0.6, 1, 2.5]) {
    const E = -1 / (2 * L * L), o = elements(E, L);
    assert.equal(o.kind, 'circle'); close(o.rp, L * L);
    close(potential(o.rp, L), E);
    assert.equal(elements(E - 1e-5, L).valid, false);
  }
  assert.equal(elements(-0.35, 1).kind, 'ellipse');
  assert.equal(elements(0, 1).kind, 'parabola');
  assert.equal(elements(0.1, 1).kind, 'hyperbola');
  for (const [E, L] of [[0, 0], [0, -1], [NaN, 1], [0, Infinity]]) assert.equal(elements(E, L).valid, false);
});

test('energy, angular momentum and radial equation across the entire UI domain', () => {
  for (let E = -1.5; E <= 1.00001; E += 0.1) {
    for (let L = 0.25; L <= 2.50001; L += 0.15) {
      const o = elements(E, L); if (!o.valid) continue;
      const w = windowFor(o);
      for (let i = -10; i <= 10; i++) {
        const s = stateAtTime(o, w.halfTime * i / 10);
        close((s.vx ** 2 + s.vy ** 2) / 2 - 1 / s.r, E);
        close(s.x * s.vy - s.y * s.vx, L);
        close(0.5 * s.vr ** 2 + potential(s.r, L), E);
        assert.ok(s.r >= o.rp - 1e-9);
      }
    }
  }
});

test('circle agrees with independent uniform circular motion', () => {
  const o = elements(-0.5, 1);
  for (const t of [-20, -Math.PI, -1, 0, 0.5, 2, 20]) {
    const s = stateAtTime(o, t);
    close(s.x, Math.cos(t)); close(s.y, Math.sin(t));
    close(s.vx, -Math.sin(t)); close(s.vy, Math.cos(t));
  }
});

test('ellipse periapsis, apoapsis, closure and Kepler third law', () => {
  const o = elements(-0.2, 0.8);
  close(o.period ** 2, 4 * Math.PI ** 2 * o.a ** 3);
  close(stateAtTime(o, 0).r, o.rp);
  close(stateAtTime(o, o.period / 2).r, o.ra);
  const s = stateAtTime(o, o.period);
  close(s.x, o.rp); close(s.y, 0);
  for (const L of [0.3, 0.8, 1.2]) close(elements(-0.2, L).a, o.a);
});

test('exact parabolic motion agrees with Barker equation and is continuous at E=0', () => {
  const L = 1.2, o = elements(0, L);
  for (const D of [-3, -1, 0, 0.5, 3]) {
    const t = L ** 3 / 2 * (D + D ** 3 / 3), s = stateAtTime(o, t);
    close(s.x, L ** 2 / 2 * (1 - D ** 2)); close(s.y, L ** 2 * D);
    for (const E of [-1e-12, 1e-12]) {
      const near = stateAtTime(elements(E, L), t);
      close(near.x, s.x, 2e-9); close(near.y, s.y, 2e-9);
    }
  }
});

test('propagated velocity equals the position derivative and acceleration is inverse square', () => {
  for (const E of [-0.35, 0, 0.3]) {
    const o = elements(E, 1), t = 0.7, h = 1e-5;
    const a = stateAtTime(o, t - h), s = stateAtTime(o, t), b = stateAtTime(o, t + h);
    close((b.x - a.x) / (2 * h), s.vx, 1e-8);
    close((b.y - a.y) / (2 * h), s.vy, 1e-8);
    close((b.vx - a.vx) / (2 * h), -s.x / s.r ** 3, 1e-8);
    close((b.vy - a.vy) / (2 * h), -s.y / s.r ** 3, 1e-8);
  }
});

test('finite windows, near-parabolic windows and analytic path match the time solution', () => {
  for (const E of [-0.5, -0.001, -1e-12, 0, 1e-12, 1]) {
    for (const L of [0.25, 1, 2.5]) {
      const o = elements(E, L); if (!o.valid) continue;
      const w = windowFor(o), s = stateAtTime(o, w.halfTime);
      close(s.r, w.radius, 1e-8);
      assert.ok(Number.isFinite(w.halfTime));
      const path = sampleOrbit(o), end = path.at(-1);
      close(s.x, end.x, 1e-8); close(s.y, end.y, 1e-8);
      for (const p of path) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        close(0.5 * p.vr ** 2 + potential(p.r, L), E, 1e-8);
      }
    }
  }
});
