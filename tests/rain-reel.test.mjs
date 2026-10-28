import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../projects/games/rain-reel/case-data.mjs';
import { newState, restoreState, collectEvidence, askQuestion, makeDeduction, canConclude, accuse } from '../projects/games/rain-reel/state.mjs';

function collectSceneClues(state) {
  // Deliberately visit rooms in a non-story order.
  for (const id of ['e11', 'e10', 'e08', 'e07', 'e09', 'e06', 'e05', 'e04', 'e03', 'e02', 'e01']) {
    assert.equal(collectEvidence(state, id, data), true);
  }
}
function investigate() {
  const state = newState();
  state.started = true;
  state.location = 'luggage';
  collectSceneClues(state);
  assert.equal(makeDeduction(state, 'd02', ['e11', 'e04'], data), true);
  assert.equal(makeDeduction(state, 'd01', ['e08', 'e07'], data), true);
  assert.ok(askQuestion(state, 'shen', 'shen-open', data));
  assert.equal(makeDeduction(state, 'd03', ['e12', 'e02'], data), true);
  return state;
}

test('case references are complete, unique and traversable', () => {
  assert.equal(data.locations.length, 4);
  assert.equal(data.people.length, 4);
  assert.equal(data.evidence.length, 12);
  assert.equal(data.deductions.length, 3);
  for (const list of [data.locations, data.people, data.evidence, data.deductions]) {
    assert.equal(new Set(list.map(item => item.id)).size, list.length);
  }
  const allEvidence = new Set(data.evidence.map(e => e.id));
  const allDeductions = new Set(data.deductions.map(d => d.id));
  for (const location of data.locations) {
    for (const id of location.evidenceIds) {
      assert.ok(allEvidence.has(id));
      assert.equal(data.evidence.find(e => e.id === id).location, location.id);
    }
  }
  for (const deduction of data.deductions) {
    assert.equal(new Set(deduction.evidenceIds).size, 2);
    for (const id of deduction.evidenceIds) assert.ok(allEvidence.has(id));
  }
  for (const person of data.people) for (const question of person.questions) {
    for (const id of question.requires || []) assert.ok(allDeductions.has(id));
    if (question.unlockEvidence) assert.ok(allEvidence.has(question.unlockEvidence));
  }
});

test('ordinary full playthrough reaches a correct ending after a wrong accusation', () => {
  const state = investigate();
  assert.equal(state.evidence.length, 12);
  assert.equal(canConclude(state, data), true);
  const evidenceBefore = [...state.evidence];
  assert.deepEqual(accuse(state, { person: 'lu', method: 'recording', evidence: 'e12' }, data), { ok: false, locked: false });
  assert.equal(state.solved, false);
  assert.equal(state.attempts, 1);
  assert.deepEqual(state.evidence, evidenceBefore);
  assert.deepEqual(accuse(state, { person: 'shen', method: 'recording', evidence: 'e12' }, data), { ok: true, locked: false });
  assert.equal(state.solved, true);
});

test('only one of the 192 final combinations is accepted', () => {
  const prepared = investigate();
  const accepted = [];
  for (const person of data.people) for (const method of data.solution.methods) for (const evidence of data.evidence) {
    const choice = { person: person.id, method: method.id, evidence: evidence.id };
    if (accuse(structuredClone(prepared), choice, data).ok) accepted.push(choice);
  }
  assert.deepEqual(accepted, [{ person: 'shen', method: 'recording', evidence: 'e12' }]);
});

test('final evidence requires both deductions and the actual follow-up question', () => {
  const state = newState();
  assert.equal(collectEvidence(state, 'e12', data), false);
  assert.equal(askQuestion(state, 'shen', 'shen-open', data), null);
  collectSceneClues(state);
  makeDeduction(state, 'd01', ['e07', 'e08'], data);
  assert.ok(askQuestion(state, 'shen', 'shen-record', data));
  assert.equal(askQuestion(state, 'shen', 'shen-open', data), null);
  makeDeduction(state, 'd02', ['e04', 'e11'], data);
  assert.equal(collectEvidence(state, 'e12', data), false);
  assert.ok(askQuestion(state, 'shen', 'shen-open', data));
  assert.ok(state.evidence.includes('e12'));
  assert.ok(state.asked.includes('shen:shen-open'));
});

test('wrong, repeated, missing and unknown evidence cannot make a deduction', () => {
  const state = newState();
  assert.equal(makeDeduction(state, 'd01', ['e07', 'e08'], data), false);
  collectSceneClues(state);
  for (const pair of [['e07', 'e07'], ['e07', 'e09'], ['missing', 'e08'], ['e07']]) {
    assert.equal(makeDeduction(state, 'd01', pair, data), false);
  }
  assert.equal(makeDeduction(state, 'missing', ['e07', 'e08'], data), false);
  assert.deepEqual(state.deductions, []);
});

test('conclusion remains locked until the final identification deduction', () => {
  const state = newState();
  collectSceneClues(state);
  makeDeduction(state, 'd01', ['e07', 'e08'], data);
  makeDeduction(state, 'd02', ['e04', 'e11'], data);
  askQuestion(state, 'shen', 'shen-open', data);
  assert.equal(canConclude(state, data), false);
  assert.deepEqual(accuse(state, { person: 'shen', method: 'recording', evidence: 'e12' }, data), { ok: false, locked: true });
  assert.equal(state.attempts, 0);
  assert.equal(state.solved, false);
});

test('repeated reading and asking do not duplicate progress', () => {
  const state = investigate();
  collectEvidence(state, 'e01', data);
  collectEvidence(state, 'e01', data);
  askQuestion(state, 'shen', 'shen-open', data);
  askQuestion(state, 'shen', 'shen-open', data);
  makeDeduction(state, 'd01', ['e07', 'e08'], data);
  assert.equal(state.evidence.length, 12);
  assert.equal(state.deductions.length, 3);
  assert.equal(state.asked.filter(q => q === 'shen:shen-open').length, 1);
});

test('save restoration preserves an unfinished investigation and a solved archive', () => {
  let state = newState();
  state.started = true; state.location = 'tea'; state.tab = 'people';
  state.notes = '高音和封签值得再查。';
  collectEvidence(state, 'e07', data);
  askQuestion(state, 'gu', 'gu-time', data);
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state)), data), state);
  state = investigate();
  state.hints = 2;
  accuse(state, { person: 'shen', method: 'recording', evidence: 'e12' }, data);
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state)), data), state);
});

test('malformed saves fall back safely and unknown references are removed', () => {
  for (const raw of [null, [], 'bad', 23, { version: 999 }]) {
    assert.deepEqual(restoreState(raw, data), newState());
  }
  const state = restoreState({ ...newState(), evidence: ['e01', 'e01', 'bad'], deductions: ['d01'], asked: ['bad'], notes: 'x'.repeat(2200), location: 'nowhere', tab: 'secret', hints: -3, attempts: Infinity, solved: true }, data);
  assert.deepEqual(state.evidence, ['e01']);
  assert.deepEqual(state.deductions, []);
  assert.deepEqual(state.asked, []);
  assert.equal(state.notes.length, 2000);
  assert.equal(state.location, 'desk');
  assert.equal(state.tab, 'scene');
  assert.equal(state.hints, 0);
  assert.equal(state.attempts, 0);
  assert.equal(state.solved, false);
});
