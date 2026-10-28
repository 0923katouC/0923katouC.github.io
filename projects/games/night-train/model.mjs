export const DIRECTIONS = ['N', 'E', 'S', 'W'];
const DELTA = [[-1, 0], [0, 1], [1, 0], [0, -1]];
export const LEVEL_SPECS = [
  { title: '最后一盏站灯', subtitle: '先把一条简单的路接起来。', size: 4, path: [[1,0],[1,1],[1,2],[1,3]], stops: [{at:[1,2],name:'站前街'}] },
  { title: '拐过便利店', subtitle: '店员刚刚把热饮放进纸袋。', size: 4, path: [[2,0],[2,1],[1,1],[1,2],[1,3]], stops: [{at:[1,1],name:'便利店'}] },
  { title: '绕过施工围挡', subtitle: '熟悉的近路，今晚暂时关闭。', size: 4, path: [[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[1,3]], stops: [{at:[2,1],name:'南巷口'}] },
  { title: '两站之间', subtitle: '先接到等车的人，再送到亮灯的街口。', size: 5, path: [[3,0],[3,1],[2,1],[1,1],[1,2],[1,3],[2,3],[2,4]], stops: [{at:[1,1],name:'旧书店'},{at:[2,3],name:'银杏路'}] },
  { title: '河岸夜风', subtitle: '有人要在河边多坐一站。', size: 5, path: [[1,0],[1,1],[2,1],[3,1],[3,2],[3,3],[2,3],[1,3],[1,4]], stops: [{at:[3,2],name:'河岸'}] },
  { title: '山坡上的灯', subtitle: '沿街的灯一盏一盏向上亮起来。', size: 5, path: [[4,0],[3,0],[2,0],[2,1],[2,2],[1,2],[0,2],[0,3],[0,4]], stops: [{at:[2,0],name:'旧邮局'},{at:[0,2],name:'山坡'}] },
  { title: '替朋友留一站', subtitle: '三个站点，三个还没有结束的夜晚。', size: 5, path: [[0,0],[0,1],[1,1],[2,1],[2,2],[1,2],[1,3],[2,3],[3,3],[3,2],[4,2],[4,3],[4,4]], stops: [{at:[2,1],name:'花店'},{at:[1,3],name:'小剧场'},{at:[4,2],name:'桥南'}] },
  { title: '城市折了一下', subtitle: '这座城总把直线藏在拐角后面。', size: 6, path: [[2,0],[2,1],[1,1],[0,1],[0,2],[0,3],[1,3],[2,3],[2,2],[3,2],[4,2],[4,3],[4,4],[3,4],[3,5]], stops: [{at:[0,2],name:'钟楼'},{at:[4,2],name:'码头'}] },
  { title: '无人认领的雨伞', subtitle: '列车替一把雨伞，绕了半座城。', size: 6, path: [[5,0],[4,0],[3,0],[3,1],[4,1],[4,2],[3,2],[2,2],[2,1],[1,1],[0,1],[0,2],[0,3],[1,3],[1,4],[2,4],[2,5]], stops: [{at:[3,1],name:'洗衣店'},{at:[0,2],name:'北广场'},{at:[1,4],name:'晴天路'}] },
  { title: '我们都回家', subtitle: '把最后三位乘客送到站，今晚就结束了。', size: 6, path: [[1,0],[1,1],[0,1],[0,2],[0,3],[1,3],[1,2],[2,2],[3,2],[3,1],[4,1],[5,1],[5,2],[5,3],[4,3],[3,3],[3,4],[2,4],[2,5]], stops: [{at:[0,3],name:'晚安街'},{at:[5,2],name:'南园'},{at:[3,4],name:'归途'}] }
];

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
function direction(from, to) { return DELTA.findIndex(([dr, dc]) => from[0] + dr === to[0] && from[1] + dc === to[1]); }
export function ports(kind, rotation) {
  if (kind === 'empty') return [];
  const base = kind === 'straight' ? [0, 2] : [0, 1];
  return base.map(d => (d + rotation) % 4).sort((a, b) => a - b);
}
function shapeFor(a, b) {
  const kind = Math.abs(a - b) === 2 ? 'straight' : 'curve';
  const wanted = [a, b].sort((x, y) => x - y).join(',');
  return { kind, solution: [0, 1, 2, 3].find(r => ports(kind, r).join(',') === wanted) };
}
function buildLevel(spec, levelIndex) {
  const random = rng(91601 + levelIndex * 731);
  const indices = spec.path.map(([r, c]) => r * spec.size + c);
  const cells = Array.from({ length: spec.size ** 2 }, (_, index) => {
    const kind = random() < (levelIndex < 3 ? .58 : .32) ? 'empty' : random() < .5 ? 'straight' : 'curve';
    return { kind, locked: kind === 'empty', station: -1, solution: 0, initial: Math.floor(random() * 4), index };
  });
  spec.path.forEach((at, i) => {
    const from = i === 0 ? 3 : direction(at, spec.path[i - 1]);
    const to = i === spec.path.length - 1 ? 1 : direction(at, spec.path[i + 1]);
    const shape = shapeFor(from, to);
    const locked = levelIndex >= 3 && i !== 0 && i !== spec.path.length - 1 && i % (levelIndex < 7 ? 5 : 7) === 3;
    cells[indices[i]] = { ...shape, locked, index: indices[i], station: spec.stops.findIndex(s => s.at[0] === at[0] && s.at[1] === at[1]), initial: locked ? shape.solution : Math.floor(random() * 4) };
  });
  const level = { ...spec, id: levelIndex + 1, cells, indices, start: indices[0], end: indices.at(-1) };
  if (trace(level, cells.map(c => c.initial)).ok) {
    const index = indices.find(i => !cells[i].locked);
    cells[index].initial = (cells[index].initial + 1) % 4;
  }
  return level;
}
export function trace(level, rotations) {
  const path = [], stops = [];
  let index = level.start, incoming = 3;
  const seen = new Set();
  const failure = (reason, stalled = index) => ({ ok: false, reason, path, stops, stalled });
  for (let step = 0; step <= level.cells.length; step++) {
    const cell = level.cells[index];
    if (!cell || cell.kind === 'empty') return failure('empty');
    if (seen.has(index)) return failure('loop');
    const open = ports(cell.kind, rotations[index]);
    if (!open.includes(incoming)) return failure(path.length ? 'gap' : 'entry');
    path.push(index); seen.add(index);
    if (cell.station >= 0) {
      if (cell.station !== stops.length) return failure('order');
      stops.push(cell.station);
    }
    const outgoing = open.find(p => p !== incoming);
    const row = Math.floor(index / level.size), col = index % level.size;
    const nextRow = row + DELTA[outgoing][0], nextCol = col + DELTA[outgoing][1];
    if (nextRow < 0 || nextRow >= level.size || nextCol < 0 || nextCol >= level.size) {
      if (index === level.end && outgoing === 1) {
        return stops.length === level.stops.length ? { ok: true, reason: 'arrived', path, stops, stalled: null } : failure('missing');
      }
      return failure('edge');
    }
    index = nextRow * level.size + nextCol;
    incoming = (outgoing + 2) % 4;
  }
  return failure('loop');
}
export const LEVELS = LEVEL_SPECS.map(buildLevel);
export function newGame(level) { return { rotations: level.cells.map(c => c.initial), moves: 0, hints: 0, history: [], arrived: false }; }
export function rotateTile(game, level, index, turns = 1) {
  if (!Number.isInteger(index) || !level.cells[index] || level.cells[index].locked || !Number.isInteger(turns) || turns === 0) return game;
  const rotations = [...game.rotations];
  rotations[index] = (rotations[index] + turns % 4 + 4) % 4;
  return { ...game, rotations, moves: game.moves + Math.abs(turns), arrived: false, history: [...game.history, { rotations: [...game.rotations], moves: game.moves, hints: game.hints }].slice(-300) };
}
export function undo(game) {
  const previous = game.history.at(-1);
  if (!previous) return game;
  return { ...previous, rotations: [...previous.rotations], history: game.history.slice(0, -1), arrived: false };
}
export function nextHint(game, level) {
  if (trace(level, game.rotations).ok) return null;
  const index = level.indices.find(i => ports(level.cells[i].kind, game.rotations[i]).join(',') !== ports(level.cells[i].kind, level.cells[i].solution).join(','));
  if (index === undefined) return null;
  const cell = level.cells[index];
  const period = cell.kind === 'straight' ? 2 : 4;
  const turns = ((cell.solution - game.rotations[index]) % period + period) % period;
  return { index, turns, row: Math.floor(index / level.size), col: index % level.size };
}
export function applyHint(game, level) {
  const hint = nextHint(game, level);
  if (!hint) return game;
  return { ...rotateTile(game, level, hint.index, hint.turns), hints: game.hints + 1 };
}
export function restoreGame(raw, level) {
  const fallback = newGame(level);
  const validRotations = value => Array.isArray(value) && value.length === level.cells.length && value.every(r => Number.isInteger(r) && r >= 0 && r < 4);
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;
  if (!raw || !validRotations(raw.rotations) || !count(raw.moves) || !count(raw.hints)) return fallback;
  const rotations = raw.rotations.map((r, i) => level.cells[i].locked ? level.cells[i].initial : r);
  const history = Array.isArray(raw.history) ? raw.history.filter(h => h && validRotations(h.rotations) && count(h.moves) && count(h.hints)).slice(-300).map(h => ({ rotations: h.rotations.map((r, i) => level.cells[i].locked ? level.cells[i].initial : r), moves: h.moves, hints: h.hints })) : [];
  return { rotations, moves: raw.moves, hints: raw.hints, history, arrived: raw.arrived === true && trace(level, rotations).ok };
}
export function restoreSave(raw) {
  const clean = { version: 1, active: 0, games: {}, records: {} };
  if (!raw || raw.version !== 1) return clean;
  if (Number.isInteger(raw.active) && raw.active >= 0 && raw.active < LEVELS.length) clean.active = raw.active;
  LEVELS.forEach(level => {
    if (raw.games && Object.hasOwn(raw.games, level.id)) clean.games[level.id] = restoreGame(raw.games[level.id], level);
    const record = raw.records?.[level.id];
    if (record && Number.isInteger(record.moves) && record.moves >= 0 && record.moves <= 100000 && Number.isInteger(record.hints) && record.hints >= 0 && record.hints <= 100000) clean.records[level.id] = { moves: record.moves, hints: record.hints };
  });
  return clean;
}
