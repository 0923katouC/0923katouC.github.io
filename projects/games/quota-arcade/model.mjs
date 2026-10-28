export const VERSION = 1;
export const DIFFICULTIES = Object.freeze({
  cozy: { name: '摸鱼值班', turns: 12, hold: 2, heatLimit: 7, description: '两次小重置，最后稳住 2 回合。', events: [{ turn: 4, amount: 22 }, { turn: 8, amount: 26 }] },
  normal: { name: '标准夜班', turns: 14, hold: 2, heatLimit: 7, description: '三次重置，留一层护盾给夜深时。', events: [{ turn: 4, amount: 24 }, { turn: 8, amount: 28 }, { turn: 12, amount: 24 }] },
  storm: { name: '重置风暴', turns: 16, hold: 3, heatLimit: 7, description: '一次补满、三次补量，最后稳住 3 回合。', events: [{ turn: 4, amount: 28 }, { turn: 8, amount: 'full' }, { turn: 12, amount: 32 }, { turn: 15, amount: 26 }] }
});
export const CARDS = Object.freeze({
  sweep: { id: 'sweep', title: '清理小任务', tag: 'task', cost: 6, heat: 1, icon: '◇', text: '稳稳消耗，留一点调整空间。', flavor: '顺手把桌面文件归个类。' },
  focus: { id: 'focus', title: '认真干一票', tag: 'task', cost: 12, heat: 2, icon: '◈', text: '中等消耗，中等热量。', flavor: '这次真的有在工作。' },
  burst: { id: 'burst', title: '并行开工', tag: 'task', cost: 18, heat: 3, icon: '▰', text: '大幅消耗，注意别过热。', flavor: '三个窗口，一杯咖啡。' },
  polish: { id: 'polish', title: '最后抛光', tag: 'task', cost: 3, heat: 1, icon: '✦', text: '小幅修正，适合接近目标时。', flavor: '再挪一个像素就收工。' },
  shield: { id: 'shield', title: '重置绝缘罩', tag: 'guard', cost: 2, heat: 0, icon: '⬡', text: '获得 1 层护盾，抵挡一次重置。', flavor: '按钮可以按，我可以不收。' },
  cool: { id: 'cool', title: '摸鱼冷却', tag: 'control', cost: 0, heat: -3, icon: '≈', text: '热量降低 3，打断连续运算。', flavor: '机器也需要看会儿窗外。' },
  boost: { id: 'boost', title: '超频许可', tag: 'control', cost: 2, heat: 1, icon: 'ϟ', text: '下一张任务卡额外消耗 6，最多蓄 12。', flavor: '把明天的精神头借过来。' },
  recover: { id: 'recover', title: '缓存回收', tag: 'control', cost: -5, heat: -1, icon: '↶', text: '回收 5 点额度，热量降低 1。', flavor: '有些工作可以撤回重来。' },
  coast: { id: 'coast', title: '守住这一刻', tag: 'control', cost: 0, heat: -1, icon: '☾', text: '额度不变，热量降低 1。', flavor: '最后几班，别再给自己加戏。' }
});
export const isTarget = quota => quota >= 40 && quota <= 50;
export function normalizeSeed(seed) {
  return String(seed ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'NIGHT-045';
}
function randomFor(seed) {
  let a = 2166136261;
  for (const c of seed) { a ^= c.charCodeAt(0); a = Math.imul(a, 16777619); }
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function newGame(seed = 'NIGHT-045', difficulty = 'cozy') {
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) difficulty = 'cozy';
  return { version: VERSION, seed: normalizeSeed(seed), difficulty, turn: 0, quota: 100, heat: 0, shields: 0, boost: 0, lastTask: false, stable: 0, maxStable: 0, blocked: 0, spent: 0, actions: [], log: [], result: null };
}
export function nextReset(state) { return DIFFICULTIES[state.difficulty].events.find(e => e.turn > state.turn) || null; }
export function handFor(state) {
  if (state.result) return [];
  const rules = DIFFICULTIES[state.difficulty];
  const rng = randomFor(`${state.seed}:${state.difficulty}:${state.turn}`);
  const pick = list => list[Math.floor(rng() * list.length)];
  const hand = [pick(['sweep', 'focus', 'burst', 'polish']), pick(['shield', 'cool', 'boost', 'recover']), pick(['sweep', 'focus', 'polish', 'shield', 'cool', 'recover', 'boost'])];
  const event = nextReset(state);
  if (state.quota < 43) hand[1] = 'recover';
  if (event && event.turn - state.turn <= 2 && state.shields === 0) hand[1] = 'shield';
  const needsShieldAndCooling = state.heat >= 4 && event && event.turn - state.turn <= 2 && state.shields === 0;
  if (state.heat >= 4) { hand[1] = 'cool'; if (needsShieldAndCooling) hand[2] = 'shield'; }
  // In the final stretch, cooling already offers a zero-cost hold. Keep the
  // defensive choice available when heat and an imminent reset overlap.
  if (rules.turns - state.turn <= Math.max(3, rules.hold) && !needsShieldAndCooling) hand[2] = 'coast';
  const used = new Set();
  return hand.map(id => { if (used.has(id)) id = ['cool', 'shield', 'recover', 'polish', 'boost', 'sweep'].find(x => !used.has(x)); used.add(id); return id; });
}
export function previewCard(state, id) {
  if (!Object.hasOwn(CARDS, id)) return null;
  const card = CARDS[id];
  const combo = card.tag === 'task' && state.lastTask ? 2 : 0;
  const boosted = card.tag === 'task' ? state.boost : 0;
  const cost = card.cost + combo + boosted;
  const heatChange = card.heat + (combo ? 1 : 0);
  return { cost, heatChange, combo, boosted, quota: Math.max(0, Math.min(100, state.quota - cost)), heat: Math.max(0, state.heat + heatChange), risky: state.quota - cost <= 0 || state.heat + heatChange >= DIFFICULTIES[state.difficulty].heatLimit };
}
export function playCard(state, id) {
  if (state.result || !handFor(state).includes(id)) return { state, error: '这张卡不在当前手牌中。' };
  const card = CARDS[id], preview = previewCard(state, id), rules = DIFFICULTIES[state.difficulty];
  const next = { ...state, turn: state.turn + 1, quota: preview.quota, heat: preview.heat, lastTask: card.tag === 'task', actions: [...state.actions, id], log: [...state.log] };
  const entries = [{ kind: 'card', title: card.title, text: `${preview.cost > 0 ? `消耗 ${preview.cost}` : preview.cost < 0 ? `回收 ${-preview.cost}` : '额度不变'} · 热量 ${preview.heatChange > 0 ? '+' : ''}${preview.heatChange}${preview.combo ? ' · 连击加成' : ''}${preview.boosted ? ' · 超频生效' : ''}` }];
  next.spent += Math.max(0, preview.cost);
  if (card.tag === 'task') next.boost = 0;
  if (id === 'boost') next.boost = Math.min(12, state.boost + 6);
  if (id === 'shield') next.shields = Math.min(2, state.shields + 1);
  if (next.quota <= 0) { next.result = 'empty'; entries.push({ kind: 'bad', title: '额度归零', text: '花得太猛，控制台断电了。' }); }
  else if (next.heat >= rules.heatLimit) { next.result = 'overheat'; entries.push({ kind: 'bad', title: '控制台过热', text: '热量到达 7，强制下班。' }); }
  if (!next.result) {
    const event = rules.events.find(e => e.turn === next.turn);
    if (event) {
      if (next.shields > 0) { next.shields--; next.blocked++; entries.push({ kind: 'guard', title: '拦下重置', text: '一层绝缘罩消失，额度没有被补回。' }); }
      else { const before = next.quota; next.quota = event.amount === 'full' ? 100 : Math.min(100, next.quota + event.amount); entries.push({ kind: 'reset', title: '神秘按钮被按下', text: `额度回升 ${next.quota - before}，现在是 ${next.quota}%。` }); }
    }
    next.stable = isTarget(next.quota) ? state.stable + 1 : 0;
    next.maxStable = Math.max(state.maxStable, next.stable);
    if (next.turn === rules.turns) next.result = next.stable >= rules.hold ? 'win' : 'miss';
  }
  next.log.push({ turn: next.turn, quota: next.quota, heat: next.heat, entries });
  return { state: next, error: null };
}
export function replay(seed, difficulty, actions) {
  let state = newGame(seed, difficulty);
  if (!Array.isArray(actions) || actions.length > DIFFICULTIES[state.difficulty].turns) return null;
  for (const id of actions) { const step = playCard(state, id); if (step.error) return null; state = step.state; }
  return state;
}
export function serialize(state) { return { version: VERSION, seed: state.seed, difficulty: state.difficulty, actions: state.actions }; }
export function restore(raw) {
  if (!raw || raw.version !== VERSION || typeof raw.seed !== 'string' || !Object.hasOwn(DIFFICULTIES, raw.difficulty)) return null;
  return replay(raw.seed, raw.difficulty, raw.actions);
}
export function undo(state) { return replay(state.seed, state.difficulty, state.actions.slice(0, -1)); }
export function rating(state) {
  if (state.result !== 'win') return { title: '这班还没守住', rank: 'TRY AGAIN', text: state.result === 'overheat' ? '多留一张冷却，连续任务会额外升温。' : state.result === 'empty' ? '大任务和超频会叠加，出牌前看看预估。' : `最后需要连续 ${DIFFICULTIES[state.difficulty].hold} 回合处于目标区间。早点对准，再守住它。` };
  const exact = state.quota === 45;
  return { title: exact ? '精准下班' : '成功守住额度', rank: exact ? 'PERFECT 45' : 'SHIFT COMPLETE', text: exact ? '45%。连重置按钮也没法给你加班。' : `剩余 ${state.quota}%，连续稳定 ${state.stable} 回合。可以放心去睡了。` };
}
