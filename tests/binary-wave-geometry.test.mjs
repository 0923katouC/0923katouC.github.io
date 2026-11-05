import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFrame, directionalStrain, projectPoint } from '../projects/pond/binary-waves/geometry.mjs';
import { equatorialStrain, polarizations, sourceTensor, STRAIN_UNIT } from '../projects/pond/binary-waves/model.mjs';

const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-13, `${actual} differs from ${expected}`
);

test('a circular orbit flattens by cos(i) while +L tilts up by sin(i)', () => {
  for (const i of [0, 40, 90]) {
    const camera = cameraFrame(i), radians = i*Math.PI/180;
    const [lx, ly, lz] = projectPoint(camera, 0, 0, 1);
    close(lx, 0); close(ly, Math.sin(radians)); close(lz, Math.cos(radians));
    const [horizontal, vertical] = projectPoint(camera, 1, 0, 0);
    close(horizontal, 0); close(vertical, -Math.cos(radians));
    assert.deepEqual(projectPoint(camera, 0, 1, 0), [1, 0, 0]);
    const lineOfSight = projectPoint(camera, Math.sin(radians), 0, Math.cos(radians));
    lineOfSight.forEach((value, k) => close(value, [0, 0, 1][k]));
  }
  assert.equal(projectPoint(cameraFrame(90), 1, 2, 0)[1], 0);
});

test('angular strains match the existing observer for every azimuth after rotating the source', () => {
  const [x, y, vx, vy] = [16, 12, -.072, .211], nu = .21;
  const source = sourceTensor([x, y, vx, vy]);
  for (const theta of [0, .52, Math.PI/2, 2.3, Math.PI]) {
    for (const phi of [0, .45, 1.7, 2.9]) {
      const c = Math.cos(phi), s = Math.sin(phi);
      const rotated = sourceTensor([c*x+s*y, -s*x+c*y, c*vx+s*vy, -s*vx+c*vy]);
      const expected = polarizations(...rotated, nu, Math.cos(theta));
      const actual = directionalStrain(...source, nu, Math.cos(theta), c, s);
      actual.forEach((v,k) => close(v, expected[k]/STRAIN_UNIT));
    }
  }
});

test('the equatorial plus matches the planar map after exchanging the polarization axes', () => {
  const source = [-.044, .021, -.013], nu = .24;
  for (const phi of [0, .15, .94, 2.1, 3.7]) {
    const [plus, cross] = directionalStrain(...source, nu, 0, Math.cos(phi), Math.sin(phi));
    close(cross, 0);
    close(plus, -equatorialStrain(...source, nu, Math.cos(2*phi), Math.sin(2*phi)));
  }
});

test('at both poles, strain magnitude is independent of the chosen meridian', () => {
  const source = [-.034, .025, .018], nu = .18;
  for (const polarCosine of [1, -1]) {
    const reference = directionalStrain(...source, nu, polarCosine, 1, 0);
    const expectedMagnitude = Math.hypot(...reference);
    for (const phi of [.3, .95, 1.6, 3.9]) {
      const strain = directionalStrain(...source, nu, polarCosine, Math.cos(phi), Math.sin(phi));
      close(Math.hypot(...strain), expectedMagnitude);
    }
  }
});
