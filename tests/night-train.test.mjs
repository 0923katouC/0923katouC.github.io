import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVELS, LEVEL_SPECS, ports, trace, newGame, rotateTile, undo, nextHint, applyHint, restoreGame, restoreSave } from '../projects/games/night-train/model.mjs';

const referenceRotations = level => level.cells.map(cell => cell.solution);

test('ten hand-authored routes are distinct, contiguous, inside the grid, and visit stations in order', () => {
  assert.equal(LEVELS.length, 10);
  assert.equal(new Set(LEVELS.map(level => level.title)).size, 10);
  LEVEL_SPECS.forEach(spec => {
    assert.equal(new Set(spec.path.map(at => at.join(','))).size, spec.path.length);
    assert.equal(spec.path[0][1], 0);
    assert.equal(spec.path.at(-1)[1], spec.size - 1);
    spec.path.forEach(([row, col], index) => {
      assert.ok(row >= 0 && row < spec.size && col >= 0 && col < spec.size);
      if (index) assert.equal(Math.abs(row - spec.path[index - 1][0]) + Math.abs(col - spec.path[index - 1][1]), 1);
    });
    const order = spec.stops.map(stop => spec.path.findIndex(at => at.join() === stop.at.join()));
    assert.ok(order.every(index => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});

for (const level of LEVELS) {
  test(`line ${level.id}: reference route reaches the correct exit through every station`, () => {
    const result = trace(level, referenceRotations(level));
    assert.equal(result.ok, true, `${level.title}: ${result.reason}`);
    assert.deepEqual(result.path, level.indices);
    assert.deepEqual(result.stops, level.stops.map((_, index) => index));
    assert.equal(result.stalled, null);
  });
  test(`line ${level.id}: starts unsolved and progressive hints reliably solve it`, () => {
    let game = newGame(level);
    assert.equal(trace(level, game.rotations).ok, false);
    for (let step = 0; step <= level.indices.length && !trace(level, game.rotations).ok; step++) {
      const hint = nextHint(game, level);
      assert.ok(hint);
      assert.equal(level.cells[hint.index].locked, false);
      assert.ok(hint.turns > 0 && hint.turns < 4);
      const before = game;
      game = applyHint(game, level);
      assert.equal(game.hints, before.hints + 1);
      assert.equal(game.moves, before.moves + hint.turns);
      assert.deepEqual(ports(level.cells[hint.index].kind, game.rotations[hint.index]), ports(level.cells[hint.index].kind, level.cells[hint.index].solution));
      assert.deepEqual(undo(game), { ...before, arrived: false });
    }
    assert.equal(trace(level, game.rotations).ok, true);
    assert.equal(nextHint(game, level), null);
    assert.equal(applyHint(game, level), game);
  });
}

test('rotation is immutable, preserves locked tracks, supports undo, and counts quarter turns', () => {
  const level = LEVELS[3];
  const original = newGame(level);
  const before = structuredClone(original);
  const index = level.indices.find(index => !level.cells[index].locked);
  let game = original;
  for (let i = 0; i < 4; i++) game = rotateTile(game, level, index);
  assert.deepEqual(game.rotations, original.rotations);
  assert.equal(game.moves, 4);
  assert.equal(game.history.length, 4);
  assert.deepEqual(original, before);
  for (let i = 0; i < 4; i++) game = undo(game);
  assert.deepEqual(game, original);
  assert.equal(undo(original), original);
  for (const cell of level.cells.filter(cell => cell.locked)) assert.equal(rotateTile(original, level, cell.index), original);
  assert.equal(rotateTile(original, level, -1), original);
  assert.equal(rotateTile(original, level, level.cells.length), original);
  assert.equal(rotateTile(original, level, index, 0), original);
  assert.equal(rotateTile(original, level, index, 1.5), original);
});

test('trace distinguishes an unconnected entrance, a broken join, empty ground, wrong exit, missing and out-of-order stations', () => {
  const level = LEVELS[0];
  const rotations = referenceRotations(level);
  let altered = [...rotations];
  altered[level.start] = 0;
  assert.equal(trace(level, altered).reason, 'entry');
  altered = [...rotations]; altered[level.indices[1]] = 0;
  assert.equal(trace(level, altered).reason, 'gap');
  const empty = structuredClone(level);
  empty.cells[level.indices[1]].kind = 'empty';
  assert.equal(trace(empty, rotations).reason, 'empty');
  const wrongExit = { ...level, end: 0 };
  assert.equal(trace(wrongExit, rotations).reason, 'edge');
  const missing = structuredClone(level);
  missing.cells[missing.indices[2]].station = -1;
  assert.equal(trace(missing, rotations).reason, 'missing');
  const outOfOrder = structuredClone(LEVELS[3]);
  const stations = outOfOrder.cells.filter(cell => cell.station >= 0);
  stations[0].station = 1; stations[1].station = 0;
  assert.equal(trace(outOfOrder, referenceRotations(outOfOrder)).reason, 'order');
});

test('a different valid arrangement is accepted, rather than comparing against a solution array', () => {
  const level = LEVELS[0];
  const rotations = referenceRotations(level).map((rotation, index) => level.cells[index].kind === 'straight' ? (rotation + 2) % 4 : rotation);
  const decoy = level.cells.find(cell => !level.indices.includes(cell.index) && cell.kind !== 'empty');
  if (decoy) rotations[decoy.index] = (rotations[decoy.index] + 1) % 4;
  assert.equal(trace(level, rotations).ok, true);
});

test('bad or obsolete saves recover safely, and a forged completion flag cannot skip a puzzle', () => {
  const level = LEVELS[3], fresh = newGame(level);
  for (const raw of [null, {}, [], { rotations: [] }, { ...fresh, moves: -1 }, { ...fresh, hints: Infinity }, { ...fresh, rotations: fresh.rotations.map(() => 9) }]) {
    assert.deepEqual(restoreGame(raw, level), fresh);
  }
  assert.equal(restoreGame({ ...fresh, arrived: true }, level).arrived, false);
  assert.equal(restoreGame({ ...fresh, rotations: referenceRotations(level), arrived: true }, level).arrived, true);
  const forged = { ...fresh, rotations: [...fresh.rotations], history: [{ ...fresh }, null, { rotations: [] }] };
  const fixed = level.cells.find(cell => cell.locked && cell.kind !== 'empty');
  forged.rotations[fixed.index] = (fixed.initial + 1) % 4;
  const restored = restoreGame(forged, level);
  assert.equal(restored.rotations[fixed.index], fixed.initial);
  assert.equal(restored.history.length, 1);
  for (const raw of [null, 'junk', [], { version: 2 }]) assert.deepEqual(restoreSave(raw), { version: 1, active: 0, games: {}, records: {} });
  const restoredSave = restoreSave({ version: 1, active: 50, games: { 4: fresh }, records: { 1: { moves: 9, hints: 0 }, 2: { moves: -2, hints: 1 }, 99: { moves: 2, hints: 1 } } });
  assert.equal(restoredSave.active, 0);
  assert.deepEqual(restoredSave.records, { 1: { moves: 9, hints: 0 } });
  assert.deepEqual(restoredSave.games[4], fresh);
});

test('history is bounded and valid in-progress games round trip across storage', () => {
  const level = LEVELS[0];
  let game = newGame(level);
  for (let i = 0; i < 325; i++) game = rotateTile(game, level, level.start);
  assert.equal(game.history.length, 300);
  const raw = JSON.parse(JSON.stringify({ version: 1, active: 0, games: { 1: game }, records: {} }));
  assert.deepEqual(restoreSave(raw).games[1], game);
});

test('the shipped page uses only local assets and keeps scripts/styles outside its CSP-protected HTML', async () => {
  const html = await readFile(new URL('../projects/games/night-train/index.html', import.meta.url), 'utf8');
  assert.match(html, /default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'/);
  assert.match(html, /href="\/projects\/games\/"/);
  assert.doesNotMatch(html, /\son\w+=|\sstyle=|<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  for (const name of ['style.css', 'app.mjs', 'model.mjs', 'cover.svg']) assert.ok((await readFile(new URL(`../projects/games/night-train/${name}`, import.meta.url))).length > 0);
});
