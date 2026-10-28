import { elements, potential, stateAtTime, windowFor, sampleOrbit } from './model.mjs';

const $ = (id) => document.getElementById(id);
const TAU = 2 * Math.PI;
const ink = { grid: '#1d2833', muted: '#8a9aa9', mint: '#8fcabb', accent: '#eebc8c' };
const colors = ['#8fcabb', '#92b6e7', '#bca0df', '#df9292', '#c5ce8d'];
const names = { circle: '圆 · 稳定束缚', ellipse: '椭圆 · 束缚', parabola: '抛物线 · 临界逃逸', hyperbola: '双曲线 · 散射' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { E: -0.35, L: 1, time: 0, running: !reducedMotion.matches, speed: 1, pins: [], last: 0 };
const canvases = ['orbit', 'el', 'potential', 'phase'].map((id) => {
  const canvas = $(id + '-canvas');
  return { id, canvas, ctx: canvas.getContext('2d'), w: 0, h: 0 };
});
let orbit, windowSpec, trajectory = [], pinned = [], view, elPlot;
let animationId = 0;
const fmt = (x, digits = 3) => !Number.isFinite(x) ? '∞' : Math.abs(x) >= 10000 ? x.toExponential(2) : x.toFixed(digits);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function line(ctx, points, color, width = 1, dash = []) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
}
function dot(ctx, x, y, color, r = 3) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = color; ctx.fill();
}
function text(ctx, value, x, y, color = ink.muted, align = 'left') {
  ctx.fillStyle = color; ctx.font = '10px "SFMono-Regular", Consolas, monospace'; ctx.textAlign = align; ctx.fillText(value, x, y);
}
function tickStep(span) {
  const raw = span / 5, base = 10 ** Math.floor(Math.log10(raw));
  return (raw / base < 2 ? 1 : raw / base < 5 ? 2 : 5) * base;
}
function tickText(v) { return Math.abs(v) < 1e-8 ? '0' : Math.abs(v) >= 10 ? v.toFixed(0) : Number(v.toPrecision(3)).toString(); }
function plot(c, xmin, xmax, ymin, ymax, xlabel, ylabel) {
  const { ctx, w, h } = c, l = 46, r = w - 17, t = 23, b = h - 33;
  const X = (x) => l + (x - xmin) / (xmax - xmin) * (r - l);
  const Y = (y) => b - (y - ymin) / (ymax - ymin) * (b - t);
  const dx = tickStep(xmax - xmin), dy = tickStep(ymax - ymin);
  for (let v = Math.ceil(xmin / dx) * dx; v <= xmax + 1e-9; v += dx) {
    line(ctx, [[X(v), t], [X(v), b]], ink.grid);
    text(ctx, tickText(v), X(v), b + 17, ink.muted, 'center');
  }
  for (let v = Math.ceil(ymin / dy) * dy; v <= ymax + 1e-9; v += dy) {
    line(ctx, [[l, Y(v)], [r, Y(v)]], ink.grid);
    text(ctx, tickText(v), l - 7, Y(v) + 3, ink.muted, 'right');
  }
  text(ctx, xlabel, r, h - 6, ink.muted, 'right'); text(ctx, ylabel, l, 13);
  return { X, Y, l, r, t, b };
}
function clip(ctx, p) { ctx.save(); ctx.beginPath(); ctx.rect(p.l, p.t, p.r - p.l, p.b - p.t); ctx.clip(); }
function clear(c) { c.ctx.clearRect(0, 0, c.w, c.h); }
function selectedState() { return orbit.valid ? stateAtTime(orbit, state.time) : null; }

function fitView() {
  const points = [{ x: 0, y: 0 }, ...trajectory, ...pinned.flatMap((p) => p.points)];
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of points) { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
  const c = canvases[0], width = Math.max(1, xmax - xmin), height = Math.max(1, ymax - ymin);
  const scale = Math.min((c.w - 100) / width, (c.h - 110) / height) * 0.86;
  view = { scale, cx: (xmin + xmax) / 2, cy: (ymin + ymax) / 2 };
  $('scale-label').textContent = '1 r₀ = ' + Math.round(scale) + ' px';
}

function drawOrbit() {
  const c = canvases[0], { ctx, w, h } = c; clear(c);
  const X = (x) => w / 2 + (x - view.cx) * view.scale;
  const Y = (y) => h / 2 - (y - view.cy) * view.scale;
  const step = tickStep(w / view.scale);
  const xmin = view.cx - w / (2 * view.scale), xmax = view.cx + w / (2 * view.scale);
  const ymin = view.cy - h / (2 * view.scale), ymax = view.cy + h / (2 * view.scale);
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    line(ctx, [[X(x), 38], [X(x), h - 38]], ink.grid);
    if (Math.abs(x) > 1e-8) text(ctx, tickText(x), X(x) + 4, clamp(Y(0) + 15, 53, h - 43));
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) line(ctx, [[12, Y(y)], [w - 12, Y(y)]], ink.grid);
  line(ctx, [[12, Y(0)], [w - 12, Y(0)]], '#35434f');
  line(ctx, [[X(0), 38], [X(0), h - 38]], '#35434f');
  text(ctx, 'x / r₀', w - 17, clamp(Y(0) - 9, 51, h - 45), ink.muted, 'right');
  text(ctx, 'y / r₀', clamp(X(0) + 9, 15, w - 60), 53);
  pinned.forEach((p) => {
    line(ctx, p.points.map((v) => [X(v.x), Y(v.y)]), colors[p.color], 1.1, [4, 5]);
    if (p.window.complete || Math.abs(state.time) <= p.window.halfTime) {
      const s = stateAtTime(p.orbit, state.time); dot(ctx, X(s.x), Y(s.y), colors[p.color], 3);
    }
  });
  if (orbit.valid) {
    line(ctx, trajectory.map((p) => [X(p.x), Y(p.y)]), ink.accent, 1.8);
    const s = selectedState();
    line(ctx, [[X(0), Y(0)], [X(s.x), Y(s.y)]], '#b69a754d', 1, [3, 5]);
    ctx.shadowColor = ink.accent; ctx.shadowBlur = 13; dot(ctx, X(s.x), Y(s.y), '#ffe1bc', 4.5); ctx.shadowBlur = 0;
    dot(ctx, X(orbit.rp), Y(0), ink.accent, 2);
    text(ctx, 'rₚ', X(orbit.rp) + 7, Y(0) - 9, ink.accent);
    if (windowSpec.complete && orbit.kind !== 'circle') text(ctx, 'rₐ', X(-orbit.ra) - 7, Y(0) - 9, ink.accent, 'right');
  }
  const glow = ctx.createRadialGradient(X(0), Y(0), 2, X(0), Y(0), 27);
  glow.addColorStop(0, '#efc2924d'); glow.addColorStop(1, '#efc29200');
  ctx.fillStyle = glow; ctx.fillRect(X(0) - 27, Y(0) - 27, 54, 54);
  dot(ctx, X(0), Y(0), '#ead8b7', 5);
  ctx.beginPath(); ctx.arc(X(0), Y(0), 10, 0, TAU); ctx.strokeStyle = '#b4946c55'; ctx.lineWidth = 1; ctx.stroke();
  text(ctx, 'M', X(0) - 16, Y(0) - 13, '#d9c4a3');
}

function drawEL() {
  const c = canvases[1], { ctx } = c; clear(c);
  const p = plot(c, 0.25, 2.5, -1.5, 1, 'L', 'E'); elPlot = p;
  clip(ctx, p);
  ctx.fillStyle = '#d7a17808'; ctx.fillRect(p.l, p.t, p.r - p.l, p.Y(0) - p.t);
  ctx.beginPath(); ctx.moveTo(p.l, p.b);
  const boundary = Array.from({ length: 241 }, (_, i) => { const L = 0.25 + 2.25 * i / 240; return [p.X(L), p.Y(-1 / (2 * L * L))]; });
  boundary.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(p.r, p.b); ctx.closePath(); ctx.fillStyle = '#060a10b8'; ctx.fill();
  line(ctx, boundary, ink.mint, 1.4);
  line(ctx, [[p.l, p.Y(0)], [p.r, p.Y(0)]], '#b59371', 1, [4, 4]);
  text(ctx, 'E > 0 · 逃逸', p.l + 9, p.t + 19, '#b9a68f');
  text(ctx, '束缚', p.X(0.48), p.Y(-0.65), '#91a4b5');
  text(ctx, '不可达', p.X(1.65), p.Y(-1.15), '#65737f');
  pinned.forEach((pin) => dot(ctx, p.X(pin.orbit.L), p.Y(pin.orbit.E), colors[pin.color], 3));
  const x = p.X(state.L), y = p.Y(state.E);
  line(ctx, [[x, p.b], [x, y], [p.l, y]], '#eebc8c55', 1, [3, 4]);
  dot(ctx, x, y, ink.accent, 4);
  ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.strokeStyle = '#eebc8c77'; ctx.stroke();
  ctx.restore();
}

function drawPotential() {
  const c = canvases[2], { ctx } = c; clear(c);
  const rmax = orbit.valid ? Math.max(2, windowSpec.radius * 1.12) : Math.max(3, state.L ** 2 * 2.5);
  const minimum = -1 / (2 * state.L ** 2);
  const ymin = Math.max(-4, Math.min(state.E - 0.2, minimum - 0.1)), ymax = Math.max(0.6, state.E + 0.4);
  const p = plot(c, 0, rmax, ymin, ymax, 'r', 'E, Veff'); clip(ctx, p);
  const values = Array.from({ length: 600 }, (_, i) => { const r = (i + 1) * rmax / 600; return [p.X(r), p.Y(potential(r, state.L))]; });
  if (orbit.valid) { ctx.fillStyle = '#eebc8c0b'; ctx.fillRect(p.X(orbit.rp), p.t, p.X(Math.min(rmax, orbit.ra)) - p.X(orbit.rp), p.b - p.t); }
  line(ctx, values, ink.mint, 1.5);
  line(ctx, [[p.l, p.Y(state.E)], [p.r, p.Y(state.E)]], ink.accent, 1.2, [5, 4]);
  if (orbit.valid) {
    dot(ctx, p.X(orbit.rp), p.Y(state.E), ink.accent);
    if (orbit.ra < rmax) dot(ctx, p.X(orbit.ra), p.Y(state.E), ink.accent);
    const s = selectedState();
    line(ctx, [[p.X(s.r), p.Y(potential(s.r, state.L))], [p.X(s.r), p.Y(state.E)]], '#eebc8c88', 2);
    dot(ctx, p.X(s.r), p.Y(potential(s.r, state.L)), '#fce4c8');
  }
  ctx.restore();
  if (minimum < ymin) text(ctx, '势阱底部低于显示范围', p.r - 2, p.b - 8, ink.muted, 'right');
}

function drawPhase() {
  const c = canvases[3], { ctx } = c; clear(c);
  const rmax = orbit.valid ? Math.max(2, windowSpec.radius * 1.12) : 6;
  const vmax = orbit.valid ? Math.max(0.3, orbit.e / orbit.L * 1.18) : 1;
  const p = plot(c, 0, rmax, -vmax, vmax, 'r', 'vᵣ'); clip(ctx, p);
  line(ctx, [[p.l, p.Y(0)], [p.r, p.Y(0)]], '#435260', 1, [3, 4]);
  if (orbit.valid) {
    if (orbit.kind === 'circle') dot(ctx, p.X(orbit.rp), p.Y(0), ink.accent, 4);
    else line(ctx, trajectory.map((v) => [p.X(v.r), p.Y(v.vr)]), ink.accent, 1.5);
    const s = selectedState(); dot(ctx, p.X(s.r), p.Y(s.vr), '#ffe4c4', 4);
  }
  ctx.restore();
  if (orbit.kind === 'circle') text(ctx, '圆轨道 → 相图中的一个点', p.l + 6, p.t + 16, ink.accent);
}
function renderMoving() {
  drawOrbit(); drawPotential(); drawPhase();
  $('time-label').textContent = 't = ' + fmt(state.time, 2);
  if (windowSpec) {
    const span = 2 * windowSpec.halfTime;
    const phaseTime = windowSpec.complete ? ((state.time + span / 2) % span + span) % span - span / 2 : state.time;
    $('phase').value = clamp((phaseTime / windowSpec.halfTime + 1) * 500, 0, 1000);
  }
}
function setPlaying(value) {
  state.running = value && orbit.valid; state.last = 0;
  $('play').textContent = state.running ? 'Ⅱ 暂停' : '▶ 播放';
  $('play').setAttribute('aria-pressed', String(state.running));
  schedule();
}
function schedule() { if (!animationId && state.running && !document.hidden) animationId = requestAnimationFrame(frame); }
function frame(now) {
  animationId = 0;
  if (!state.running || document.hidden) { state.last = 0; return; }
  const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 0; state.last = now;
  state.time += dt * state.speed;
  if (!windowSpec.complete && state.time > windowSpec.halfTime) {
    state.time = windowSpec.halfTime; setPlaying(false); $('feedback').textContent = '已到达显示窗口边界。点击“从头播放”再看一次。';
  }
  renderMoving(); schedule();
}

function updatePins() {
  pinned = state.pins.map((p) => { const o = elements(p.E, p.L); return { ...p, orbit: o, points: sampleOrbit(o), window: windowFor(o) }; });
  $('pinned-list').replaceChildren();
  state.pins.forEach((p, index) => {
    const row = document.createElement('div'); row.className = 'pin-row'; row.dataset.color = p.color;
    const label = document.createElement('span'); label.textContent = 'E ' + fmt(p.E, 2) + ' / L ' + fmt(p.L, 2);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', '移除轨道 ' + (index + 1));
    remove.addEventListener('click', () => { state.pins.splice(index, 1); rebuild(false); });
    row.append(label, remove); $('pinned-list').append(row);
  });
  $('pin-count').textContent = state.pins.length + ' / 5';
  $('clear').disabled = state.pins.length === 0;
}
function rebuild(reset = true) {
  orbit = elements(state.E, state.L); windowSpec = windowFor(orbit); trajectory = sampleOrbit(orbit);
  if (reset) { state.time = 0; state.last = 0; $('feedback').textContent = ''; }
  $('energy').value = state.E; $('energy-value').value = fmt(state.E, 6).replace(/0+$/, '').replace(/\.$/, '');
  $('momentum').value = state.L; $('momentum-value').value = fmt(state.L, 6).replace(/0+$/, '').replace(/\.$/, '');
  $('orbit-kind').textContent = orbit.valid ? names[orbit.kind] : '不可达';
  $('invalid-overlay').hidden = orbit.valid;
  $('eccentricity').textContent = orbit.valid ? fmt(orbit.e) : '—';
  $('periapsis').textContent = orbit.valid ? fmt(orbit.rp) : '—';
  $('apoapsis').textContent = orbit.valid ? fmt(orbit.ra) : '—';
  $('period').textContent = orbit.valid ? (Number.isFinite(orbit.period) ? fmt(orbit.period, 2) : '—') : '—';
  $('loop-note').textContent = !orbit.valid ? '无可达轨道' : windowSpec.complete ? '完整周期' : '有限窗口';
  $('selection-note').textContent = !orbit.valid ? 'E < −1/(2L²)，不存在实数径向速度。这里没有物理轨道。' :
    orbit.kind === 'circle' ? '势阱最低点：径向速度恒为零。圆轨道在径向相图中缩成一个点。' :
    orbit.E < 0 ? '束缚轨道：a = −1/(2E) = ' + fmt(orbit.a) + '。E 决定尺度，L 决定偏心率。' :
    orbit.E === 0 ? '恰好逃逸：远处速度趋于零，轨道不闭合，没有周期。' :
    '非束缚散射：无穷远速度 v∞ = √(2E) = ' + fmt(Math.sqrt(2 * orbit.E)) + '。';
  $('pin').disabled = !orbit.valid || state.pins.length >= 5;
  $('play').disabled = !orbit.valid; $('restart').disabled = !orbit.valid; $('phase').disabled = !orbit.valid;
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(orbit.kind === b.dataset.preset)));
  updatePins(); fitView(); drawEL(); renderMoving();
  if (!orbit.valid) setPlaying(false);
}
function choose(E, L) { state.E = clamp(E, -1.5, 1); state.L = clamp(L, 0.25, 2.5); rebuild(); }
function family() {
  const E = state.E < -0.08 ? state.E : -0.35, lc = Math.sqrt(-1 / (2 * E));
  state.pins = [0.4, 0.65, 0.85, 1].map((factor, color) => ({ E, L: clamp(lc * factor, 0.25, 2.5), color }));
  choose(E, Math.min(state.L, lc * 0.95));
  $('feedback').textContent = '同一 E，四个 L。所有椭圆拥有相同的长半轴。';
}

for (const [id, key, lo, hi] of [['energy', 'E', -1.5, 1], ['momentum', 'L', 0.25, 2.5]]) {
  $(id).addEventListener('input', (e) => { state[key] = Number(e.target.value); rebuild(); });
  $(id + '-value').addEventListener('change', (e) => {
    const v = e.target.valueAsNumber;
    if (!Number.isFinite(v)) { e.target.value = state[key]; return; }
    state[key] = clamp(v, lo, hi); rebuild();
  });
}
document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  const choices = { circle: [-0.5, 1], ellipse: [-0.35, 1], parabola: [0, 1.2], hyperbola: [0.3, 1.2] };
  choose(...choices[button.dataset.preset]);
}));
$('circular').addEventListener('click', () => {
  const L = Math.max(state.L, Math.sqrt(1 / 3)); const adjusted = L !== state.L;
  choose(-1 / (2 * L * L), L);
  if (adjusted) $('feedback').textContent = '圆轨道边界低于 E 的显示下限，已移到 E = −1.5 的圆轨道。';
});
$('play').addEventListener('click', () => {
  if (!state.running && !windowSpec.complete && state.time >= windowSpec.halfTime) state.time = -windowSpec.halfTime;
  setPlaying(!state.running);
});
$('restart').addEventListener('click', () => { state.time = -windowSpec.halfTime; $('feedback').textContent = ''; renderMoving(); setPlaying(true); });
$('speed').addEventListener('change', (e) => { state.speed = Number(e.target.value); });
$('phase').addEventListener('input', (e) => { setPlaying(false); state.time = (Number(e.target.value) / 500 - 1) * windowSpec.halfTime; renderMoving(); });
$('fit').addEventListener('click', () => { fitView(); renderMoving(); });
$('pin').addEventListener('click', () => {
  if (!orbit.valid || state.pins.length >= 5) return;
  if (state.pins.some((p) => Math.abs(p.E - state.E) < 1e-8 && Math.abs(p.L - state.L) < 1e-8)) { $('feedback').textContent = '这条轨道已经保留。移动 E 或 L，再收集一条。'; return; }
  const color = colors.findIndex((_, i) => !state.pins.some((p) => p.color === i));
  state.pins.push({ E: state.E, L: state.L, color }); rebuild(false);
  $('feedback').textContent = '已保留。移动 E 或 L，与它比较。';
});
$('family').addEventListener('click', family);
$('clear').addEventListener('click', () => { state.pins = []; rebuild(false); $('feedback').textContent = '保留轨道已清空。'; });

const map = $('el-canvas');
function pick(event) {
  const box = map.getBoundingClientRect(), p = elPlot;
  const x = event.clientX - box.left, y = event.clientY - box.top;
  choose(Math.round(clamp(1 - (y - p.t) / (p.b - p.t) * 2.5, -1.5, 1) * 1000) / 1000,
    Math.round(clamp(0.25 + (x - p.l) / (p.r - p.l) * 2.25, 0.25, 2.5) * 1000) / 1000);
}
map.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; map.setPointerCapture(e.pointerId); pick(e); });
map.addEventListener('pointermove', (e) => { if (map.hasPointerCapture(e.pointerId)) pick(e); });
map.addEventListener('pointerup', (e) => { if (map.hasPointerCapture(e.pointerId)) map.releasePointerCapture(e.pointerId); });
map.addEventListener('keydown', (e) => {
  const d = e.shiftKey ? 0.1 : 0.01;
  const moves = { ArrowUp: [d, 0], ArrowDown: [-d, 0], ArrowLeft: [0, -d], ArrowRight: [0, d] };
  if (!moves[e.key]) return; e.preventDefault();
  choose(state.E + moves[e.key][0], state.L + moves[e.key][1]);
});
document.addEventListener('visibilitychange', () => { state.last = 0; if (!document.hidden) schedule(); });
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) setPlaying(false); });
function resize() {
  canvases.forEach((c) => {
    const b = c.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.w = b.width; c.h = b.height; c.canvas.width = Math.round(b.width * dpr); c.canvas.height = Math.round(b.height * dpr);
    c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  if (orbit) { fitView(); drawEL(); renderMoving(); }
}
if (canvases.every((c) => c.ctx)) {
  resize();
  state.pins = [0.6, Math.sqrt(1 / 0.7)].map((L, color) => ({ E: -0.35, L, color }));
  rebuild(); setPlaying(state.running);
  new ResizeObserver(resize).observe($('experiment'));
} else {
  $('invalid-overlay').hidden = false;
  $('invalid-overlay').textContent = '当前浏览器无法创建 Canvas。请使用支持 Canvas 的浏览器；下方模型与方法仍可阅读。';
  document.querySelectorAll('button, input, select').forEach((el) => { el.disabled = true; });
}
