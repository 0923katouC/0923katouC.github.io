import { componentPositions, polarizations, REF_PERIOD, sampleAt, SECONDS, SEMIMAJOR, symmetricRatio } from './model.mjs';
import { mapGeometry, paintField } from './field.mjs';

const GOLD = '#ffc299', BLUE = '#82d4e8', GRID = '#273644', MUTED = '#a1b3c3';
const MONO = '11px ui-monospace, Menlo, Consolas, monospace';

function surface(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(w*ratio)), height = Math.max(1, Math.round(h*ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width/Math.max(w,1), 0, 0, canvas.height/Math.max(h,1), 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = MONO;
  return { ctx, w, h };
}

function line(ctx, x, y, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
}

function disk(ctx, x, y, radius, color) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, 2*Math.PI);
  ctx.fillStyle = '#091019'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
}

export function wavePlot(canvas) {
  const raster = document.createElement('canvas');
  const rasterContext = raster.getContext('2d');
  let map, image;
  return (orbit, time) => {
    const {ctx, w, h} = surface(canvas);
    if (!w || !h) return;
    const bw = Math.min(640, Math.round(w)), bh = Math.max(1, Math.round(h*bw/w));
    if (!map || bw !== map.width || bh !== map.height) {
      raster.width = bw; raster.height = bh;
      map = mapGeometry(bw, bh); image = rasterContext.createImageData(bw, bh);
    }
    paintField(map, orbit, time, image.data);
    rasterContext.putImageData(image, 0, 0);
    ctx.drawImage(raster, 0, 0, w, h);
    const cx = w/2, cy = h/2, core = map.core*w/bw, extent = map.extent*w/bw;
    ctx.save(); ctx.translate(cx,cy);
    ctx.strokeStyle = 'rgba(233,239,244,.20)'; ctx.lineWidth = .65;
    ctx.setLineDash([2,5]); line(ctx,-cx,0,cx,0); line(ctx,0,-cy,0,cy);
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(0,0,core+(extent-core)*i/3,0,2*Math.PI); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.strokeStyle = '#8eaaa8'; ctx.beginPath(); ctx.arc(0,0,core,0,2*Math.PI); ctx.stroke();
    const state = sampleAt(orbit,time), bodies = componentPositions(state,orbit.q);
    const scale = core*.78/(SEMIMAJOR*(1+orbit.e)/(1+orbit.q));
    for (const [k, color] of [GOLD, BLUE].entries()) {
      ctx.beginPath();
      for (let j = 0; j <= 64; j++) {
        sampleAt(orbit,time-(1-j/64)*REF_PERIOD,state);
        const previous = componentPositions(state,orbit.q);
        const x = previous[2*k]*scale, y = -previous[2*k+1]*scale;
        if (j === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.globalAlpha = .5; ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#586675'; line(ctx,bodies[0]*scale,-bodies[1]*scale,bodies[2]*scale,-bodies[3]*scale);
    disk(ctx,bodies[0]*scale,-bodies[1]*scale,3.8,GOLD);
    disk(ctx,bodies[2]*scale,-bodies[3]*scale,2.3+1.5*orbit.q,BLUE);
    ctx.restore();
    const ruler = (extent-core)/3;
    ctx.fillStyle = 'rgba(8,15,23,.78)'; ctx.fillRect(9,h-34,ruler+16,27);
    ctx.fillStyle = '#dce8ec'; ctx.textAlign = 'center'; ctx.fillText('λ₀',17+ruler/2,h-20);
    ctx.strokeStyle = '#c2d2d8'; ctx.lineWidth = 1; line(ctx,17,h-13,17+ruler,h-13);
    line(ctx,17,h-16,17,h-11); line(ctx,17+ruler,h-16,17+ruler,h-11);
  };
}

export function drawOrbit(canvas, orbit, time) {
  const {ctx,w,h} = surface(canvas), cx = w/2, cy = h/2;
  const scale = .40*Math.min(w,h)/(SEMIMAJOR*(1+orbit.e)/(1+orbit.q));
  const state = new Float64Array(7), trails = [[],[]];
  const span = 1.45*REF_PERIOD, samples = 220;
  for (let i = 0; i <= samples; i++) {
    sampleAt(orbit,time - span*(1-i/samples),state);
    const body = componentPositions(state,orbit.q);
    for (let k = 0; k < 2; k++) trails[k].push([cx+body[2*k]*scale, cy-body[2*k+1]*scale]);
  }
  ctx.strokeStyle = GRID; ctx.lineWidth = 1;
  line(ctx,15,cy,w-15,cy); line(ctx,cx,13,cx,h-13);
  for (const [k,color] of [GOLD,BLUE].entries()) {
    const points = trails[k]; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    for (let part = 0; part < 5; part++) {
      const start = part*samples/5, end = (part+1)*samples/5;
      ctx.globalAlpha = .20 + .18*part; ctx.beginPath(); ctx.moveTo(...points[start]);
      for (let j = start+1; j <= end; j++) ctx.lineTo(...points[j]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; disk(ctx,...points[samples],k === 0 ? 5.8 : 3.5+2.3*orbit.q,color);
  }
  ctx.strokeStyle = MUTED; ctx.lineWidth = 1.3;
  const y = h-20; line(ctx,15,y,15+10*scale,y); line(ctx,15,y-3,15,y+3);line(ctx,15+10*scale,y-3,15+10*scale,y+3);
  ctx.fillStyle = MUTED; ctx.fillText('10 GM/c²',15,y-6);
}

export function drawSignal(canvas, orbit, time, inclination, english) {
  const {ctx,w,h} = surface(canvas);
  const left = 36, right = w-15, top = 23, bottom = h-32, middle = (top + bottom)/2;
  const span = 1.8*REF_PERIOD, n = symmetricRatio(orbit.q);
  const cosI = inclination === 90 ? 0 : Math.cos(inclination*Math.PI/180);
  const state = new Float64Array(7), count = Math.max(160,Math.round(right-left));
  // Constant +/-3 x 10^-21 across settings: relative changes in amplitude remain visible.
  const signalY = strain => middle - strain*1e21*(bottom-top)/6;
  ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (const level of [-3,0,3]) {
    const y = signalY(level*1e-21); ctx.strokeStyle = level === 0 ? '#536374' : GRID;
    line(ctx,left,y,right,y); ctx.fillStyle = MUTED; ctx.fillText(String(level),left-7,y+4);
  }
  ctx.fillStyle = MUTED;ctx.textAlign = 'left';ctx.fillText('h  ×10⁻²¹',left,14);
  for (let i = 0; i <= 3; i++) {
    const x = left+(right-left)*i/3, relative = -span*(1-i/3)*SECONDS;
    ctx.strokeStyle = GRID;line(ctx,x,top,x,bottom);
    ctx.fillStyle = MUTED;ctx.textAlign = i===0 ? 'left' : i===3 ? 'right' : 'center';
    ctx.fillText(relative.toFixed(2)+' s',x,bottom+17);
  }
  const traces = [new Path2D(),new Path2D()];
  for (let i = 0; i <= count; i++) {
    const f = i/count; sampleAt(orbit,time-span*(1-f),state);
    const strain = polarizations(state[4],state[5],state[6],n,cosI);
    for (let k=0; k<2; k++) {
      const x=left+(right-left)*f,y=signalY(strain[k]);
      if (i === 0) traces[k].moveTo(x,y); else traces[k].lineTo(x,y);
    }
  }
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.9; ctx.stroke(traces[0]);
  ctx.strokeStyle = BLUE; ctx.lineWidth = 1.6; ctx.setLineDash([5,3]); ctx.stroke(traces[1]); ctx.setLineDash([]);
  ctx.textAlign='right';ctx.fillStyle=MUTED;ctx.fillText(english ? 'now' : '当前',right,14);
}
