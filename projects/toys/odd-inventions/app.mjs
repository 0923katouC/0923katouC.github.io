import { VERSION, PROBLEMS, MATERIALS, normalizeOptions, invent, renderBlueprint, shareURL, readShare, readArchive, favoriteKey } from './model.mjs';

const $ = id => document.getElementById(id);
const archiveKey = 'cmc-odd-inventions-v1';
let saved = { last: null, favorites: [] };
let storageAvailable = true;
try { saved = readArchive(localStorage.getItem(archiveKey)); }
catch { storageAvailable = false; }
let favorites = saved.favorites;
let current;
let statusTimer;

function announce(message) {
  clearTimeout(statusTimer);
  $('status').textContent = message;
  statusTimer = setTimeout(() => { $('status').textContent = ''; }, 5500);
}

function persist() {
  try {
    localStorage.setItem(archiveKey, JSON.stringify({ version: VERSION, last: current.options, favorites }));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  $('storage-notice').hidden = storageAvailable;
}

function populate(select, list) {
  for (const item of list) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.append(option);
  }
}
populate($('problem'), PROBLEMS);
populate($('material'), MATERIALS);

function formOptions() {
  return normalizeOptions({ seed: $('seed').value, problem: $('problem').value, material: $('material').value, level: $('absurdity').value, name: $('custom-name').value });
}

function updateRange() {
  const level = Number($('absurdity').value);
  $('absurdity-value').textContent = `0${level} / 05`;
  $('absurdity-note').textContent = ['稍微偏离现实', '认真地不太有用', '有理有据地离谱', '基本不服从常识', '常识已自行请假'][level - 1];
}

function syncForm(options) {
  $('seed').value = options.seed;
  $('problem').value = options.problem;
  $('material').value = options.material;
  $('absurdity').value = options.level;
  $('custom-name').value = options.name;
  updateRange();
}

function refreshFavorites() {
  const key = favoriteKey(current.options);
  const exists = favorites.some(item => favoriteKey(item.options) === key);
  $('favorite').disabled = exists;
  $('favorite').textContent = exists ? '✓ 已入档' : '＋ 收藏这件';
  $('favorite-count').textContent = `${String(favorites.length).padStart(2, '0')} / 24`;
  $('archive-empty').hidden = favorites.length > 0;
  $('favorites-list').replaceChildren();
  favorites.forEach((item, index) => {
    const invention = invent(item.options);
    const row = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'favorite-open';
    open.dataset.openFavorite = String(index);
    open.setAttribute('aria-label', `打开收藏：${invention.name}`);
    const title = document.createElement('strong');
    title.textContent = invention.name;
    const meta = document.createElement('span');
    meta.textContent = `${invention.material.label} · ${invention.serial}`;
    open.append(title, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'favorite-remove';
    remove.dataset.removeFavorite = String(index);
    remove.setAttribute('aria-label', `移除收藏：${invention.name}`);
    remove.textContent = '×';
    row.append(open, remove);
    $('favorites-list').append(row);
  });
}

function render(options, notification = '') {
  current = invent(options);
  syncForm(current.options);
  $('invention-title').textContent = current.name;
  $('file-number').textContent = current.serial;
  $('blueprint').innerHTML = renderBlueprint(current, true, 'workbench');
  $('figure-label').textContent = `FIG. 0${current.mechanism.form + 1} / 想象示意图`;
  $('invention-purpose').textContent = current.abstract;
  $('invention-principle').textContent = current.principle;
  $('invention-caution').textContent = current.caution;
  $('invention-standard').textContent = `审查意见：${current.standard}`;
  $('invention-examiner').textContent = `—— ${current.examiner}`;
  $('invention-steps').replaceChildren(...current.steps.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  $('invention-specs').replaceChildren(...current.specs.map(spec => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = spec.label;
    value.textContent = spec.value;
    row.append(label, value);
    return row;
  }));
  refreshFavorites();
  persist();
  try { history.replaceState(null, '', shareURL(location.href, current.options)); }
  catch { /* A preview environment may prohibit history writes; sharing still works. */ }
  if (notification) announce(notification);
}

function newSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] || 1;
  }
  return (Math.floor(Math.random() * 0xffffffff) || 1);
}

$('absurdity').addEventListener('input', updateRange);
$('seed').addEventListener('invalid', () => { $('seed').closest('details').open = true; });
$('invention-form').addEventListener('submit', event => {
  event.preventDefault();
  render(formOptions(), '申请已受理。新发明的说明书已经整理好了。');
});
$('remix').addEventListener('click', () => {
  const options = formOptions();
  let seed = newSeed();
  if (seed === options.seed) seed = seed === 0xffffffff ? 1 : seed + 1;
  render({ ...options, seed }, '同一个小麻烦，又有了一个新主意。');
});
$('surprise').addEventListener('click', () => {
  const seed = newSeed();
  render({ seed, problem: PROBLEMS[seed % PROBLEMS.length].id, material: MATERIALS[Math.floor(seed / 13) % MATERIALS.length].id, level: seed % 5 + 1, name: '' }, '运气替你填好了申请，空想现在开始。');
});
$('favorite').addEventListener('click', () => {
  if (favorites.some(item => favoriteKey(item.options) === favoriteKey(current.options))) return;
  if (favorites.length >= 24) { announce('抽屉装满了。先移除一件收藏，再给新发明留个位置。'); return; }
  favorites.unshift({ version: VERSION, options: { ...current.options } });
  refreshFavorites();
  persist();
  announce(storageAvailable ? '已放进私人发明档案。' : '已临时收藏。浏览器无法保存，记得导出蓝图。');
});
$('favorites-list').addEventListener('click', event => {
  const open = event.target.closest('button[data-open-favorite]');
  const remove = event.target.closest('button[data-remove-favorite]');
  if (open) {
    const item = favorites[Number(open.dataset.openFavorite)];
    if (!item) return;
    render(item.options, '档案已打开，还是那件熟悉的发明。');
    $('invention-title').setAttribute('tabindex', '-1');
    $('invention-title').focus({ preventScroll: true });
    $('invention-title').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  if (remove) {
    const index = Number(remove.dataset.removeFavorite);
    if (!favorites[index]) return;
    favorites.splice(index, 1);
    refreshFavorites();
    persist();
    const next = $('favorites-list').querySelectorAll('[data-remove-favorite]')[Math.min(index, favorites.length - 1)];
    if (next) next.focus(); else $('favorite').focus();
    announce('已从私人档案移除。');
  }
});
$('download').addEventListener('click', () => {
  const blob = new Blob([renderBlueprint(current, false, 'download')], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cmc-invention-${current.serial}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  announce('已准备好 SVG 蓝图，交给浏览器保存。');
});
$('share').addEventListener('click', async () => {
  const url = shareURL(location.href, current.options);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    announce('分享链接已复制。打开它，就能找回这件发明。');
  } catch {
    $('share-url').value = url;
    $('share-dialog').showModal();
    $('share-url').focus();
    $('share-url').select();
  }
});
$('share-url').addEventListener('click', () => $('share-url').select());

const search = new URLSearchParams(location.search);
const hasShare = ['s', 'p', 'm', 'a', 'n'].some(key => search.has(key));
render(hasShare ? readShare(search) : saved.last || normalizeOptions());
