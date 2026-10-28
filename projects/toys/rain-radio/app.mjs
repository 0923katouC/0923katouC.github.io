import { STATIONS, SAVE_KEY, restorePreferences, stationAt, stationIndex, tune, nextBroadcast, toggleFavorite, remainingSeconds, formatDuration } from './model.mjs';
import { RadioAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
let preferences;
let storageAvailable = true;
try { preferences = restorePreferences(JSON.parse(localStorage.getItem(SAVE_KEY))); }
catch { preferences = restorePreferences(null); storageAvailable = false; }
const audio = new RadioAudio(); // Silent until the Play button is pressed.
let playing = false, generation = 0, deadline = 0, timer = null;
let animation = 0, lastFrame = 0;
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = $('scene'), ctx = canvas.getContext('2d');
const currentStation = () => stationAt(stationIndex(preferences.station));

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(preferences)); }
  catch { storageAvailable = false; }
  $('storage-note').textContent = storageAvailable ? '' : ' 当前无法保存，仍然可以自在调台。';
}
function createStationCards() {
  for (const station of STATIONS) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'station-card'; button.dataset.station = station.id;
    const top = document.createElement('span'); top.className = 'card-top';
    const frequency = document.createElement('span'); frequency.textContent = `${station.frequency.toFixed(1)} FM`;
    const indicator = document.createElement('span'); indicator.className = 'card-indicator'; indicator.setAttribute('aria-hidden', 'true');
    top.append(frequency, indicator);
    const name = document.createElement('h3'); name.textContent = station.name;
    const subtitle = document.createElement('p'); subtitle.textContent = station.subtitle;
    button.append(top, name, subtitle);
    button.addEventListener('click', () => selectStation(stationIndex(station.id)));
    $('stations').append(button);
  }
}
function renderFavorites() {
  const favored = preferences.favorites.includes(preferences.station);
  $('favorite').setAttribute('aria-pressed', String(favored));
  $('favorite-symbol').textContent = favored ? '★' : '☆';
  $('favorite-label').textContent = favored ? '已收藏' : '收藏频率';
  const container = $('favorite-list');
  container.replaceChildren();
  if (!preferences.favorites.length) {
    const empty = document.createElement('p'); empty.className = 'empty-favorites';
    empty.textContent = '按一下收音机上的星星，把喜欢的地方留在这里。'; container.append(empty);
  }
  for (const id of preferences.favorites) {
    const station = stationAt(stationIndex(id)), button = document.createElement('button');
    button.type = 'button'; button.className = 'favorite-chip'; button.dataset.station = id;
    button.textContent = `★ ${station.frequency.toFixed(1)} · ${station.name}`;
    button.setAttribute('aria-label', `调到收藏的${station.name}，${station.frequency.toFixed(1)} MHz`);
    button.addEventListener('click', () => selectStation(stationIndex(id)));
    container.append(button);
  }
}
function renderStation() {
  const s = currentStation();
  document.body.dataset.station = s.id;
  $('station-name').textContent = s.name; $('station-subtitle').textContent = s.subtitle;
  $('station-place').textContent = s.place; $('station-mark').textContent = s.mark;
  $('frequency').textContent = s.frequency.toFixed(1);
  $('tuner').value = stationIndex(s.id);
  $('tuner').setAttribute('aria-valuetext', `${s.frequency.toFixed(1)} MHz ${s.name}`);
  const line = preferences.lines[s.id] || 0;
  $('broadcast-text').textContent = s.lines[line];
  $('transmission-number').textContent = `0${line + 1} / 0${s.lines.length}`;
  $('broadcast-from').textContent = `— 来自 ${s.frequency.toFixed(1)} MHz`;
  $('discovered').textContent = `已找到 ${preferences.discovered.length} / ${STATIONS.length} 个频率`;
  for (const button of $('stations').children) {
    const active = button.dataset.station === s.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  renderFavorites(); drawScene(0);
}
function selectStation(index) {
  const previous = preferences.station;
  tune(preferences, index); renderStation(); save();
  if (playing && previous !== preferences.station) void beginPlayback(true);
}
function renderPlayer() {
  document.body.classList.toggle('is-playing', playing);
  $('play').setAttribute('aria-pressed', String(playing));
  $('play-symbol').textContent = playing ? 'Ⅱ' : '▶';
  $('play-label').textContent = playing ? '暂停环境声' : '播放环境声';
  $('play-note').textContent = playing ? '在这里，听一小会儿' : '默认静音，点这里才会响';
  $('signal-status').textContent = playing ? '正在接收一点安静' : '等待你的播放指令';
  $('live-badge').textContent = playing ? '正在收听' : '静音阅读';
  updateAnimation();
}
function renderCountdown() {
  $('countdown').textContent = playing && deadline
    ? `${formatDuration(remainingSeconds(deadline))} 后安静下来`
    : preferences.timerMinutes ? `播放后 ${preferences.timerMinutes} 分钟自动停止` : '随时可以按暂停';
}
function resetTimer() {
  clearInterval(timer); timer = null;
  deadline = playing && preferences.timerMinutes ? Date.now() + preferences.timerMinutes * 60000 : 0;
  if (deadline) timer = setInterval(() => {
    if (remainingSeconds(deadline) <= 0) void pausePlayback('约好的时间到了。声音已经停下，晚安。');
    else renderCountdown();
  }, 1000);
  renderCountdown();
}
async function beginPlayback(retuning = false) {
  if (document.hidden) return;
  const token = ++generation;
  playing = true; renderPlayer();
  if (!retuning) resetTimer();
  $('audio-status').textContent = retuning ? '正在把天线转向另一个地方……' : '正在接收信号……声音会轻轻进来。';
  try {
    const started = await audio.start(currentStation(), preferences.volume);
    if (token !== generation) return;
    if (!started || document.hidden) { await pausePlayback('声音已暂停。准备好了再按播放就行。'); return; }
    $('audio-status').textContent = `正在收听「${currentStation().name}」。这里是合成的环境声，广播文字可以慢慢读。`;
  } catch {
    if (token !== generation) return;
    await pausePlayback('这次没能接通声音，可以再试一次。所有广播文字仍然可以阅读。');
  }
}
async function pausePlayback(message = '声音已经暂停，广播还在。') {
  ++generation; playing = false; resetTimer(); renderPlayer();
  $('audio-status').textContent = message;
  await audio.pause();
}

$('play').addEventListener('click', () => playing ? void pausePlayback() : void beginPlayback());
$('prev').addEventListener('click', () => selectStation(stationIndex(preferences.station) - 1));
$('next').addEventListener('click', () => selectStation(stationIndex(preferences.station) + 1));
$('knob').addEventListener('click', () => selectStation(stationIndex(preferences.station) + 1));
$('knob').addEventListener('keydown', event => {
  const offset = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
  if (offset || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    selectStation(event.key === 'Home' ? 0 : event.key === 'End' ? 7 : stationIndex(preferences.station) + offset);
  }
});
$('tuner').addEventListener('input', event => selectStation(Number(event.target.value)));
$('favorite').addEventListener('click', () => { toggleFavorite(preferences); renderFavorites(); save(); });
$('next-broadcast').addEventListener('click', () => { nextBroadcast(preferences); renderStation(); save(); });
function syncVolume() {
  for (const id of ['volume', 'mobile-volume']) {
    $(id).value = Math.round(preferences.volume * 100);
    $(`${id}-value`).textContent = Math.round(preferences.volume * 100);
  }
}
for (const id of ['volume', 'mobile-volume']) $(id).addEventListener('input', event => {
  preferences.volume = Number(event.target.value) / 100;
  audio.setVolume(preferences.volume); syncVolume(); save();
});
$('sleep').value = preferences.timerMinutes;
$('sleep').addEventListener('change', event => { preferences.timerMinutes = Number(event.target.value); resetTimer(); save(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (playing) void pausePlayback('你去了别处，电台便轻轻停下。回来后，再按播放就好。');
    cancelAnimationFrame(animation); animation = 0;
  } else { drawScene(0); updateAnimation(); }
});
window.addEventListener('pagehide', () => { void pausePlayback(); });
motion.addEventListener?.('change', updateAnimation);

// Low-cost, deterministic illustrations. No animation loop while paused, hidden,
// or reduced-motion is requested; a single frame still describes each place.
const specks = Array.from({ length: 54 }, (_, i) => ({ x: (i * 137.39 + 31) % 960, y: (i * 83.17 + 12) % 360, size: 1 + i % 3 }));
function line(x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function polygon(points, color) {
  ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
}
function drawRain(time, snow = false) {
  specks.forEach((p, i) => {
    const y = (p.y + time * (snow ? 10 : 100) + i * 4) % 380 - 10;
    const x = (p.x + Math.sin(time * .25 + i) * (snow ? 14 : 2));
    if (snow) circle(x, y, p.size * .65, '#c3d5d64b');
    else line(x, y, x - 4, y + 11, '#bed2cf25');
  });
}
function drawScene(time = 0) {
  if (!ctx) return;
  const s = currentStation();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(width / 960, 0, 0, height / 360, 0, 0);
  const backgrounds = { city: '#192e2f', sea: '#153235', roof: '#272c39', tram: '#292e27', garden: '#23332a', moon: '#232738', laundry: '#322b34', snow: '#223440' };
  rect(0, 0, 960, 360, backgrounds[s.scene]);
  const glow = ctx.createRadialGradient(735, 155, 10, 735, 155, 360); glow.addColorStop(0, `${s.color}20`); glow.addColorStop(1, `${s.color}00`);
  rect(0, 0, 960, 360, glow);
  if (s.scene === 'city') {
    [530, 600, 700, 835].forEach((x, i) => { rect(x, 100 - i % 2 * 35, 83, 260, '#132628'); for (let j = 0; j < 5; j++) rect(x + 14, 125 + j * 38 - i % 2 * 35, 13, 10, j % 3 ? '#63807425' : '#bda26a55'); });
    rect(625, 221, 220, 116, '#657b6f'); rect(637, 251, 196, 81, '#d7b279'); rect(633, 228, 205, 16, '#e7c695');
    for (let x = 655; x < 825; x += 43) line(x, 250, x, 332, '#52645e', 5);
    rect(0, 338, 960, 22, '#172626'); drawRain(time);
  } else if (s.scene === 'sea') {
    circle(756, 76, 24, '#bdd2c343');
    for (let y = 220; y < 360; y += 14) { ctx.beginPath(); for (let x = 0; x <= 960; x += 12) { const wave = y + Math.sin(x * .017 + time * .45 + y) * 3; x ? ctx.lineTo(x, wave) : ctx.moveTo(x, wave); } ctx.strokeStyle = '#8badac25'; ctx.lineWidth = 1; ctx.stroke(); }
    polygon([[787, 270], [813, 270], [807, 153], [795, 153]], '#b8c6b0'); rect(786, 142, 29, 16, '#d8c899'); polygon([[780, 142], [822, 142], [801, 125]], '#173030');
    polygon([[798, 147], [950, 100 + Math.sin(time * .2) * 8], [950, 183], [798, 152]], '#ddd2a416');
  } else if (s.scene === 'roof') {
    polygon([[545, 316], [746, 125], [953, 316]], '#414b55'); polygon([[585, 319], [746, 167], [906, 319]], '#25303a');
    rect(705, 227, 78, 102, '#c4ad85'); line(744, 227, 744, 329, '#43505b', 7); line(704, 269, 783, 269, '#43505b', 6); rect(817, 144, 29, 81, '#485159');
    for (let i = 0; i < 6; i++) line(555 + i * 28, 306, 746 + i * 19, 129 + i * 18, '#c5c1b815');
    drawRain(time);
  } else if (s.scene === 'tram') {
    line(500, 126, 960, 126, '#a6ac8877'); line(700, 126, 738, 202, '#9ca78b', 2); line(738, 202, 780, 126, '#9ca78b', 2);
    rect(558, 209, 349, 107, '#a1ac8a'); rect(558, 274, 349, 42, '#61796f');
    for (let x = 574; x < 865; x += 52) rect(x, 225, 38, 41, '#d8c289');
    circle(603, 321, 15, '#101e21'); circle(857, 321, 15, '#101e21');
    line(430, 339, 960, 339, '#a6ac8877', 2); line(430, 349, 960, 349, '#a6ac8833');
    for (let i = 0; i < 8; i++) rect(480 + ((i * 85 + time * 8) % 500), 345, 20, 3, '#95a08d44');
  } else if (s.scene === 'garden') {
    polygon([[540, 318], [540, 177], [730, 75], [922, 177], [922, 318]], '#8da48a13');
    const frame = '#96af8b66'; line(540, 177, 730, 75, frame, 2); line(730, 75, 922, 177, frame, 2); line(540, 177, 922, 177, frame, 2);
    [540, 635, 730, 826, 922].forEach(x => line(x, 177, x, 320, frame, 2)); line(730, 75, 635, 177, frame); line(730, 75, 826, 177, frame);
    for (let i = 0; i < 8; i++) { const x = 580 + i * 42, y = 324 - (i % 3) * 13; rect(x - 12, y - 4, 24, 24, '#788369'); line(x, y, x + Math.sin(time * .4 + i) * 3, y - 55, '#97ad80', 2); for (let j = 0; j < 3; j++) { ctx.save(); ctx.translate(x, y - j * 15 - 12); ctx.rotate((j % 2 ? -1 : 1) * .7); ctx.fillStyle = '#849e77'; ctx.beginPath(); ctx.ellipse(0, -7, 5, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
  } else if (s.scene === 'moon') {
    specks.forEach((p, i) => circle(p.x, p.y * .7, i % 4 ? .7 : 1.3, '#c5c4d759'));
    circle(790, 105, 43, '#8ca6b6'); circle(775, 99, 22, '#a5b6ac'); circle(808, 121, 11, '#b4beb2');
    polygon([[450, 360], [590, 292], [706, 313], [795, 279], [960, 321], [960, 360]], '#536070');
    rect(589, 264, 90, 63, '#a7acb7'); rect(602, 277, 27, 21, '#e0c99b'); line(662, 264, 662, 216, '#aeb4bd', 2); line(644, 227, 679, 227, '#aeb4bd', 2);
  } else if (s.scene === 'laundry') {
    rect(536, 151, 375, 180, '#a49b9c'); rect(528, 143, 392, 11, '#c2b09d');
    for (let i = 0; i < 3; i++) { const x = 600 + i * 121; circle(x, 247, 44, '#6a7778'); circle(x, 247, 32, '#354851'); rect(x - 34, 172, 38, 9, '#d4bc9b'); circle(x + 27, 176, 6, '#d2c2aa'); ctx.save(); ctx.translate(x, 247); ctx.rotate(time * .12 + i * 2); polygon([[-20, -12], [14, -22], [22, 6], [1, 19]], '#aeb8ae6b'); ctx.restore(); }
    line(540, 316, 910, 316, '#807d79', 2);
  } else if (s.scene === 'snow') {
    polygon([[400, 304], [600, 124], [756, 287], [851, 179], [960, 293], [960, 360], [400, 360]], '#72879555');
    polygon([[548, 175], [600, 124], [647, 174], [610, 164], [594, 180], [574, 161]], '#c6d5d866');
    rect(674, 242, 160, 91, '#7c9194'); polygon([[654, 246], [753, 177], [851, 246]], '#c1d2d0'); rect(691, 264, 31, 34, '#d5bf90'); rect(747, 271, 34, 62, '#394d55'); rect(843, 288, 22, 37, '#aa8581');
    polygon([[400, 343], [560, 322], [698, 337], [960, 320], [960, 360], [400, 360]], '#a3b9bb77'); drawRain(time, true);
  }
}
function frame(now) {
  animation = 0;
  if (!playing || document.hidden || motion.matches) return;
  if (now - lastFrame >= 50) { drawScene(now / 1000); lastFrame = now; }
  animation = requestAnimationFrame(frame);
}
function updateAnimation() {
  cancelAnimationFrame(animation); animation = 0;
  if (playing && !document.hidden && !motion.matches) animation = requestAnimationFrame(frame);
  else drawScene(0);
}
window.addEventListener('resize', () => drawScene(0), { passive: true });
createStationCards(); syncVolume(); renderStation(); renderCountdown(); renderPlayer();
if (!storageAvailable) $('storage-note').textContent = ' 当前无法保存，仍然可以自在调台。';
