// Nonspinning relative motion in standard harmonic coordinates, G = c = M = 1.
// Blanchet (2014), Eqs. (219)–(220), doi:10.12942/lrr-2014-2.
// Fix both coordinate gauge lengths r'1 = r'2 = GM/c², so log(r/r'0) = log(r).
export const SEMIMAJOR = 36;
export const STOP_RADIUS = 12;
export const REF_PERIOD = 2 * Math.PI * SEMIMAJOR ** 1.5;
export const REF_WAVELENGTH = REF_PERIOD / 2;
export const SOURCE_MASS = 60; // solar masses
export const SECONDS = SOURCE_MASS * 1.3271244e20 / 299792458 ** 3;
export const DISTANCE = 100; // megaparsecs
const distanceMetres = DISTANCE * 1e6 * 149597870700 * 648000 / Math.PI;
export const STRAIN_UNIT = SECONDS * 299792458 / distanceMetres;
export const DEFAULTS = { eccentricity: 0.4, massRatio: 0.65, inclination: 40 };
const PI2 = Math.PI ** 2;
const WIDTH = 7; // x, y, vx, vy, Sxx, Syy, Sxy

export const symmetricRatio = q => q / (1 + q) ** 2;

// Return the conservative A and B / rDot, which is regular at a turning point.
// u = 1/r, w = rDot², s = v² and n = symmetric mass ratio.
function conservative(u, w, s, n) {
  const nn = n*n, nnn = nn*n, logR = -Math.log(u);
  const a1 = -1.5*n*w + (1 + 3*n)*s - (4 + 2*n)*u;
  const b1 = -4 + 2*n;

  const a2 = (15*n - 45*nn)/8*w*w + (-4.5*n + 6*nn)*w*s
    + (3*n - 4*nn)*s*s + u*((-2 - 25*n - 2*nn)*w + (-6.5*n + 2*nn)*s)
    + u*u*(9 + 87*n/4);
  const b2 = (4.5*n + 3*nn)*w - (7.5*n + 2*nn)*s + u*(2 + 41*n/2 + 4*nn);

  const a3 = (-35*n + 175*nn - 175*nnn)/16*w**3
    + (15*n/2 - 135*nn/4 + 255*nnn/8)*w*w*s
    + (-15*n/2 + 237*nn/8 - 45*nnn/2)*w*s*s
    + (11*n/4 - 49*nn/4 + 13*nnn)*s**3
    + u*((79*n - 69*nn/2 - 30*nnn)*w*w + (-121*n + 16*nn + 20*nnn)*w*s
      + (75*n/4 + 8*nn - 10*nnn)*s*s)
    + u*u*((1 + 32573*n/168 + 11*nn/8 - 7*nnn + 615*n*PI2/64 - 110*n*logR)*w
      + (-26987*n/840 + nnn - 123*n*PI2/64 + 22*n*logR)*s)
    + u**3*(-16 - 437*n/4 - 71*nn/2 + 41*n*PI2/16);
  const b3 = (-45*n/8 + 15*nn + 15*nnn/4)*w*w
    + (12*n - 111*nn/4 - 12*nnn)*w*s + (-65*n/8 + 19*nn + 6*nnn)*s*s
    + u*((329*n/6 + 59*nn/2 + 18*nnn)*w + (-15*n - 27*nn - 10*nnn)*s)
    + u*u*(-4 - 18169*n/840 + 25*nn + 8*nnn - 123*n*PI2/32 + 44*n*logR);
  return [a1 + a2 + a3, b1 + b2 + b3];
}

export function acceleration(state, n, radiating = true) {
  const [x, y, vx, vy] = state;
  const u = 1 / Math.hypot(x, y), radial = (x*vx + y*vy)*u;
  const w = radial*radial, s = vx*vx + vy*vy;
  const [aCons, bCons] = conservative(u, w, s, n);
  let a = 1 + aCons, b = radial*bCons;
  if (radiating) {
    const a25 = -radial*n*u*(24*s/5 + 136*u/15);
    const b25 = n*u*(8*s/5 + 24*u/5);
    const a35 = radial*n*u*((366/35 + 12*n)*s*s - (114 + 12*n)*s*w + 112*w*w
      + u*((692/35 - 724*n/15)*s + (294/5 + 376*n/5)*w)
      + u*u*(3956/35 + 184*n/5));
    const b35 = n*u*((-626/35 - 12*n/5)*s*s + (678/5 + 12*n/5)*s*w - 120*w*w
      + u*((164/21 + 148*n/5)*s + (-82/3 - 848*n/15)*w)
      + u*u*(-1060/21 - 104*n/5));
    a += a25 + a35;
    b += b25 + b35;
  }
  const factor = -u*u;
  return [factor*(a*x*u + b*vx), factor*(a*y*u + b*vy)];
}

// Same fourth-order integrator for the initial turning points and time evolution.
function rk4(derivative, value, at, step) {
  const shift = (slope, h) => value.map((v, i) => v + h*slope[i]);
  const k1 = derivative(at, value);
  const k2 = derivative(at + step/2, shift(k1, step/2));
  const k3 = derivative(at + step/2, shift(k2, step/2));
  const k4 = derivative(at + step, shift(k3, step));
  return value.map((v, i) => v + step/6*(k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
}

function bisect(fn, low, high) {
  const lowSign = Math.sign(fn(low));
  if (Math.sign(fn(high)) === lowSign) throw Error('Initial orbit is outside the supported bracket.');
  for (let i = 0; i < 40; i++) {
    const mid = (high + low)/2;
    if (Math.sign(fn(mid)) === lowSign) low = mid;
    else high = mid;
  }
  return (low + high)/2;
}

export function initialState(e, q) {
  const n = symmetricRatio(q), rp = SEMIMAJOR*(1 - e), ra = SEMIMAJOR*(1 + e);
  const circular = bisect(speed => speed*speed - (1 + conservative(1/rp, 0, speed*speed, n)[0])/rp,
    0, 1.5/Math.sqrt(rp));
  if (e === 0) {
    // Quasi-circular inward drift, Eq. (227a), through dissipative 3.5PN order.
    const drift = -64*n/(5*rp**3)*(1 - (1751/336 + 7*n/4)/rp);
    return [rp, 0, drift, circular];
  }
  // Along the conservative orbit let w = rDot², L = r² phiDot.
  // dw/dr = 2 rDDot, dL/dr = -B L/(r² rDot). Neither equation divides by zero.
  function radialDerivative(r, [w, L]) {
    const u = 1/r, tangential = L*u;
    const [a, b] = conservative(u, w, w + tangential*tangential, n);
    return [2*(tangential*tangential*u - u*u*(1 + a + b*w)), -u*u*b*L];
  }
  const step = (ra - rp)/128;
  const residual = speed => {
    let pair = [0, rp*speed];
    for (let i = 0; i < 128; i++) pair = rk4(radialDerivative, pair, rp + i*step, step);
    return pair[0];
  };
  return [rp, 0, 0, bisect(residual, circular, 1.6*circular)];
}

export function orbitStep(state, dt, n, radiating = true) {
  return rk4((_, value) => [value[2], value[3], ...acceleration(value, n, radiating)], state, 0, dt);
}

// Center-of-mass placement through 3PN, Eqs. (216)–(218). Both positions
// receive the same translation. Their difference is the full 3.5PN relative orbit.
export function componentPositions(state, q) {
  const [x, y, vx, vy] = state, u = 1/Math.hypot(x, y);
  const dr = (x*vx + y*vy)*u, w = dr*dr, s = vx*vx + vy*vy;
  const X1 = 1/(1 + q), X2 = q/(1 + q), n = X1*X2, nn = n*n;
  const P = (s - u)/2 + (3/8 - 3*n/2)*s*s
    + u*((-1/8 + 3*n/4)*w + (19/8 + 3*n/2)*s) + u*u*(7/4 - n/2)
    + (5/16 - 11*n/4 + 6*nn)*s**3
    + u*((1/16 - 5*n/8 + 21*nn/16)*w*w + (-5/16 + 21*n/16 - 11*nn/2)*w*s
      + (53/16 - 7*n - 15*nn/2)*s*s)
    + u*u*((-7/3 + 73*n/8 + 4*nn)*w + (101/12 - 33*n/8 + 3*nn)*s)
    + u**3*(-14351/1260 + n/8 - nn/2 - 22*Math.log(u)/3);
  const Q = -7*dr/4 + 4*s/5 - 8*u/5
    + dr*((5/12 - 19*n/24)*w + (-15/8 + 21*n/4)*s + u*(-235/24 - 21*n/4));
  const delta = n*(X1 - X2);
  const dx = delta*(P*x + Q*vx), dy = delta*(P*y + Q*vy);
  return [X2*x + dx, X2*y + dy, -X1*x + dx, -X1*y + dy];
}

// Half the second derivative of the Newtonian mass quadrupole divided by mu,
// up to a trace which cancels in both transverse polarizations.
export function sourceTensor([x, y, vx, vy]) {
  const invR3 = 1/Math.hypot(x, y)**3;
  return [vx*vx - x*x*invR3, vy*vy - y*y*invR3, vx*vy - x*y*invR3];
}

export function polarizations(xx, yy, xy, n, cosI) {
  const scale = 2*STRAIN_UNIT*n;
  return [scale*(cosI*cosI*xx - yy), 2*scale*cosI*xy];
}

// Equal-time equatorial map: p = (-sin phi,cos phi,0), second sky axis = z.
// Returns R h+/(GM/c²); its color scale can therefore be shared by every mass ratio.
export function equatorialStrain(xx, yy, xy, n, cos2phi, sin2phi) {
  return n*(xx + yy + (yy - xx)*cos2phi - 2*xy*sin2phi);
}

export function makeOrbit(e, q, step = 2) {
  if (!(e >= 0 && e <= 0.65 && q >= 0.1 && q <= 1 && step >= 0.5 && step <= 4)) {
    throw RangeError('Unsupported binary parameters');
  }
  const n = symmetricRatio(q), start = initialState(e, q);
  const before = Math.ceil(2.5*REF_PERIOD/step);
  const after = Math.ceil(22*REF_PERIOD/step);
  const rows = new Float64Array((before + after + 1)*WIDTH);
  const save = (index, state) => {
    rows.set(state, index*WIDTH);
    rows.set(sourceTensor(state), index*WIDTH + 4);
  };
  let state = start;
  save(before, start);
  for (let i = before - 1; i >= 0; i--) {
    state = orbitStep(state, -step, n);
    save(i, state);
  }
  state = start;
  let end = after*step, stopped = false, count = before + after + 1;
  for (let i = 1; i <= after; i++) {
    const next = orbitStep(state, step, n);
    let crossing = step;
    let crossed = Math.hypot(next[0], next[1]) <= STOP_RADIUS;
    // A grazing pericenter can enter and leave the cutoff within one sample.
    if (!crossed && Math.hypot(next[0],next[1]) < STOP_RADIUS + .1
      && state[0]*state[2] + state[1]*state[3] < 0 && next[0]*next[2] + next[1]*next[3] > 0) {
      crossing = bisect(t => {
        const [x,y,vx,vy] = orbitStep(state,t,n);
        return x*vx + y*vy;
      },0,step);
      const [x,y] = orbitStep(state,crossing,n);
      crossed = Math.hypot(x,y) <= STOP_RADIUS;
    }
    if (crossed) {
      const h = bisect(t => {
        const [x, y] = orbitStep(state, t, n);
        return Math.hypot(x, y) - STOP_RADIUS;
      }, 0, crossing);
      save(before + i, orbitStep(state, h, n));
      end = (i - 1)*step + h;
      count = before + i + 1;
      stopped = true;
      break;
    }
    save(before + i, next);
    state = next;
  }
  return { rows: rows.subarray(0, count*WIDTH), before, step, end, stopped, q, e };
}

export function sampleAt(orbit, time, out = new Float64Array(WIDTH)) {
  const t = Math.max(-orbit.before*orbit.step, Math.min(orbit.end, time));
  const last = orbit.rows.length/WIDTH - 1;
  const first = Math.min(last - 1, Math.floor(t/orbit.step) + orbit.before);
  const leftTime = (first - orbit.before)*orbit.step;
  const rightTime = first + 1 === last ? orbit.end : leftTime + orbit.step;
  const mix = (t - leftTime)/(rightTime - leftTime), base = first*WIDTH;
  for (let k = 0; k < WIDTH; k++) out[k] = orbit.rows[base + k]*(1 - mix) + orbit.rows[base + WIDTH + k]*mix;
  return out;
}
