import { makeOrbit, sampleAt, SECONDS, SOURCE_MASS } from './model.mjs';
import { drawOrbit, drawSignal } from './plots.mjs?v=3d1';
import { spatialPlot } from './scene.mjs';

const byId = id => document.getElementById(id);
const fieldCanvas = byId('field');
const field = spatialPlot(fieldCanvas);
const orbitCanvas = byId('orbit'), signalCanvas = byId('signal');
const eccentricity = byId('eccentricity'), ratio = byId('mass-ratio'), inclination = byId('inclination');
const timeline = byId('time'), play = byId('play'), restart = byId('restart'), speed = byId('speed');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const english = () => document.documentElement.lang === 'en';
const tr = (zh, en) => english() ? en : zh;
let orbit, time = 0, playing = !reduced.matches, loading = true, failed = false;
let worker, debounce, frame = 0, lastFrame = 0, revision = 0;

function controls() {
  const e = Number(eccentricity.value), q = Number(ratio.value);
  byId('eccentricity-value').value = e.toFixed(2);
  byId('mass-ratio-value').value = q.toFixed(2);
  byId('inclination-value').value = inclination.value+'°';
  inclination.setAttribute('aria-valuetext', inclination.value+'°');
  byId('face-on').setAttribute('aria-pressed',String(inclination.value === '0'));
  byId('edge-on').setAttribute('aria-pressed',String(inclination.value === '90'));
  byId('masses').textContent = (SOURCE_MASS/(1+q)).toFixed(1)+' + '+(SOURCE_MASS*q/(1+q)).toFixed(1);
  byId('circular').setAttribute('aria-pressed',String(e === 0));
  byId('eccentric').setAttribute('aria-pressed',String(e === 0.65));
  for (const el of [play,restart,timeline]) el.disabled = loading || !orbit;
  play.textContent = playing && !loading ? tr('暂停','Pause') : tr('播放','Play');
  play.setAttribute('aria-pressed',String(playing && !loading));
  const status = byId('status');
  if (failed) status.textContent = tr('轨道计算失败，请重新调节双星参数。','Orbit calculation failed. Change a binary parameter to retry.');
  else if (loading) status.textContent = tr('正在计算轨道…','Calculating orbit…');
  else if (time >= orbit.end) status.textContent = orbit.stopped
    ? tr('已到达 12 GM/c² 的适用边界。','The separation has reached the 12 GM/c² cutoff.')
    : tr('已到达本次观测时段的终点。','The observation window has ended.');
  else status.textContent = '';
}

function draw() {
  if (!orbit || loading) return;
  const state = sampleAt(orbit,time), r = Math.hypot(state[0],state[1]);
  const angle = Number(inclination.value), en = english();
  field(orbit,time,angle,en);
  drawOrbit(orbitCanvas,orbit,time,angle,en);
  drawSignal(signalCanvas,orbit,time,angle,en);
  timeline.value = String(time/orbit.end);
  const clock = (time*SECONDS).toFixed(3)+' / '+(orbit.end*SECONDS).toFixed(3)+' s';
  byId('clock').value = clock;
  timeline.setAttribute('aria-valuetext',clock);
  byId('separation').textContent = r.toFixed(2)+' GM/c²';
  const frequency = (state[0]*state[3] - state[1]*state[2])/(r*r*2*Math.PI*SECONDS);
  byId('frequency').textContent = frequency.toFixed(2)+tr(' 赫兹',' Hz');
}

function stopFrames() {
  cancelAnimationFrame(frame);
  frame = 0; lastFrame = 0;
}
function schedule() {
  if (!frame && !loading && playing && !document.hidden) frame = requestAnimationFrame(advance);
}
function advance(now) {
  frame = 0;
  if (document.hidden || !playing || loading) return;
  if (!lastFrame) lastFrame = now;
  if (now - lastFrame >= 32) {
    time = Math.min(orbit.end,time + Math.min(now-lastFrame,150)*Number(speed.value)/(1000*SECONDS));
    lastFrame = now;
    if (time === orbit.end) { playing = false; controls(); }
    draw();
  }
  schedule();
}

function recalculate() {
  const version = ++revision, e = Number(eccentricity.value), q = Number(ratio.value);
  stopFrames(); clearTimeout(debounce); worker?.terminate(); worker = null;
  loading = true; failed = false; controls();
  const finish = result => {
    if (version !== revision) return;
    orbit = result; time = 0; loading = false;
    controls(); draw(); schedule();
  };
  const fallback = () => {
    if (version !== revision) return;
    try { finish(makeOrbit(e,q)); }
    catch { orbit = null; failed = true; loading = false; controls(); }
  };
  debounce = setTimeout(() => {
    try {
      worker = new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
      const current = worker;
      current.onmessage = ({data}) => { current.terminate(); if (version === revision) worker = null; finish(data); };
      current.onerror = event => { event.preventDefault(); current.terminate(); if (version === revision) worker = null; fallback(); };
      current.postMessage({e,q});
    } catch { fallback(); }
  },45);
}

for (const input of [eccentricity,ratio]) input.addEventListener('input',recalculate);
for (const [id,e] of [['circular',0],['eccentric',0.65]]) {
  byId(id).addEventListener('click',() => { eccentricity.value = e; recalculate(); });
}
function updateView() {
  controls();
  draw();
}
inclination.addEventListener('input',updateView);
for (const [id, angle] of [['face-on',0],['edge-on',90]]) {
  byId(id).addEventListener('click',() => { inclination.value = angle; updateView(); });
}

// Horizontal dragging turns the viewing direction in the same plane as the slider.
// Vertical touch gestures are handled by the browser so the page can still scroll.
let dragView = null;
fieldCanvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  dragView = { id: event.pointerId, x: event.clientX, angle: Number(inclination.value) };
  fieldCanvas.setPointerCapture(event.pointerId);
});
fieldCanvas.addEventListener('pointermove', event => {
  if (event.pointerId !== dragView?.id) return;
  const span = Math.min(360, fieldCanvas.clientWidth * .8);
  const degrees = dragView.angle + (event.clientX - dragView.x) * 90 / span;
  const angle = Math.max(0, Math.min(90, Math.round(degrees)));
  if (angle === Number(inclination.value)) return;
  inclination.value = angle;
  updateView();
});
fieldCanvas.addEventListener('lostpointercapture', event => {
  if (event.pointerId === dragView?.id) dragView = null;
});
play.addEventListener('click',() => {
  if (time >= orbit.end) time = 0;
  playing = !playing; stopFrames(); controls(); draw(); schedule();
});
restart.addEventListener('click',() => { time = 0; stopFrames(); controls(); draw(); schedule(); });
timeline.addEventListener('input',() => {
  playing = false; stopFrames(); time = Number(timeline.value)*orbit.end; controls(); draw();
});
new ResizeObserver(draw).observe(byId('experiment'));
new MutationObserver(() => { controls(); draw(); }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
reduced.addEventListener('change',() => { if (reduced.matches) { playing = false; stopFrames(); controls(); } });
document.addEventListener('visibilitychange',() => { stopFrames(); schedule(); });
window.addEventListener('pagehide',stopFrames);
window.addEventListener('pageshow',schedule);
recalculate();
