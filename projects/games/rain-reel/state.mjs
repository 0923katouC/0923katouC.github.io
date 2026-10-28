export const SAVE_VERSION = 1;
export function newState() {
  return { version: SAVE_VERSION, started: false, location: '', tab: 'scene', evidence: [], deductions: [], asked: [], notes: '', hints: 0, attempts: 0, solved: false };
}
export const requirementsMet = (state, requirements = []) => requirements.every(id => state.deductions.includes(id));
export function restoreState(raw, data) {
  const s = newState();
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return s;
  const validList = (value, allowed) => Array.isArray(value) ? [...new Set(value.filter(id => allowed.includes(id)))] : [];
  s.started = raw.started === true;
  s.location = data.locations.some(x => x.id === raw.location) ? raw.location : data.locations[0].id;
  s.tab = ['scene', 'people', 'evidence', 'deduce', 'accuse'].includes(raw.tab) ? raw.tab : 'scene';
  s.evidence = validList(raw.evidence, data.evidence.map(x => x.id));
  s.deductions = validList(raw.deductions, data.deductions.map(x => x.id)).filter(id => data.deductions.find(d => d.id === id).evidenceIds.every(e => s.evidence.includes(e)));
  s.asked = validList(raw.asked, data.people.flatMap(p => p.questions.map(q => `${p.id}:${q.id}`)));
  // A partially written or edited save must not expose evidence from a locked interview.
  s.evidence = s.evidence.filter(id => {
    const item = data.evidence.find(e => e.id === id);
    if (!requirementsMet(s, item.requires)) return false;
    const unlockers = data.people.flatMap(p => p.questions.filter(q => q.unlockEvidence === id).map(q => `${p.id}:${q.id}`));
    return !unlockers.length || unlockers.some(key => s.asked.includes(key));
  });
  s.deductions = s.deductions.filter(id => data.deductions.find(d => d.id === id).evidenceIds.every(e => s.evidence.includes(e)));
  s.asked = s.asked.filter(key => data.people.some(p => p.questions.some(q => `${p.id}:${q.id}` === key && requirementsMet(s, q.requires))));
  s.notes = typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '';
  s.hints = Number.isSafeInteger(raw.hints) ? Math.max(0, Math.min(raw.hints, 999)) : 0;
  s.attempts = Number.isSafeInteger(raw.attempts) ? Math.max(0, Math.min(raw.attempts, 999)) : 0;
  s.solved = raw.solved === true && canConclude(s, data);
  return s;
}
export function collectEvidence(state, id, data, viaQuestion = false) {
  const e = data.evidence.find(item => item.id === id);
  if (!e || !requirementsMet(state, e.requires) || (e.requires?.length && !viaQuestion)) return false;
  if (!state.evidence.includes(id)) state.evidence.push(id);
  return true;
}
export function askQuestion(state, personId, questionId, data) {
  const question = data.people.find(p => p.id === personId)?.questions.find(q => q.id === questionId);
  if (!question || !requirementsMet(state, question.requires)) return null;
  const key = `${personId}:${questionId}`;
  if (!state.asked.includes(key)) state.asked.push(key);
  if (question.unlockEvidence) collectEvidence(state, question.unlockEvidence, data, true);
  return question;
}
export function makeDeduction(state, id, evidenceIds, data) {
  const d = data.deductions.find(item => item.id === id);
  if (!d || evidenceIds.length !== d.evidenceIds.length || new Set(evidenceIds).size !== evidenceIds.length) return false;
  if (!evidenceIds.every(e => state.evidence.includes(e) && d.evidenceIds.includes(e))) return false;
  if (!state.deductions.includes(id)) state.deductions.push(id);
  return true;
}
export function canConclude(state, data) { return data.deductions.every(d => state.deductions.includes(d.id)); }
export function accuse(state, choice, data) {
  if (!canConclude(state, data)) return { ok: false, locked: true };
  const ok = ['person', 'method', 'evidence'].every(key => choice[key] === data.solution[key]);
  if (ok) state.solved = true;
  else state.attempts++;
  return { ok, locked: false };
}
