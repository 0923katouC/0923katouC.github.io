import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, DIFFICULTIES, newGame, handFor, previewCard, playCard, nextReset, replay, serialize, restore, undo, rating, isTarget } from '../projects/games/quota-arcade/model.mjs';

// Find a legal fixture without depending on a particular PRNG draw.
function withCard(id, overrides = {}, mode = 'cozy') {
  for (let i = 0; i < 200; i++) {
    const state = { ...newGame(`FIXTURE-${i}`, mode), ...overrides };
    if (handFor(state).includes(id)) return state;
  }
  throw new Error(`No legal fixture for ${id}`);
}
function solve(seed, mode) {
  const failed = new Set();
  function visit(state) {
    if (state.result) return state.result === 'win' ? state : null;
    const key = [state.turn, state.quota, state.heat, state.shields, state.boost, +state.lastTask, state.stable].join(',');
    if (failed.has(key)) return null;
    for (const id of handFor(state)) {
      const result = visit(playCard(state, id).state);
      if (result) return result;
    }
    failed.add(key);
    return null;
  }
  return visit(newGame(seed, mode));
}

test('same seed, difficulty and decisions give the same three distinct cards and state', () => {
  let a = newGame('NIGHT-045', 'normal');
  let b = newGame('NIGHT-045', 'normal');
  for (let turn = 0; turn < 8 && !a.result; turn++) {
    assert.deepEqual(handFor(a), handFor(b));
    assert.equal(new Set(handFor(a)).size, 3);
    assert.ok(handFor(a).every(id => Object.hasOwn(CARDS, id)));
    const id = handFor(a).find(id => !previewCard(a, id).risky);
    a = playCard(a, id).state; b = playCard(b, id).state;
    assert.deepEqual(a, b);
  }
  const hands = new Set(Array.from({ length: 20 }, (_, i) => handFor(newGame(`VARIANT-${i}`)).join(',')));
  assert.ok(hands.size > 3, 'seeds should offer real variety');
});

test('invalid or unavailable cards do not mutate state', () => {
  const state = newGame();
  for (const id of ['invented', '__proto__', 'coast']) {
    const step = playCard(state, id);
    assert.equal(step.state, state);
    assert.ok(step.error);
  }
  assert.equal(previewCard(state, '__proto__'), null);
  const snapshot = structuredClone(state);
  playCard(state, handFor(state)[0]);
  assert.deepEqual(state, snapshot);
});

test('consecutive tasks combine heat and expenditure, and consume stored boost once', () => {
  const state = withCard('focus', { quota: 90, heat: 1, lastTask: true, boost: 12 });
  const preview = previewCard(state, 'focus');
  assert.deepEqual(preview, { cost: 26, heatChange: 3, combo: 2, boosted: 12, quota: 64, heat: 4, risky: false });
  const next = playCard(state, 'focus').state;
  assert.equal(next.quota, 64); assert.equal(next.heat, 4); assert.equal(next.boost, 0);
  assert.equal(next.spent, 26); assert.equal(next.lastTask, true);
});

test('cooling interrupts combos, recovery clamps quota, boosts and shields are capped', () => {
  const cooled = playCard(withCard('cool', { heat: 2, lastTask: true, boost: 6 }), 'cool').state;
  assert.equal(cooled.heat, 0); assert.equal(cooled.lastTask, false); assert.equal(cooled.boost, 6);
  const recovered = playCard(withCard('recover', { quota: 98, heat: 0 }), 'recover').state;
  assert.equal(recovered.quota, 100); assert.equal(recovered.heat, 0); assert.equal(recovered.spent, 0);
  assert.equal(playCard(withCard('boost', { boost: 12 }), 'boost').state.boost, 12);
  assert.equal(playCard(withCard('shield', { shields: 2 }), 'shield').state.shields, 2);
});

test('resets occur after the scheduled move; same-turn shield blocks exactly one', () => {
  const state = withCard('shield', { turn: 3, quota: 70 });
  assert.equal(nextReset(state).turn, 4);
  const blocked = playCard(state, 'shield').state;
  assert.equal(blocked.quota, 68); assert.equal(blocked.shields, 0); assert.equal(blocked.blocked, 1);
  assert.ok(blocked.log.at(-1).entries.some(entry => entry.kind === 'guard'));
  const task = handFor(state)[0], preview = previewCard(state, task);
  const unblocked = playCard(state, task).state;
  assert.equal(unblocked.quota, Math.min(100, preview.quota + 22));
  assert.ok(unblocked.log.at(-1).entries.some(entry => entry.kind === 'reset'));
  assert.equal(nextReset(unblocked).turn, 8);
  const full = withCard('cool', { turn: 7, quota: 45, heat: 4 }, 'storm');
  assert.equal(playCard(full, 'cool').state.quota, 100);
});

test('late heat and reset overlap keeps both cooling and shield available', () => {
  for (let i = 0; i < 20; i++) {
    const state = { ...newGame(`FINAL-${i}`, 'storm'), turn: 14, quota: 48, heat: 4 };
    const hand = handFor(state);
    assert.equal(new Set(hand).size, 3);
    assert.ok(hand.includes('cool')); assert.ok(hand.includes('shield'));
    assert.equal(playCard(state, 'shield').state.quota, 46);
  }
});

test('quota zero and heat seven fail immediately, before a scheduled reset', () => {
  const empty = withCard('focus', { turn: 3, quota: 12 });
  const dead = playCard(empty, 'focus').state;
  assert.equal(dead.result, 'empty'); assert.equal(dead.quota, 0);
  const hot = withCard('focus', { turn: 3, quota: 80, heat: 5 });
  const overheated = playCard(hot, 'focus').state;
  assert.equal(overheated.result, 'overheat'); assert.equal(overheated.quota, 68);
  assert.deepEqual(handFor(overheated), []);
  assert.ok(playCard(overheated, 'cool').error);
});

test('target bounds are inclusive and winning requires the final consecutive turns', () => {
  assert.ok(isTarget(40)); assert.ok(isTarget(50)); assert.ok(!isTarget(39)); assert.ok(!isTarget(51));
  const rules = DIFFICULTIES.cozy;
  const early = withCard('cool', { quota: 45, stable: 3, turn: 5 });
  assert.equal(playCard(early, 'cool').state.result, null);
  const final = { ...newGame(), quota: 45, turn: rules.turns - 1, stable: 1 };
  assert.equal(playCard(final, 'coast').state.result, 'win');
  assert.equal(playCard({ ...final, stable: 0 }, 'coast').state.result, 'miss');
  assert.equal(playCard({ ...final, quota: 51 }, 'coast').state.stable, 0);
  const perfect = playCard(final, 'coast').state;
  assert.equal(rating(perfect).rank, 'PERFECT 45');
});

test('save data replays legal decisions and rejects corrupted or forged progress', () => {
  const actions = ['focus', 'sweep', 'polish', 'cool', 'burst', 'cool'];
  const state = replay('NIGHT-045', 'cozy', actions);
  assert.ok(state);
  const save = JSON.parse(JSON.stringify(serialize(state)));
  assert.deepEqual(restore(save), state);
  assert.deepEqual(restore({ ...save, quota: 45, result: 'win', shields: 999 }), state);
  for (const raw of [null, {}, { ...save, version: 99 }, { ...save, difficulty: '__proto__' }, { ...save, actions: ['coast'] }, { ...save, actions: Array(100).fill('cool') }]) assert.equal(restore(raw), null);
  assert.deepEqual(undo(state), replay(state.seed, state.difficulty, actions.slice(0, -1)));
});

test('all three difficulties have a replayable default-seed victory', () => {
  for (const mode of Object.keys(DIFFICULTIES)) {
    const victory = solve('NIGHT-045', mode);
    assert.ok(victory, `${mode} must be winnable`);
    assert.equal(victory.turn, DIFFICULTIES[mode].turns);
    assert.ok(victory.stable >= DIFFICULTIES[mode].hold);
    assert.ok(isTarget(victory.quota));
    assert.deepEqual(restore(serialize(victory)), victory);
  }
});

test('a sample of sixty seeded games across all difficulties is solvable', () => {
  for (const mode of Object.keys(DIFFICULTIES)) {
    for (let i = 0; i < 20; i++) assert.ok(solve(`QA-${i}`, mode), `${mode} QA-${i} should have a winning path`);
  }
});
