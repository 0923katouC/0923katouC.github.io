import { CARDS, DIFFICULTIES, newGame, handFor, previewCard, playCard, nextReset, isTarget, serialize, restore, undo, rating, normalizeSeed } from './model.mjs';
const $ = id => document.getElementById(id);
const KEY = 'cmc-quota-arcade-v1';
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let state, saved = false, storageOK = true, toastTimer;
try { state = restore(JSON.parse(localStorage.getItem(KEY))); saved = !!state; } catch { storageOK = false; }
if (params.has('seed')) {
  state = newGame(params.get('seed'), params.get('mode') || 'cozy'); saved = false;
  // A challenge link starts a new run once. Reloads must then resume that run.
  const cleanURL = new URL(location.href);
  cleanURL.searchParams.delete('seed'); cleanURL.searchParams.delete('mode');
  history.replaceState(null, '', cleanURL);
}
state ||= newGame();
let previousFocus;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(serialize(state))); storageOK = true; } catch { storageOK = false; }
  $('save-status').textContent = storageOK ? '本局已自动保存 · 仅在当前浏览器' : '浏览器暂时无法保存，请别急着关闭本页。';
}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000); }
function dialog(title, body, actions = [], kicker = 'NIGHT SHIFT MANUAL') {
  previousFocus = document.activeElement;
  $('dialog-title').textContent = title; $('dialog-kicker').textContent = kicker; $('dialog-body').innerHTML = body;
  $('dialog-actions').replaceChildren();
  for (const item of actions) { const button = document.createElement('button'); button.type = 'button'; button.textContent = item.label; if (item.primary) button.className = 'primary-button'; button.addEventListener('click', () => { const result = item.action?.(); if (result !== false) $('dialog').close(); }); $('dialog-actions').append(button); }
  if (!$('dialog').open) $('dialog').showModal();
}
$('dialog-close').addEventListener('click', () => $('dialog').close());
$('dialog').addEventListener('close', () => { if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus(); else if (state.result) $('result-title').focus({preventScroll:true}); else $('hand').focus({preventScroll:true}); });
function showHelp() {
  dialog('下班守则，就这几条。', '<div class="manual"><p><b>① 留下 40–50%。</b>每回合选一张卡。最后连续 2 回合（风暴模式 3 回合）都在目标区，才算守住。提前到达也要等值班结束。</p><p><b>② 看好热量。</b>任务会升温，热量到 7 就过热。连续出任务卡，额外消耗 2、额外升温 1。冷却和其他工具会打断连击。</p><p><b>③ 重置会补回额度。</b>预告写着第几回合发生；重置在该回合出牌后触发。一层护盾挡一次，最多攒两层。</p><p><b>④ 卡牌可以配合。</b>超频给下一张任务额外消耗 6，最多蓄 12；缓存回收能补回 5。最后几回合会提供待机卡，稳住就好。</p><p><b>⑤ 放心试。</b>允许撤销，没有倒计时。卡牌上的数字已包含连击、超频；危险出牌会先提醒。</p><p class="small-note">这里只模拟一台虚构街机，不读取账户，不消耗真实额度，也不会真的触发重置。</p></div>', [{label:'明白，开工',primary:true}]);
}
function guidance() {
  const rules=DIFFICULTIES[state.difficulty];
  if (state.result) return rating(state).text;
  if (state.heat >= 4) return '机器有点热。先冷却，再接着干，别把热量推到 7。';
  if (nextReset(state)?.turn === state.turn+1 && state.shields===0) return '本回合结束就会重置。先撑一层绝缘罩，可以挡住补量。';
  if (isTarget(state.quota)) return `已进入下班区。还剩 ${rules.turns-state.turn} 回合，注意重置和连击别把它带走。`;
  if (state.quota<40) return '花过头了一点。缓存回收可以把额度往上补，出牌前看好预估。';
  if (state.boost) return `超频已经蓄好 +${state.boost}。下一张任务会多消耗这么多。`;
  return '每回合选一张卡。卡面底部已算好这次的消耗和热量。';
}
function render() {
  const rules=DIFFICULTIES[state.difficulty], event=nextReset(state);
  $('difficulty-label').textContent=rules.name;
  $('turn-label').textContent=state.result ? `值班结束 · ${state.turn} / ${rules.turns}` : `第 ${state.turn+1} / ${rules.turns} 回合`;
  $('quota').textContent=state.quota; $('quota-meter').value=state.quota; $('quota-meter').textContent=`${state.quota}%`;
  $('target-status').textContent=isTarget(state.quota)?'已进入下班区':state.quota<40?'需要回收一点':'前往目标区';
  document.body.classList.toggle('in-target',isTarget(state.quota));
  document.body.classList.toggle('game-ended',!!state.result);
  $('quota-change').textContent=state.log.length?`上回合结束：${state.log.at(-1).quota}% · ${CARDS[state.actions.at(-1)].title}`:'所有变化，都在游戏里。';
  $('heat-pips').innerHTML=Array.from({length:7},(_,i)=>`<span class="${i<state.heat?'lit':''} ${i>=5?'hot':''}"></span>`).join('');
  $('heat-pips').setAttribute('aria-label',`热量 ${state.heat}，达到 7 会过热`);
  $('heat-label').textContent=`${state.heat} / 7 · 到 7 会过热`;
  $('shield-value').textContent=Array.from({length:2},(_,i)=>i<state.shields?'⬢':'⬡').join(' ');
  $('shield-value').setAttribute('aria-label',`${state.shields} 层护盾`);
  $('boost-value').textContent=`+${state.boost}`;
  $('reset-title').textContent=event?`还有 ${event.turn-state.turn} 回合`:'按钮暂时休息';
  $('reset-copy').textContent=event?`第 ${event.turn} 回合结束：${event.amount==='full'?'直接补满至 100%':`额度 +${event.amount}`}。${state.shields?'你有护盾，可以挡住。':'当前没有护盾。'}`:'剩下的时间，留给你自己。';
  document.querySelector('.reset-panel').classList.toggle('imminent',!!event&&event.turn-state.turn<=1);
  $('reset-schedule').innerHTML=rules.events.map(e=>`<span class="${e.turn<=state.turn?'passed':''}">${e.turn<=state.turn?'✓ ':''}R${String(e.turn).padStart(2,'0')}<b>${e.amount==='full'?'满格':`+${e.amount}`}</b></span>`).join('');
  $('stable-label').textContent=`目标稳定 ${Math.min(state.stable,rules.hold)} / ${rules.hold} 回合`;
  $('turn-track').innerHTML=Array.from({length:rules.turns},(_,i)=>{const record=state.log[i];return `<span class="${record?(isTarget(record.quota)?'held':'done'):i===state.turn?'current':''} ${i>=rules.turns-rules.hold?'final-turn':''}" aria-label="第${i+1}回合${record?`，剩余${record.quota}%`:''}">${String(i+1).padStart(2,'0')}</span>`;}).join('');
  $('game-guidance').textContent=guidance();
  $('hand-section').hidden=!!state.result; $('result').hidden=!state.result;
  $('undo').disabled=state.turn===0;
  $('hand').innerHTML=handFor(state).map((id,index)=>{const card=CARDS[id],p=previewCard(state,id);return `<button type="button" class="task-card ${card.tag} ${p.risky?'risky':''}" data-card="${id}"><div class="card-top"><span>${card.tag==='task'?'任务':card.tag==='guard'?'防御':'调度'}</span><kbd>${index+1}</kbd></div><span class="card-icon" aria-hidden="true">${card.icon}</span><h3>${card.title}</h3><p>${card.text}</p><em>${card.flavor}</em><div class="card-effects"><strong>${p.cost>0?'−':p.cost<0?'+':''}${Math.abs(p.cost)}<small>额度</small></strong><span>热量 ${p.heatChange>0?'+':''}${p.heatChange}</span></div><div class="card-preview">${p.risky?'⚠ 这张会导致失守':`${event?.turn===state.turn+1?'重置前':'出牌后'} ${p.quota}% · 热量 ${p.heat}/7`}${p.combo?' · 连击':''}${p.boosted?' · 超频':''}</div></button>`;}).join('');
  if(state.result){const end=rating(state);$('result-rank').textContent=end.rank;$('result-title').textContent=end.title;$('result-copy').textContent=end.text;$('result').classList.toggle('win',state.result==='win');$('result-stats').innerHTML=`<span><strong>${state.quota}%</strong>最终额度</span><span><strong>${state.blocked}</strong>挡住重置</span><span><strong>${state.spent}</strong>累计消耗</span>`;}
  $('seed-label').textContent=`SEED / ${state.seed}`;
  $('event-log').innerHTML=state.log.length?[...state.log].reverse().slice(0,6).map(row=>`<li><span class="log-turn">R${String(row.turn).padStart(2,'0')}</span><div>${row.entries.map(e=>`<p class="log-${e.kind}"><b>${escapeHTML(e.title)}</b><span>${escapeHTML(e.text)}</span></p>`).join('')}</div><strong>${row.quota}%</strong></li>`).join(''):'<li class="empty-log">灯亮了。今天也要认真摸鱼。</li>';
}
function act(id,confirmed=false){
  const p=previewCard(state,id);if(!p||state.result)return;
  if(p.risky&&!confirmed){dialog('这张卡会让本局失守。',`<p>出牌后额度将是 <b>${p.quota}%</b>，热量 <b>${p.heat}/7</b>。额度归零或热量达到 7 都会结束本局。</p><p>可以返回换张卡，也可以试试看，再用撤销回到现在。</p>`,[{label:'换一张卡'},{label:'仍然出牌',action:()=>act(id,true)}],'RISK CHECK');return;}
  const step=playCard(state,id);if(step.error){toast(step.error);return;}state=step.state;persist();render();
  if(state.result){$('result').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('result-title').setAttribute('tabindex','-1');$('result-title').focus({preventScroll:true});}
  else $('hand').focus({preventScroll:true});
}
function freshSeed(){const bytes=new Uint32Array(1);try{crypto.getRandomValues(bytes);}catch{bytes[0]=Date.now()>>>0;}return `NIGHT-${bytes[0].toString(36).toUpperCase().slice(0,6)}`;}
function setGame(seed,difficulty){state=newGame(seed,difficulty);persist();render();if(!$('dialog').open)$('hand').focus({preventScroll:true});toast('新夜班已开始。');}
function newGameDialog(){dialog('今晚，值哪一班？',`<label class="field-label" for="new-mode">值班强度</label><select id="new-mode">${Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${id===state.difficulty?'selected':''}>${d.name} · ${d.turns} 回合</option>`).join('')}</select><p id="mode-description" class="small-note">${DIFFICULTIES[state.difficulty].description}</p><label class="field-label" for="new-seed">种子编号</label><input id="new-seed" maxlength="24" value="${freshSeed()}" autocomplete="off" spellcheck="false"><p class="small-note">同样的难度与种子，遇到同样的手牌规则。可用字母、数字、短横线。开始后替换本局存档。</p>`,[{label:'继续当前夜班'},{label:'开始新夜班',primary:true,action:()=>setGame(normalizeSeed($('new-seed').value),$('new-mode').value)}],'SHIFT SELECT');$('new-mode').addEventListener('change',()=>{$('mode-description').textContent=DIFFICULTIES[$('new-mode').value].description;});}
function rewind(){if(!state.turn)return;state=undo(state);persist();render();$('hand').focus({preventScroll:true});toast('已回到上回合出牌前。');}
$('hand').addEventListener('click',event=>{const button=event.target.closest('[data-card]');if(button)act(button.dataset.card);});
$('help').addEventListener('click',showHelp);
for(const id of ['new-game','result-new'])$(id).addEventListener('click',newGameDialog);
for(const id of ['undo','result-undo'])$(id).addEventListener('click',rewind);
$('retry').addEventListener('click',()=>setGame(state.seed,state.difficulty));
$('share').addEventListener('click',async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('seed',state.seed);url.searchParams.set('mode',state.difficulty);url.hash='';try{await navigator.clipboard.writeText(url.href);toast('挑战链接已复制：同一个种子，从零开局。');}catch{dialog('把这班分享出去',`<p>复制这个链接，对方会从同一个种子开局，不会包含你的进度。</p><input class="share-link" id="share-url" readonly value="${escapeHTML(url.href)}">`,[{label:'好了',primary:true}],'SAME SEED CHALLENGE');$('share-url').select();}});
document.addEventListener('keydown',event=>{if($('dialog').open||event.altKey||event.ctrlKey||event.metaKey||event.repeat||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(['1','2','3'].includes(event.key)){event.preventDefault();const id=handFor(state)[Number(event.key)-1];if(id)act(id);}else if(event.key.toLowerCase()==='z'){event.preventDefault();rewind();}});
render();persist();if(saved&&state.turn>0)toast(`已接上上一班：第 ${state.turn} 回合结束，剩余 ${state.quota}%。`);
