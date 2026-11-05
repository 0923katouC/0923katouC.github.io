// The field lives on two intersecting annuli in source coordinates. For each
// image pixel cast a perspective ray, keep its nearest surface, and cache that
// surface's radius and polarization projection until the camera moves.
import { componentPositions, REF_PERIOD, REF_WAVELENGTH, sampleAt, SEMIMAJOR, symmetricRatio } from './model.mjs';
import { cameraFrame, polarizationWeights, projectPoint } from './geometry.mjs';

const FOCAL = 3.8;        // camera distance in display radii, including the compressed near zone
const MERIDIAN = 50*Math.PI/180;
const SIN_M = Math.sin(MERIDIAN), COS_M = Math.cos(MERIDIAN);
const INNER = .32;        // inner display radius maps to 4 reference wavelengths
const RADIAL_BINS = 480;
const LIMIT = .1, LEVELS = 2048;
const GOLD = '#ffc299', BLUE = '#82d4e8', AXIS = '#dcf0b2';
const palette = new Uint8ClampedArray(3*(LEVELS+1));
for (let j = 0; j <= LEVELS; j++) {
  const value = LIMIT*(2*j/LEVELS-1);
  const t = Math.asinh(Math.abs(value)/.003)/Math.asinh(LIMIT/.003);
  const stops = value < 0 ? [[20,34,48],[31,108,141],[148,237,238]]
    : [[20,34,48],[158,77,55],[255,216,159]];
  const part = t < .55 ? 0 : 1;
  const blend = part === 0 ? t/.55 : (t-.55)/.45;
  for (let c = 0; c < 3; c++) palette[3*j+c] = stops[part][c]*(1-blend) + stops[part+1][c]*blend;
}

export function shellSample(time, fraction) {
  return { emissionTime: time - 3*fraction*REF_WAVELENGTH, attenuation: 4/(4+3*fraction) };
}

function layout(w,h) {
  return { cx: w/2, cy: h/2, scale: Math.min(w*.455,h*.466) };
}

function onScreen(frame, box, x, y, z) {
  const [right, up, depth] = projectPoint(frame,x,y,z);
  const scale = box.scale*FOCAL/(FOCAL-depth);
  return [box.cx+scale*right, box.cy-scale*up, depth];
}

function rayHit(right, up, frame, polar) {
  const { sinI, cosI } = frame;
  // Perspective ray through (right,up) on the central image plane. Solve
  // either x sin(phi) - y cos(phi) = 0 or z = 0.
  const normal = polar ? sinI*SIN_M : cosI;
  if (normal < 1e-5) return null;
  const denominator = FOCAL*normal + (polar ? right*COS_M + up*cosI*SIN_M : -up*sinI);
  if (denominator <= 0) return null;
  const t = FOCAL*normal/denominator;
  const y = t*right;
  const x = FOCAL*sinI*(1-t) - t*up*cosI;
  const z = polar ? FOCAL*cosI*(1-t) + t*up*sinI : 0;
  const r = Math.hypot(x,y,z);
  if (r < INNER || r > 1) return null;
  // The open meridional sector reveals the orbital plane behind it.
  if (polar && y < 0 && z > 0 && z < -y/SIN_M) return null;
  return { x, y, z, r, t, polar };
}

function buildMap(w,h,frame) {
  const box = layout(w,h), count = w*h;
  const bins = new Int16Array(count).fill(-1);
  const weights = new Float32Array(count*3), grid = new Uint8Array(count);
  const surface = new Uint8Array(count), rim = new Uint8Array(count);
  const raster = document.createElement('canvas');
  raster.width = w; raster.height = h;
  const context = raster.getContext('2d');
  const image = context.createImageData(w,h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const right = (x+.5-box.cx)/box.scale, up = (box.cy-y-.5)/box.scale;
      const orbital = rayHit(right,up,frame,false), meridian = rayHit(right,up,frame,true);
      const hit = orbital && (!meridian || orbital.t < meridian.t) ? orbital : meridian;
      const px = 4*i;
      image.data[px+3] = 255;
      if (!hit) {
        // The neutral reference sphere marks the outer radius only.
        const radius = Math.hypot(right,up), limb = FOCAL/Math.sqrt(FOCAL*FOCAL-1);
        const edge = Math.max(0,1-Math.abs(radius-limb)*box.scale/1.2);
        const inside = radius < limb ? 1 : 0;
        image.data[px] = 10 + 4*inside + 45*edge;
        image.data[px+1] = 18 + 8*inside + 57*edge;
        image.data[px+2] = 28 + 11*inside + 66*edge;
        continue;
      }
      const fraction = (hit.r-INNER)/(1-INNER);
      const bin = Math.round(fraction*(RADIAL_BINS-1));
      bins[i] = bin;
      surface[i] = hit.polar ? 2 : 1;
      const distanceToRim = Math.min(1-hit.r,hit.r-INNER)*box.scale;
      const distanceToIntersection = Math.abs(hit.polar ? hit.z : hit.x*SIN_M-hit.y*COS_M)*box.scale;
      const edgeWidth = hit.polar ? 1.7 : 1.15;
      const outline = Math.max(0,1-distanceToRim/edgeWidth);
      const intersection = Math.max(0,1-distanceToIntersection/1.55);
      rim[i] = Math.round(184*Math.max(outline,intersection));
      const branch = hit.y >= 0 ? 1 : -1;
      const cosPhi = hit.polar ? branch*COS_M : hit.x/hit.r;
      // The two poles use the limit in this particular meridian.
      const sinPhi = hit.polar ? branch*SIN_M : hit.y/hit.r;
      const projection = polarizationWeights(hit.z/hit.r,cosPhi,sinPhi);
      weights.set(projection.slice(0,3),i*3);
      const cell = fraction*3;
      const radialLine = Math.abs(cell-Math.round(cell)) * (1-INNER)*box.scale/3;
      const angle = hit.polar ? Math.atan2(hit.z,hit.y/SIN_M) : Math.atan2(hit.x,hit.y);
      const angularLine = Math.abs(Math.sin(angle*4))*hit.r*box.scale/4;
      const edge = Math.min(radialLine,angularLine);
      grid[i] = 36*Math.max(0,1-edge/.95);
    }
  }
  // Trace only the visible foreground boundary. This separates the two
  // differently oriented surfaces even where their strains have the same sign.
  for (let y=1; y<h-1; y++) {
    for (let x=1; x<w-1; x++) {
      const i=y*w+x;
      if (!surface[i]) continue;
      if (surface[i]!==surface[i-1] || surface[i]!==surface[i+1] ||
          surface[i]!==surface[i-w] || surface[i]!==surface[i+w]) {
        rim[i]=Math.max(rim[i],surface[i]===2 ? 148 : 87);
      }
    }
  }
  return {raster,context,image,bins,grid,rim,weights,source: new Float64Array(RADIAL_BINS*3)};
}

function paintSections(map,orbit,time) {
  const state = new Float64Array(7), n = symmetricRatio(orbit.q), src = map.source;
  for (let i = 0; i < RADIAL_BINS; i++) {
    const {emissionTime,attenuation} = shellSample(time,i/(RADIAL_BINS-1));
    sampleAt(orbit,emissionTime,state);
    for (let k=0;k<3;k++) src[3*i+k] = state[4+k]*n*attenuation;
  }
  const pixels = map.image.data;
  for (let i=0; i<map.bins.length; i++) {
    const j = 3*map.bins[i];
    if (j < 0) continue;
    const k = 3*i;
    const signal = map.weights[k]*src[j] + map.weights[k+1]*src[j+1] + map.weights[k+2]*src[j+2];
    const level = Math.max(0,Math.min(LEVELS,Math.round((signal/LIMIT+1)*LEVELS/2)))*3;
    const px = 4*i, line = map.grid[i];
    const edge = map.rim[i]/255, fill = 1-edge;
    pixels[px] = (palette[level]+line)*fill + 194*edge;
    pixels[px+1] = (palette[level+1]+line)*fill + 213*edge;
    pixels[px+2] = (palette[level+2]+line)*fill + 220*edge;
  }
  map.context.putImageData(map.image,0,0);
}

function sourceOrbit(ctx,frame,box,orbit,time) {
  const {cx,cy,scale} = box, lens = scale*.285;
  ctx.beginPath();ctx.arc(cx,cy,lens,0,2*Math.PI);
  ctx.fillStyle = '#0b1520';ctx.fill();ctx.strokeStyle = '#637587';ctx.lineWidth = .85;ctx.stroke();
  const sourceScale = .242/(SEMIMAJOR*(1+orbit.e)/(1+orbit.q));
  const state = new Float64Array(7), paths = [[],[]], samples = 100;
  for (let j=0; j<=samples; j++) {
    sampleAt(orbit,time-(1-j/samples)*REF_PERIOD*1.16,state);
    const bodies = componentPositions(state,orbit.q);
    for (let k=0;k<2;k++) paths[k].push(onScreen(frame,box,bodies[k*2]*sourceScale,bodies[k*2+1]*sourceScale,0));
  }
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,lens-.5,0,2*Math.PI);ctx.clip();
  for (let k=0;k<2;k++) {
    ctx.strokeStyle = k===0 ? GOLD : BLUE;ctx.lineWidth = 1.5;
    for (let part=0;part<4;part++) {
      ctx.globalAlpha=.22+part*.18;
      const first = part*samples/4, last=(part+1)*samples/4;
      ctx.beginPath();ctx.moveTo(paths[k][first][0],paths[k][first][1]);
      for (let j=first+1;j<=last;j++) ctx.lineTo(paths[k][j][0],paths[k][j][1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
  const bodies=paths.map((p,k)=>({point:p[samples],color:k===0 ? GOLD : BLUE,
    radius:(k===0 ? 1 : Math.sqrt(orbit.q))*.1*lens+2})).sort((a,b)=>a.point[2]-b.point[2]);
  for (const {point:[x,y],radius,color} of bodies) {
    ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);
    ctx.shadowBlur=6;ctx.shadowColor=color;ctx.fillStyle='#070c12';ctx.fill();ctx.lineWidth=1.7;ctx.strokeStyle=color;ctx.stroke();
  }
  ctx.restore();
}

function drawAxis(ctx,frame,box,english) {
  const {cx,cy,scale}=box;
  const tip=onScreen(frame,box,0,0,.83);
  const tail=onScreen(frame,box,0,0,-.72);
  ctx.save();ctx.strokeStyle=AXIS;ctx.fillStyle=AXIS;
  const projected=cy-tip[1];
  if (projected<13) {
    // Dot in a ring denotes +L pointing out of the screen.
    ctx.beginPath();ctx.arc(cx,cy,5,0,2*Math.PI);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,1.7,0,2*Math.PI);ctx.fill();
  } else {
    ctx.setLineDash([3,5]);ctx.globalAlpha=.44;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...tail.slice(0,2));
    ctx.lineTo(cx,cy);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tip[0],tip[1]+2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(tip[0],tip[1]);ctx.lineTo(tip[0]-4,tip[1]+8);ctx.lineTo(tip[0]+4,tip[1]+8);ctx.closePath();ctx.fill();
  }
  const label=projected<13 ? (english ? 'L · toward you' : 'L · 指向你') : 'L';
  const tx=projected<13 ? cx+scale*.17 : tip[0]+7;
  const ty=projected<13 ? cy-13 : tip[1]+3;
  ctx.font='600 12px system-ui, sans-serif';ctx.textAlign='left';
  ctx.lineWidth=3.5;ctx.strokeStyle='#0a121c';ctx.strokeText(label,tx,ty);ctx.fillText(label,tx,ty);
  ctx.restore();
}

// A fixed xz side view makes the camera-to-axis angle measurable even though
// the viewing ray itself points out of the screen in the main image.
function inclinationDiagram(ctx,frame,box,english) {
  const ox=25, oy=Math.min(98,box.cy-8);
  const arrow=(dx,dy,length,color) => {
    const x=ox+length*dx, y=oy+length*dy;
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(x,y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x-6*dx+2.8*dy,y-6*dy-2.8*dx);
    ctx.lineTo(x-6*dx-2.8*dy,y-6*dy+2.8*dx);ctx.closePath();ctx.fill();
  };
  ctx.save();
  arrow(0,-1,54,AXIS);
  arrow(frame.sinI,-frame.cosI,41,'#b4deee');
  ctx.fillStyle=AXIS;ctx.font='600 11px system-ui, sans-serif';ctx.fillText('L',ox-13,oy-45);
  ctx.fillStyle='#c8eaf4';ctx.font='11px system-ui, sans-serif';
  ctx.fillText(english?'To observer':'指向观测者',ox+41*frame.sinI+5,oy-41*frame.cosI+1);
  ctx.lineWidth=.9;ctx.strokeStyle='#a9b8c3';ctx.beginPath();
  if (frame.cosI===0) {ctx.moveTo(ox,oy-10);ctx.lineTo(ox+10,oy-10);ctx.lineTo(ox+10,oy);}
  else if (frame.sinI>0) ctx.arc(ox,oy,15,-Math.PI/2,Math.atan2(-frame.cosI,frame.sinI));
  ctx.stroke();ctx.beginPath();ctx.arc(ox,oy,2.5,0,2*Math.PI);ctx.fillStyle='#e0e8eb';ctx.fill();
  ctx.restore();
}

function annotations(ctx,frame,box,w,h,inc,english) {
  ctx.save();
  const compact = w < 500;
  ctx.font='12px system-ui, sans-serif';ctx.fillStyle='#ccdae0';
  ctx.fillText((english ? 'Inclination  ' : '观测倾角  ')+'i = '+inc+'°',13,21);
  if (w>=530 && h>=225 && w>1.62*h) inclinationDiagram(ctx,frame,box,english);
  // Place leaders at the visible outer rims (the orbits intersect along y).
  const namePlate=(polar,side,text)=>{
    const y = side*.8, span = .6;
    const end = polar ? onScreen(frame,box,y*COS_M,y*SIN_M,span) : onScreen(frame,box,span,y,0);
    const labelX = side<0 ? 13 : w-13;
    const labelY = side<0 ? h-16 : 23;
    ctx.strokeStyle='#8d9caa';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(end[0],end[1]);
    const bendX = side<0 ? Math.max(labelX+55,end[0]-14) : Math.min(labelX-55,end[0]+14);
    ctx.lineTo(bendX,end[1]);ctx.lineTo(labelX-side*4,labelY+(side<0?-10:6));ctx.stroke();
    ctx.textAlign=side<0?'left':'right';ctx.fillStyle='#d7e1e4';ctx.fillText(text,labelX,labelY);
  };
  if (!compact) {
    namePlate(false,-1,english?'Orbital plane · xy':'轨道面 · xy');
    namePlate(true,1,english?'Axial slice':'轴向剖面');
  } else {
    ctx.font='11px system-ui, sans-serif';ctx.textAlign='left';
    ctx.fillText(english?'xy · orbital':'xy · 轨道面',12,h-9);
    ctx.textAlign='right';ctx.fillText(english?'Axial slice':'轴向剖面',w-12,h-9);
  }
  ctx.restore();
}

export function spatialPlot(canvas) {
  const ctx=canvas.getContext('2d');
  let map, previousInclination;
  return (orbit,time,inclination,english)=>{
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if (!w || !h) return;
    const ratio=Math.min(window.devicePixelRatio || 1,2);
    const width=Math.round(w*ratio), height=Math.round(h*ratio);
    if (canvas.width!==width || canvas.height!==height) {canvas.width=width;canvas.height=height;}
    const frame=cameraFrame(inclination), box=layout(w,h);
    const rw=Math.min(700,Math.round(w)), rh=Math.max(1,Math.round(h*rw/w));
    if (!map || map.raster.width!==rw || map.raster.height!==rh || previousInclination!==inclination) {
      map=buildMap(rw,rh,frame);previousInclination=inclination;
    }
    paintSections(map,orbit,time);
    ctx.setTransform(width/w,0,0,height/h,0,0);
    ctx.drawImage(map.raster,0,0,w,h);
    sourceOrbit(ctx,frame,box,orbit,time);
    drawAxis(ctx,frame,box,english);
    annotations(ctx,frame,box,w,h,inclination,english);
  };
}
