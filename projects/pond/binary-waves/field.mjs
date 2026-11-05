import { equatorialStrain, REF_WAVELENGTH, sampleAt, symmetricRatio } from './model.mjs';

const BINS = 512;
const LEVELS = 1024;
const LIMIT = 0.05;
const CORE_COLOR = [9, 16, 25];
const palette = new Uint8ClampedArray((LEVELS + 1)*3);
// A single signed scale for every mass ratio, distance and animation frame.
for (let i = 0; i <= LEVELS; i++) {
  const value = (2*i/LEVELS - 1)*LIMIT;
  const t = Math.asinh(Math.abs(value)/0.003)/Math.asinh(LIMIT/0.003);
  const stops = value < 0 ? [[14, 24, 38], [28, 83, 116], [109, 218, 227]]
    : [[14, 24, 38], [132, 65, 57], [255, 204, 145]];
  const k = t < .56 ? 0 : 1, blend = k === 0 ? t/.56 : (t - .56)/.44;
  for (let c = 0; c < 3; c++) palette[3*i + c] = stops[k][c]*(1-blend) + stops[k+1][c]*blend;
}

export function mapGeometry(width, height) {
  const cx = width/2, cy = height/2, core = Math.min(width, height)*.14;
  const extent = Math.hypot(cx, cy);
  const bin = new Int16Array(width*height);
  const cos2 = new Float32Array(bin.length), sin2 = new Float32Array(bin.length);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const dx = x + .5 - cx, dy = cy - y - .5, radius2 = dx*dx + dy*dy;
      const fraction = (Math.sqrt(radius2) - core)/(extent - core);
      if (fraction < 0) { bin[i] = -1; continue; }
      bin[i] = Math.min(BINS - 1, Math.round(fraction*(BINS-1)));
      cos2[i] = (dx*dx - dy*dy)/radius2;
      sin2[i] = 2*dx*dy/radius2;
    }
  }
  return { width, height, bin, cos2, sin2, core, extent, sources: new Float64Array(BINS*3) };
}

export function paintField(map, orbit, time, pixels) {
  const sample = new Float64Array(7), n = symmetricRatio(orbit.q);
  for (let j = 0; j < BINS; j++) {
    const radialOffset = 3*j/(BINS - 1); // extent spans R = (4 to 7) lambda_0
    sampleAt(orbit, time - radialOffset*REF_WAVELENGTH, sample);
    const falloff = 4/(4 + radialOffset); // R_inner / R
    for (let k = 0; k < 3; k++) map.sources[3*j+k] = sample[4+k]*falloff;
  }
  for (let i = 0; i < map.bin.length; i++) {
    const j = 3*map.bin[i], pixel = 4*i;
    if (j < 0) {
      pixels[pixel] = CORE_COLOR[0]; pixels[pixel+1] = CORE_COLOR[1]; pixels[pixel+2] = CORE_COLOR[2];
    } else {
      const strain = equatorialStrain(map.sources[j], map.sources[j+1], map.sources[j+2], n, map.cos2[i], map.sin2[i]);
      const level = Math.max(0, Math.min(LEVELS, Math.round((strain/LIMIT + 1)*LEVELS/2)))*3;
      pixels[pixel] = palette[level]; pixels[pixel+1] = palette[level+1]; pixels[pixel+2] = palette[level+2];
    }
    pixels[pixel+3] = 255;
  }
}
