import { LEVELS, ports, trace, newGame, rotateTile, undo, nextHint, applyHint, restoreSave } from './model.mjs';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const SAVE_KEY = 'cmc-night-train-v1';
const DIRECTION_NAMES = ['上', '右', '下', '左'];
const ENDPOINTS = [[50, 0], [100, 50], [50, 100], [0, 50]];
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let storageAvailable = true;
let saved;
try { saved = restoreSave(JSON.parse(localStorage.getItem(SAVE_KEY))); }
catch { saved = restoreSave(null); storageAvailable = false; }
let active = saved.active;
let game = saved.games[LEVELS[active].id] || newGame(LEVELS[active]);
let focusIndex = LEVELS[active].start;
let highlighted = null;
let lastResult = null;
let busy = false;
let animationFrame = 0;
let finishAnimation = null;

function level() { return LEVELS[active]; }
function svg(tag, attributes) {
  const element = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}
function save() {
  saved.active = active;
  saved.games[level().id] = game;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('save-note').textContent = storageAvailable
    ? '进度自动保存在当前浏览器。'
    : '浏览器暂时不能保存；当前页面仍可正常游玩。';
}
function status(message, tone = '') {
  $('status').textContent = message;
  $('status').dataset.tone = tone;
}
function renderLevels() {
  $('levels').replaceChildren(...LEVELS.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `level-button${saved.records[item.id] ? ' completed' : ''}`;
    button.dataset.level = index;
    button.textContent = String(item.id).padStart(2, '0');
    button.setAttribute('aria-current', String(index === active));
    button.setAttribute('aria-label', `第 ${item.id} 线，${item.title}${saved.records[item.id] ? '，已抵达' : ''}`);
    button.disabled = busy;
    button.addEventListener('click', () => switchLevel(index));
    return button;
  }));
  $('completed-label').textContent = `${Object.keys(saved.records).length} / ${LEVELS.length} 抵达`;
}
function renderBoard(restoreFocus = false) {
  const current = level();
  const travelled = new Set(lastResult?.path || (game.arrived ? trace(current, game.rotations).path : []));
  $('board').dataset.size = current.size;
  $('board').setAttribute('aria-label', `${current.size} 行 ${current.size} 列轨道，方向键选择，空格或回车旋转`);
  $('train-overlay').setAttribute('viewBox', `0 0 ${current.size * 100} ${current.size * 100}`);
  $('board').replaceChildren(...current.cells.map((cell, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.index = index;
    const row = Math.floor(index / current.size), col = index % current.size;
    const open = ports(cell.kind, game.rotations[index]);
    button.className = `cell ${cell.kind}${cell.locked ? ' locked' : ''}${travelled.has(index) ? ' travelled' : ''}${lastResult && !lastResult.ok && lastResult.stalled === index ? ' stalled' : ''}${highlighted === index ? ' hinted' : ''}`;
    button.tabIndex = index === focusIndex ? 0 : -1;
    button.setAttribute('aria-disabled', String(cell.locked || busy));
    button.setAttribute('aria-label', `${row + 1} 行 ${col + 1} 列，${cell.kind === 'empty' ? '空地' : `${cell.kind === 'straight' ? '直轨' : '弯轨'}，连接${open.map(p => DIRECTION_NAMES[p]).join('和')}`}${cell.station >= 0 ? `，第 ${cell.station + 1} 站 ${current.stops[cell.station].name}` : ''}${index === current.start ? '，始发入口' : ''}${index === current.end ? '，终点出口' : ''}${cell.locked && cell.kind !== 'empty' ? '，固定不可转动' : ''}`);
    const drawing = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    if (cell.kind !== 'empty') {
      const [a, b] = open.map(p => ENDPOINTS[p]);
      const d = `M${a.join(' ')} L50 50 L${b.join(' ')}`;
      drawing.append(svg('path', { d, class: 'rail-bed' }), svg('path', { d, class: 'rail' }), svg('path', { d, class: 'rail-inner' }));
      if (cell.station >= 0) {
        drawing.append(svg('circle', { cx: 50, cy: 50, r: 17, class: 'station-dot' }));
        const number = svg('text', { x: 50, y: 50, class: 'station-text' });
        number.textContent = cell.station + 1;
        drawing.append(number);
      }
      if (cell.locked) drawing.append(svg('circle', { cx: 87, cy: 13, r: 4, class: 'lock-dot' }));
    } else drawing.append(svg('circle', { cx: 50, cy: 50, r: 2, class: 'empty-dot' }));
    if (index === current.start) drawing.append(svg('path', { d: 'M3 35 L19 50 L3 65 Z', class: 'terminal-arrow' }));
    if (index === current.end) drawing.append(svg('path', { d: 'M80 35 L97 50 L80 65 Z', class: 'terminal-arrow' }));
    button.append(drawing);
    button.addEventListener('focus', () => {
      focusIndex = index;
      for (const tile of $('board').children) tile.tabIndex = Number(tile.dataset.index) === index ? 0 : -1;
    });
    button.addEventListener('click', () => turn(index));
    button.addEventListener('keydown', event => {
      const offsets = { ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowDown: [1, 0], ArrowLeft: [0, -1] };
      if (!offsets[event.key]) return;
      event.preventDefault();
      const [dr, dc] = offsets[event.key];
      const r = Math.max(0, Math.min(current.size - 1, row + dr));
      const c = Math.max(0, Math.min(current.size - 1, col + dc));
      $('board').children[r * current.size + c].focus();
    });
    return button;
  }));
  if (restoreFocus) $('board').children[focusIndex]?.focus({ preventScroll: true });
}
function renderMeta() {
  $('moves').textContent = String(game.moves).padStart(2, '0');
  $('undo').disabled = busy || !game.history.length;
  $('reset').disabled = busy;
  $('dispatch').disabled = busy;
  $('hint').disabled = busy;
  $('dispatch').firstChild.textContent = busy ? '列车行进中 ' : '发车试试 ';
  $('hint').textContent = highlighted === null ? '给我一点提示' : '帮我转好这一格';
  $('hint-copy').textContent = highlighted === null
    ? '先指出一格，再由你决定要不要让同事帮忙转好。'
    : `看看第 ${Math.floor(highlighted / level().size) + 1} 行、第 ${highlighted % level().size + 1} 列。沿着始发方向检查它的两个接口。`;
  const record = saved.records[level().id];
  $('best-record').textContent = record ? `最少 ${record.moves} 次转动` : '尚未抵达';
  $('best-record').setAttribute('aria-label', record ? `本线最佳记录，${record.moves} 次转动，使用 ${record.hints} 次帮助` : '本线尚未抵达');
  $('win-panel').hidden = !game.arrived;
  $('win-title').textContent = active === LEVELS.length - 1 ? '最后一班，平安到站。' : '列车已安全抵达';
  $('win-copy').textContent = active === LEVELS.length - 1
    ? `最后一扇车门合上。今晚，谢谢你的 ${game.moves} 次耐心。`
    : `${level().stops.length} 站准时停靠 · ${game.moves} 次转动${game.hints ? ` · 同事帮忙 ${game.hints} 次` : ' · 独立调度'}`;
  $('next').textContent = active === LEVELS.length - 1 ? '回到第一条线路 ↺' : '下一条线路 →';
}
function clearJourney() {
  lastResult = null;
  $('train').setAttribute('visibility', 'hidden');
  $('journey-line').setAttribute('d', '');
}
function renderView() {
  $('line-number').textContent = `LINE ${String(level().id).padStart(2, '0')} / ${level().size} × ${level().size}`;
  $('board-heading').textContent = level().title;
  $('level-description').textContent = level().subtitle;
  $('station-order').textContent = level().stops.map((station, index) => `${index + 1} ${station.name}`).join(' → ');
  renderLevels(); renderBoard(); renderMeta();
  status(game.arrived ? '这一线已经抵达。也可以继续转动轨道，寻找自己的另一条路线。' : '先看左侧始发箭头。点击一格转动 90°，接好后就可以发车。', game.arrived ? 'success' : '');
  save();
}
function switchLevel(index) {
  if (busy || index < 0 || index >= LEVELS.length || index === active) return;
  save();
  active = index;
  game = saved.games[level().id] || newGame(level());
  focusIndex = level().start;
  highlighted = null;
  clearJourney(); renderView();
  $('board-heading').focus({ preventScroll: true });
}
function turn(index) {
  if (busy) return;
  if (level().cells[index].locked) {
    status(level().cells[index].kind === 'empty' ? '这里是空地，列车不能通过。试着从别的轨道绕过去。' : '这是一段固定轨道。连接它两端的轨道即可。');
    return;
  }
  focusIndex = index;
  const hadFocus = document.activeElement === $('board').children[index];
  game = rotateTile(game, level(), index);
  highlighted = null;
  clearJourney(); renderBoard(hadFocus); renderMeta(); save();
  status('已顺时针转动 90°。不满意可以撤销，连好后发车试试。');
}
function explain(result) {
  const position = result.stalled === null ? '' : `第 ${Math.floor(result.stalled / level().size) + 1} 行、第 ${result.stalled % level().size + 1} 列`;
  const explanations = {
    entry: '始发站还没有接上。先让左侧入口连进第一段轨道。',
    empty: `前方是空地。列车停在了${position}前，请从别处绕行。`,
    gap: `${position}的接口没接上。看看上一格驶出的方向，再转动这里。`,
    edge: '列车走到了地图边缘。请连接到右侧带箭头的终点出口。',
    order: `经过车站的顺序不对。请先到第 ${result.stops.length + 1} 站，再去后面的车站。`,
    missing: `到达出口前，还有 ${level().stops.length - result.stops.length} 站没有停靠。请接上所有编号车站。`,
    loop: '轨道兜回了原处。调整一个拐角，让列车驶向终点。',
    arrived: '到站了。车窗里的灯，把每个人回家的路照亮了一点。'
  };
  return explanations[result.reason] || '先检查发亮轨道的末端，再试一次。';
}
function journeyPath(result) {
  const size = level().size;
  const points = [[0, (Math.floor(level().start / size) + .5) * 100]];
  result.path.forEach(index => points.push([(index % size + .5) * 100, (Math.floor(index / size) + .5) * 100]));
  if (result.ok) points.push([size * 100, (Math.floor(level().end / size) + .5) * 100]);
  if (points.length === 1) points.push([18, points[0][1]]);
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
}
function dispatch() {
  if (busy) return;
  highlighted = null;
  clearJourney();
  const result = trace(level(), game.rotations);
  busy = true;
  game = { ...game, arrived: false };
  renderLevels(); renderBoard(); renderMeta();
  status('末班列车正在沿轨道前进……');
  const line = $('journey-line');
  line.setAttribute('d', journeyPath(result));
  const length = line.getTotalLength();
  const train = $('train');
  train.setAttribute('visibility', 'visible');
  const place = distance => {
    const point = line.getPointAtLength(distance);
    const before = line.getPointAtLength(Math.max(0, distance - 1));
    const after = line.getPointAtLength(Math.min(length, distance + 1));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    train.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(animationFrame);
    finishAnimation = null;
    place(length);
    busy = false;
    lastResult = result;
    game = { ...game, arrived: result.ok };
    if (result.ok) {
      const previous = saved.records[level().id];
      if (!previous || game.moves < previous.moves || (game.moves === previous.moves && game.hints < previous.hints)) {
        saved.records[level().id] = { moves: game.moves, hints: game.hints };
      }
    }
    renderLevels(); renderBoard(); renderMeta(); save();
    status(explain(result), result.ok ? 'success' : 'warn');
  };
  finishAnimation = finish;
  place(0);
  if (motion.matches || document.hidden) { finish(); return; }
  const duration = Math.min(4700, Math.max(650, result.path.length * 215 + 240));
  let began = null;
  const tick = now => {
    if (began === null) began = now;
    const progress = Math.min(1, (now - began) / duration);
    place(length * progress);
    if (progress >= 1) finish();
    else animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}
$('dispatch').addEventListener('click', dispatch);
$('undo').addEventListener('click', () => {
  if (busy || !game.history.length) return;
  game = undo(game); highlighted = null;
  clearJourney(); renderBoard(); renderMeta(); save();
  status('已撤销上一次转动。慢慢来，这班车会等你。');
});
$('hint').addEventListener('click', () => {
  if (busy) return;
  const hint = nextHint(game, level());
  if (!hint) { status('轨道已经连通，编号车站也都在路上。现在可以发车了。', 'success'); return; }
  clearJourney();
  if (highlighted === hint.index) {
    game = applyHint(game, level()); highlighted = null;
    status('同事帮你转好了这一格。再顺着线路往前看看。');
    save();
  } else {
    highlighted = hint.index;
    status(`已标出第 ${hint.row + 1} 行、第 ${hint.col + 1} 列。可以自己转，也可以再点一次提示请同事帮忙。`);
  }
  renderBoard(); renderMeta();
});
function resetCurrent() {
  game = newGame(level()); highlighted = null;
  clearJourney(); renderBoard(); renderMeta(); save();
  status('轨道已回到本关初始排列。到站记录保留，重新试一条路吧。');
}
$('reset').addEventListener('click', () => {
  if (busy) return;
  if (game.moves || game.arrived) $('confirm').showModal();
  else resetCurrent();
});
$('cancel-reset').addEventListener('click', () => $('confirm').close());
$('confirm-reset').addEventListener('click', () => { $('confirm').close(); resetCurrent(); });
$('next').addEventListener('click', () => switchLevel((active + 1) % LEVELS.length));
document.addEventListener('visibilitychange', () => { if (document.hidden) finishAnimation?.(); });
motion.addEventListener('change', () => { if (motion.matches) finishAnimation?.(); });
renderView();
