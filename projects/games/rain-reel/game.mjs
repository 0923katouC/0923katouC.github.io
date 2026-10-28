import data from './case-data.mjs';
import { newState, restoreState, requirementsMet, collectEvidence, askQuestion, makeDeduction, canConclude, accuse } from './state.mjs';

const KEY = 'cmc-rain-reel-v1';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraphs = text => (Array.isArray(text) ? text : [text]).map(p => `<p>${esc(p)}</p>`).join('');
let storageOK = true;
let state = newState();
try { state = restoreState(JSON.parse(localStorage.getItem(KEY)), data); } catch { storageOK = false; }
state.location ||= data.locations[0].id;
let playing = false;
let toastTimer;
let returnFocus;
const evidenceById = id => data.evidence.find(e => e.id === id);
const has = id => state.evidence.includes(id);
const solved = id => state.deductions.includes(id);
const baseEvidence = () => data.evidence.filter(e => !e.requires?.length);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch { storageOK = false; }
  $('save-status').textContent = storageOK ? '已自动保存 · 仅在此浏览器' : '浏览器未能保存进度，请暂时不要关闭本页。';
}
function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function openModal(title, body, kicker = '侦探档案', actions = []) {
  returnFocus = document.activeElement;
  $('modal-title').textContent = title;
  $('modal-kicker').textContent = kicker;
  $('modal-body').innerHTML = body;
  $('modal-actions').replaceChildren();
  actions.forEach(({ label, primary, action }) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `button ${primary ? 'primary' : 'secondary'}`;
    button.textContent = label;
    button.addEventListener('click', () => { $('modal').close(); action?.(); });
    $('modal-actions').append(button);
  });
  if (!$('modal').open) $('modal').showModal();
}
$('close-modal').addEventListener('click', () => $('modal').close());
$('modal').addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus();
  else if (playing) $('view').focus({ preventScroll: true });
});
$('modal').addEventListener('click', event => { if (event.target === $('modal')) { const r = $('modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('modal').close(); } });

function objective() {
  if (state.solved) return '案件已归档。你仍然可以重读线索与人物问话。';
  if (state.evidence.length < 4) return '先从现场开始。点击可疑物品，把它们收进证据夹。';
  const initial = data.deductions.slice(0, 2);
  if (initial.some(d => !solved(d.id))) return '去「推理」把两条相关证据连起来。人物的说法也值得听一听。';
  const special = data.people.find(p => p.questions.some(q => q.unlockEvidence));
  const finalId = special.questions.find(q => q.unlockEvidence).unlockEvidence;
  if (!has(finalId)) return '两条线索有了交点。「问话」里出现了一个可以追问的新问题。';
  if (!canConclude(state, data)) return '新的实物已经入袋。还差最后一次核对，就能组成完整证据链。';
  return '证据链已完整。前往「结案」，给出人物、手法与关键证据。';
}
function renderSidebar() {
  $('location-list').innerHTML = data.locations.map(l => {
    const list = l.evidenceIds.filter(id => !evidenceById(id)?.requires?.length);
    const count = list.filter(has).length;
    return `<button type="button" class="location-button ${state.location === l.id && state.tab === 'scene' ? 'active' : ''} ${count === list.length ? 'done' : ''}" data-location="${esc(l.id)}" ${state.location === l.id && state.tab === 'scene' ? 'aria-current="location"' : ''}><span class="location-icon" aria-hidden="true">${esc(({key:'⌂',film:'▣',music:'♬',case:'▤'})[l.icon] || '◇')}</span><span class="location-copy"><strong>${esc(l.name)}</strong><small>${esc(l.subtitle)}</small></span><span class="location-count">${count}/${list.length}</span></button>`;
  }).join('');
  $('evidence-count').textContent = `${state.evidence.length} / ${data.evidence.length}`;
  $('progress').value = state.evidence.length; $('progress').max = data.evidence.length;
  $('objective').textContent = objective();
  $('recent-evidence').innerHTML = state.evidence.slice(-3).reverse().map(id => `<button type="button" class="evidence-chip" data-evidence="${esc(id)}">＋ ${esc(evidenceById(id).title)}</button>`).join('');
  $('deduction-summary').innerHTML = `<p class="section-label">已确认推理 ${state.deductions.length} / ${data.deductions.length}</p>` + data.deductions.filter(d => solved(d.id)).map(d => `<p class="deduction-note">✓ ${esc(d.title)}</p>`).join('');
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
    if (button.dataset.tab === state.tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('save-status').textContent = storageOK ? '已自动保存 · 仅在此浏览器' : '浏览器未能保存进度，请暂时不要关闭本页。';
}
function renderScene() {
  const l = data.locations.find(item => item.id === state.location);
  const clues = l.evidenceIds.map(evidenceById).filter(e => e && (!e.requires?.length || has(e.id)));
  return `<div class="scene-art"><img src="./scene.svg" alt="窗外的雨夜旅馆" width="1600" height="700"><span class="scene-label">${esc(l.name)} / NIGHT ARCHIVE</span></div><div class="scene-copy"><p class="eyebrow">现场 ${String(data.locations.indexOf(l) + 1).padStart(2, '0')}</p><h2>${esc(l.name)}</h2>${paragraphs(l.description)}<div class="inspect-list">${clues.map(e => `<button type="button" class="action-card ${has(e.id) ? 'collected' : ''}" data-inspect="${esc(e.id)}"><span class="evidence-id">${has(e.id) ? '✓ 已收集' : '＋ 搜查'}</span><strong>${esc(e.title)}</strong><span class="muted">${has(e.id) ? '点击重读' : '仔细看看 →'}</span></button>`).join('')}</div><p class="muted scene-tip">搜查不会错过任何线索。已收集的物品可以随时重读。</p></div>`;
}
function renderEvidence() {
  return `<div class="scene-copy"><p class="eyebrow">EVIDENCE FILE</p><h2>证据夹</h2><p class="muted">现场找到的东西，与人们说的话，不一定是同一回事。</p>${state.evidence.length ? `<div class="evidence-grid">${state.evidence.map(id => {
    const e = evidenceById(id);
    return `<article class="evidence-card"><span class="evidence-id">${esc(e.tag || '物证')} · ${esc(id)}</span><h3>${esc(e.title)}</h3><p class="evidence-source">${esc(e.source)}</p>${paragraphs(e.body)}</article>`;
  }).join('')}</div>` : '<div class="empty-state"><p>证据夹还是空的。</p><p class="muted">从左侧选一个地点，点击物品开始搜查。</p><button class="button secondary" data-go="scene" type="button">去现场看看 →</button></div>'}</div>`;
}
function renderPeople() {
  return `<div class="scene-copy"><p class="eyebrow">FOUR PEOPLE, FOUR STORIES</p><h2>当晚在场的人</h2><p class="muted">问过的话可以重听。有了新发现，也许就能问出下一句。</p><div class="people-grid">${data.people.map((p, index) => `<article class="person-card"><div class="person-header"><div class="portrait portrait-${index + 1}" aria-hidden="true">${esc(p.name.slice(0, 1))}</div><div><h3>${esc(p.name)}</h3><span class="badge">${esc(p.role)}</span></div></div><p>${esc(p.description)}</p><blockquote class="dialogue">${esc(p.initial)}</blockquote><div class="question-list">${p.questions.map(q => {
    const available = requirementsMet(state, q.requires);
    const asked = state.asked.includes(`${p.id}:${q.id}`);
    return `<button type="button" class="question-button ${asked ? 'done' : ''} ${q.requires?.length && available && !asked ? 'unread' : ''}" data-person="${esc(p.id)}" data-question="${esc(q.id)}" ${available ? '' : 'disabled'}>${available ? `${asked ? '✓ ' : '↗ '}${esc(q.label)}` : '发现新的矛盾后，可以继续追问'}</button>`;
  }).join('')}</div></article>`).join('')}</div></div>`;
}
function evidenceOptions(selected = '') {
  return '<option value="">选择一条已收集证据</option>' + state.evidence.map(id => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(evidenceById(id).title)}</option>`).join('');
}
function renderDeductions() {
  return `<div class="scene-copy"><p class="eyebrow">CONNECT THE EVIDENCE</p><h2>把线索连起来</h2><p class="muted">每个判断都需要两条证据。顺序不限，选错也不会扣分。</p>${data.deductions.map((d, index) => {
    const locked = d.evidenceIds.some(id => evidenceById(id).requires?.length && !has(id));
    return `<article class="deduction-card ${solved(d.id) ? 'solved' : ''}"><span class="evidence-id">推理 ${String(index + 1).padStart(2, '0')} ${solved(d.id) ? '· 已确认' : ''}</span><h3>${locked ? '最后一块拼图' : esc(d.title)}</h3>${locked ? '<p class="muted">先完成前两条推理，再回去和当事人谈谈。</p>' : solved(d.id) ? `${paragraphs(d.conclusion)}<p class="muted">依据：${d.evidenceIds.map(id => esc(evidenceById(id).title)).join(' ＋ ')}</p>` : `<p>${esc(d.prompt)}</p><form data-deduction="${esc(d.id)}"><div class="deduction-slots"><label class="select-wrap" for="${esc(d.id)}-a">证据一<select id="${esc(d.id)}-a" name="first" required>${evidenceOptions()}</select></label><span class="join-mark" aria-hidden="true">＋</span><label class="select-wrap" for="${esc(d.id)}-b">证据二<select id="${esc(d.id)}-b" name="second" required>${evidenceOptions()}</select></label></div><button class="button secondary" type="submit">连接证据 →</button><p class="feedback" role="status"></p></form>`}</article>`;
  }).join('')}</div>`;
}
function renderAccusation() {
  if (state.solved) return `<div class="scene-copy"><p class="eyebrow">CASE CLOSED</p><h2>故事找回了结尾。</h2><p>你的结论已经归档。雨还在下，不过今晚的谜团结束了。</p><button class="button primary" data-ending type="button">查看完整真相 →</button><button class="button ghost" data-reset type="button">重新调查</button></div>`;
  if (!canConclude(state, data)) return `<div class="scene-copy"><p class="eyebrow">THE FINAL QUESTION</p><h2>先别急着下结论。</h2><p>确认全部 ${data.deductions.length} 条推理，才能提交有证据支持的指认。</p><p class="notebook-note">${esc(objective())}</p><button class="button secondary" data-go="deduce" type="button">回到推理 →</button></div>`;
  return `<div class="scene-copy"><p class="eyebrow">THE FINAL QUESTION</p><h2>现在，轮到你说了。</h2><p>是谁拿走了胶片？怎样制造了不在场证明？哪件实物把证据链闭合？</p><form id="accusation-form" class="accusation-form"><label for="culprit">拿走胶片的人<select name="person" id="culprit" required><option value="">选择人物</option>${data.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.role)}</option>`).join('')}</select></label><label for="method">制造不在场证明的手法<select name="method" id="method" required><option value="">选择手法</option>${data.solution.methods.map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('')}</select></label><label for="proof">闭合证据链的关键实物<select name="evidence" id="proof" required>${evidenceOptions()}</select></label><p class="muted">指认错误可以修改，不会丢失调查进度。</p><button class="button primary" type="submit">提交结论 →</button><p class="feedback" role="status"></p></form></div>`;
}
function render(focus = false) {
  renderSidebar();
  const views = { scene: renderScene, people: renderPeople, evidence: renderEvidence, deduce: renderDeductions, accuse: renderAccusation };
  $('view').innerHTML = views[state.tab]();
  if (focus) $('view').focus({ preventScroll: true });
}
function navigate(tab, location) {
  state.tab = tab;
  if (location) state.location = location;
  save(); render(true);
}
function enterGame() {
  playing = true; state.started = true;
  $('welcome').hidden = true; $('game').hidden = false;
  document.body.classList.add('is-playing');
  $('notes').value = state.notes;
  save(); render();
  $('view').focus({ preventScroll: true });
}
function showEnding() {
  const badge = state.hints === 0 && state.attempts === 0 ? '独立破案' : '真相已明';
  openModal('雨停之前，故事有了结尾。', `<span class="badge">${badge}</span>${paragraphs(data.solution.explanation)}<h3>那五分钟，发生了什么</h3><ol class="ending-timeline">${data.solution.timeline.map(item => `<li><strong>${esc(item.time)}</strong><span>${esc(item.text)}</span></li>`).join('')}</ol><p class="muted">已收集 ${state.evidence.length} 条证据 · 完成 ${state.deductions.length} 次推理 · 使用 ${state.hints} 次提示</p>`, '档案 001 · 已结案', [{ label: '再翻翻这份档案', primary: true }]);
}
function confirmReset() {
  openModal('重新调查这桩案子？', '<p>这会清除本游戏在当前浏览器里的线索、推理和手记。其他网站数据不受影响。</p>', '重新开始', [
    { label: '继续当前调查' },
    { label: '清空本局，重新开始', primary: true, action: () => { state = newState(); state.location = data.locations[0].id; $('notes').value = ''; save(); enterGame(); notify('新档案已打开。'); } }
  ]);
}
function showHint() {
  state.hints++;
  const firstMissing = baseEvidence().find(e => !has(e.id));
  const pending = data.deductions.find(d => !solved(d.id));
  let hint;
  if (state.solved) hint = '你已经找到了真相。去「结案」可以重读完整时间线。';
  else if (firstMissing) hint = `还有没检查的现场物品。到「${data.locations.find(l => l.id === firstMissing.location)?.name || firstMissing.source}」看看「${firstMissing.title}」。`;
  else if (data.deductions.slice(0, 2).some(d => !solved(d.id))) hint = state.hints === 1 ? '有一种声音，并不需要当事人一直在场。也有一种纸，撕开以后仍然能够重新拼起来。' : `试试在「${pending.title}」中连接「${evidenceById(pending.evidenceIds[0]).title}」与「${evidenceById(pending.evidenceIds[1]).title}」。`;
  else if (pending && pending.evidenceIds.some(id => !has(id))) hint = '回到「问话」。前两条推理已经让一个新的追问变得可用，向当事人出示发现。';
  else if (pending) hint = `最后核对身份：连接「${evidenceById(pending.evidenceIds[0]).title}」与「${evidenceById(pending.evidenceIds[1]).title}」。`;
  else hint = '证据链已齐全。选择与实物有关的人、与你确认的声音来源一致的手法，以及最后取得的那件原物。';
  save();
  openModal('给你一点方向', paragraphs(hint), `提示 ${state.hints} · 无惩罚`, [{ label: '继续调查', primary: true }]);
}

document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.tab) return navigate(target.dataset.tab);
  if (target.dataset.go) return navigate(target.dataset.go);
  if (target.dataset.location) return navigate('scene', target.dataset.location);
  if (target.dataset.inspect || target.dataset.evidence) {
    const id = target.dataset.inspect || target.dataset.evidence;
    const evidence = evidenceById(id);
    const fresh = !has(id);
    if (target.dataset.inspect && !collectEvidence(state, id, data) && !has(id)) return;
    if (!has(id)) return;
    save(); renderSidebar();
    if (fresh && state.tab === 'scene') render();
    openModal(evidence.title, paragraphs(evidence.body), `${fresh ? '新证据已收集' : '证据重读'} · ${evidence.source}`, [{ label: '收好，继续调查', primary: true }]);
    return;
  }
  if (target.dataset.question) {
    const question = askQuestion(state, target.dataset.person, target.dataset.question, data);
    if (!question) return;
    const person = data.people.find(p => p.id === target.dataset.person);
    save(); render();
    const extra = question.unlockEvidence ? `<div class="feedback success"><strong>新证据：${esc(evidenceById(question.unlockEvidence).title)}</strong>${paragraphs(evidenceById(question.unlockEvidence).body)}</div>` : '';
    openModal(question.label, `<div class="dialogue">${paragraphs(question.answer)}</div>${extra}`, `${person.name} · ${person.role}`, [{ label: '记下了', primary: true }]);
    return;
  }
  if (target.hasAttribute('data-ending')) showEnding();
  if (target.hasAttribute('data-reset')) confirmReset();
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.matches('[data-deduction], #accusation-form')) return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.dataset.deduction) {
    const ok = makeDeduction(state, form.dataset.deduction, [values.get('first'), values.get('second')], data);
    if (ok) {
      const d = data.deductions.find(x => x.id === form.dataset.deduction);
      save(); render();
      openModal('这两条线索对上了。', paragraphs(d.conclusion), '推理已确认', [{ label: '继续调查', primary: true }]);
    } else {
      const feedback = form.querySelector('.feedback'); feedback.className = 'feedback error';
      feedback.textContent = values.get('first') === values.get('second') ? '需要两条不同的证据。' : '这两条证据还不能支持这个判断。再读读它们的具体内容。';
    }
  } else {
    const result = accuse(state, Object.fromEntries(values), data);
    save();
    if (result.ok) { render(); showEnding(); }
    else { const feedback = form.querySelector('.feedback'); feedback.className = 'feedback error'; feedback.textContent = '这个结论还有矛盾。人物、手法、实物证据必须同时吻合；可以回看已确认的三条推理，再试一次。'; }
  }
});
$('start').addEventListener('click', enterGame);
$('restart').addEventListener('click', confirmReset);
$('welcome-reset').addEventListener('click', confirmReset);
$('hint').addEventListener('click', showHint);
$('notes').addEventListener('input', () => { state.notes = $('notes').value; save(); });
$('intro-copy').innerHTML = paragraphs(data.intro);
if (state.started) {
  $('start').textContent = state.solved ? '重访已结案档案 →' : '继续调查 →';
  $('welcome-reset').hidden = false;
  $('welcome-save').textContent = `已找到上次的进度：${state.evidence.length} 条证据，${state.deductions.length} 条推理。`;
} else if (!storageOK) $('welcome-save').textContent = '浏览器可能无法保存进度；你仍然可以在本页完成游戏。';
