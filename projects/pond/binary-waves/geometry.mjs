// The binary orbits in the xy plane with positive angular momentum along z.
// Inclination is the angle from +z to the source-to-observer direction N.
export function cameraFrame(inclinationDegrees) {
  const angle = inclinationDegrees * Math.PI / 180;
  return {
    sinI: Math.sin(angle),
    cosI: inclinationDegrees === 90 ? 0 : Math.cos(angle),
  };
}

// Right = +y, up = (-cos i, 0, sin i), depth toward observer = (sin i, 0, cos i).
// These screen axes keep projected angular momentum up and the edge-on orbit horizontal.
export function projectPoint({ sinI, cosI }, x, y, z) {
  return [y, -cosI*x + sinI*z, sinI*x + cosI*z];
}

// For a ray at polar angle theta to +z and azimuth phi from +x, use local sky axes
// p = (cos theta cos phi, cos theta sin phi, -sin theta), q = (-sin phi, cos phi, 0).
// At either pole, phi specifies the limiting meridian and therefore the polarization basis.
// Only xx, yy, xy of the planar quadrupole contribute. Dropping its trace is exact
// in 2(pSp-qSq) and 4pSq, including away from the equator. Coefficients are ordered
// [+xx,+yy,+xy, crossXX,crossYY,crossXY], ready to cache for a mesh vertex.
export function polarizationWeights(cosTheta, cosPhi, sinPhi) {
  const px = cosTheta*cosPhi, py = cosTheta*sinPhi;
  const qx = -sinPhi, qy = cosPhi;
  return [
    2*(px*px - qx*qx), 2*(py*py - qy*qy), 4*(px*py - qx*qy),
    4*px*qx, 4*py*qy, 4*(px*qy + py*qx),
  ];
}

// Output units R h/(GM/c²); multiplying by GM/(R c²) gives the observed strain.
export function directionalStrain(xx, yy, xy, nu, cosTheta, cosPhi, sinPhi) {
  const [ax, ay, axy, bx, by, bxy] = polarizationWeights(cosTheta, cosPhi, sinPhi);
  return [nu*(ax*xx + ay*yy + axy*xy), nu*(bx*xx + by*yy + bxy*xy)];
}
