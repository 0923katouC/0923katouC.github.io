import { componentPositions, polarizations, REF_PERIOD, sampleAt, SECONDS, SEMIMAJOR, symmetricRatio } from './model.mjs';
import { cameraFrame, projectPoint } from './geometry.mjs';

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

export function drawOrbit(canvas, orbit, time, inclination) {
  const {ctx,w,h} = surface(canvas);
  if (!w || !h) return;
  const cx = w/2, cy = h/2, camera = cameraFrame(inclination);
  const extent = SEMIMAJOR*(1+orbit.e)/(1+orbit.q);
  const scale = .4*Math.min(w,h)/extent;
  function project(x, y) {
    const [horizontal, vertical, depth] = projectPoint(camera,x,y,0);
    return [cx+horizontal*scale, cy-vertical*scale, depth];
  }
  // A circular coordinate grid in the orbital plane makes the foreshortening visible.
  ctx.lineWidth = 1; ctx.strokeStyle = GRID;
  for (let r=10; r<=extent*1.1; r+=10) {
    ctx.beginPath();
    for (let j=0; j<=96; j++) {
      const phi = 2*Math.PI*j/96;
      const [x,y] = project(r*Math.cos(phi),r*Math.sin(phi));
      if (j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  const state = new Float64Array(7), trails = [[],[]], samples = 220;
  for (let i=0; i<=samples; i++) {
    sampleAt(orbit,time-1.45*REF_PERIOD*(1-i/samples),state);
    const body = componentPositions(state,orbit.q);
    trails[0].push(project(body[0],body[1]));
    trails[1].push(project(body[2],body[3]));
  }
  const colors = [GOLD,BLUE];
  for (const [k,points] of trails.entries()) {
    ctx.strokeStyle = colors[k]; ctx.lineWidth = 1.7;
    for (let part=0; part<5; part++) {
      const first=part*samples/5, last=(part+1)*samples/5;
      ctx.globalAlpha = .22+.19*part;
      ctx.beginPath(); ctx.moveTo(points[first][0],points[first][1]);
      for (let j=first+1; j<=last; j++) ctx.lineTo(points[j][0],points[j][1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const markers = trails.map((trail,k)=>({k, point:trail[samples]}));
  markers.sort((a,b)=>a.point[2]-b.point[2]);
  for (const {k,point:[x,y]} of markers) {
    disk(ctx,x,y,k===0 ? 5.8 : 3.5+2.3*orbit.q,colors[k]);
  }
  ctx.strokeStyle = MUTED; ctx.lineWidth = 1.3;
  const y=h-20;
  line(ctx,15,y,15+10*scale,y);
  line(ctx,15,y-3,15,y+3); line(ctx,15+10*scale,y-3,15+10*scale,y+3);
  ctx.fillStyle=MUTED; ctx.textAlign='left'; ctx.fillText('10 GM/c²',15,y-6);
}

export function drawSignal(canvas, orbit, time, inclination, english) {
  const {ctx,w,h} = surface(canvas);
  const left = 36, right = w-15, top = 23, bottom = h-32, middle = (top + bottom)/2;
  const span = 1.8*REF_PERIOD, n = symmetricRatio(orbit.q);
  const { cosI } = cameraFrame(inclination);
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
