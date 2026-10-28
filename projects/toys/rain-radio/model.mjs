export const STATIONS = Object.freeze([
  { id: 'store', frequency: 88.3, name: '凌晨便利店', subtitle: '灯还亮着，什么都不用买。', place: '旧城西路 / 02:17', mark: 'OPEN ALL NIGHT', color: '#e4aa72', scene: 'city', sound: { chord: [130.81, 164.81, 196, 246.94], noise: .11, cutoff: 850, swell: .035, detune: 2 }, lines: [
    '这里是凌晨便利店。热柜里还剩一只包子，老板说留给最后一个路过的人。你可以坐一会儿，微波炉的倒计时不算你的时间。',
    '一位客人买走了两节电池，说家里的钟停在一个很好的下午。老板没有问是哪一天，只替他装进了最小的纸袋。',
    '今日失物：一把没有下过雨的伞，一张写着“明天见”的小票。无人认领。我们准备把明天再留一天。'
  ]},
  { id: 'sea', frequency: 90.7, name: '海上天线', subtitle: '给没有收件人的海风。', place: '离岸七海里 / 04:06', mark: 'SIGNAL FROM THE SEA', color: '#89bab3', scene: 'sea', sound: { chord: [110, 146.83, 164.81, 220], noise: .17, cutoff: 1200, swell: .095, detune: 3 }, lines: [
    '这里是海上天线。今晚没有船需要引航，灯塔还是转了一整夜。它说有些工作，做给海看也一样。',
    '风从远处带来一张没有字的明信片。我们读了很久，决定不替寄件人补上任何一句话。',
    '如果你刚好听见海浪，请不必确定它来自哪片海。岸就在你停下来的地方，接下来的几分钟，潮水会替你往前走。'
  ]},
  { id: 'roof', frequency: 93.4, name: '雨落屋顶', subtitle: '今晚的雨，不需要躲。', place: '三楼阁楼 / 23:48', mark: 'RAIN CHECK, PLEASE', color: '#b2b2c5', scene: 'roof', sound: { chord: [146.83, 174.61, 220, 261.63], noise: .2, cutoff: 2100, swell: .025, detune: 1.5 }, lines: [
    '这里是雨落屋顶。天气预报说这一阵雨只下十分钟，屋顶却申请了加班。楼下的人已经睡了，请把窗留一条缝。',
    '一滴雨落在铁皮上，像有人轻轻按了一下门铃。另一滴说不用开门，我们只是经过。',
    '本台收到一封很短的来信：“最近还好吗？”我们把它念给每一扇亮着灯的窗。你不用现在回答。'
  ]},
  { id: 'tram', frequency: 96.2, name: '最后一班电车', subtitle: '终点站，允许坐过。', place: '环线外侧 / 00:43', mark: 'ONE MORE STOP', color: '#e3bd78', scene: 'tram', sound: { chord: [123.47, 155.56, 185, 246.94], noise: .13, cutoff: 540, swell: .19, detune: 2.3 }, lines: [
    '这里是最后一班电车。驾驶员把报站的声音调低了一点。车厢里有三个人，一盏灯，还有一个今天暂时不想回家的念头。',
    '下一站：还没想好。本站可以换乘“不着急”线。请带好随身物品，把没做完的事留在座位上也可以。',
    '终点站到了。驾驶员说，反正回车场也要绕一圈。如果你还没听完这首不存在的歌，就再坐一站。'
  ]},
  { id: 'garden', frequency: 99.6, name: '玻璃温室', subtitle: '只有植物知道的节目表。', place: '植物园后门 / 05:12', mark: 'SLOW GROWTH CLUB', color: '#aac391', scene: 'garden', sound: { chord: [164.81, 196, 246.94, 293.66], noise: .09, cutoff: 1500, swell: .045, detune: 1 }, lines: [
    '这里是玻璃温室。天还没亮，薄荷已经醒了。它说今天也没有什么远大计划，先把一片叶子长好。',
    '园丁写了一张告示：“请勿催促开花。”第二天，告示下面长出了一小朵不认识的花。现在我们把告示翻到了背面。',
    '今天的节目是露水。没有嘉宾，没有插播。等第一束光进来，我们会很小声地说一句早上好。'
  ]},
  { id: 'moon', frequency: 102.4, name: '月背值班室', subtitle: '这里的夜晚稍微长一点。', place: '未知坐标 / 地球时间不详', mark: 'EARTH ON HOLD', color: '#b5a7d6', scene: 'moon', sound: { chord: [98, 130.81, 146.83, 196], noise: .055, cutoff: 420, swell: .021, detune: 4 }, lines: [
    '这里是月背值班室。交接本上写着：一切正常，地球今天也很蓝。唯一的故障是咖啡机，它总把热咖啡想成一颗彗星。',
    '有人从地球问，这里安静吗？我们试着录了一分钟安静，文件太小，差点被当作空白删掉。',
    '本次连线到这里结束。你听见的最后一点沙沙声，是值班员把椅子转向了窗户。他今晚只负责看一会儿星星。'
  ]},
  { id: 'laundry', frequency: 105.8, name: '深夜洗衣房', subtitle: '把今天轻轻转一圈。', place: '街角自助店 / 01:09', mark: 'GENTLE CYCLE ONLY', color: '#d5a9a6', scene: 'laundry', sound: { chord: [116.54, 146.83, 174.61, 233.08], noise: .12, cutoff: 680, swell: .12, detune: 1.7 }, lines: [
    '这里是深夜洗衣房。四号机器正在洗一件沾了海风的外套。洗衣液的名字叫“晴天”，窗外暂时没有配合。',
    '有人忘记了一只袜子。我们把它挂在留言板旁边，等另一只来认领。它看上去并不着急，终于不用再赶路了。',
    '柔和模式还有七分钟。你可以看滚筒，可以发呆，也可以把今天最难受的一句话，想象成已经被漂洗干净。'
  ]},
  { id: 'snow', frequency: 108, name: '雪线邮局', subtitle: '迟到的信也会被签收。', place: '山口旧站 / 06:31', mark: 'DELAYED, NOT LOST', color: '#a4c1ce', scene: 'snow', sound: { chord: [130.81, 174.61, 196, 261.63], noise: .16, cutoff: 1800, swell: .065, detune: 2.1 }, lines: [
    '这里是雪线邮局。路封了，信没有丢。邮递员每天把信袋背到门口，看一眼雪，又原样背回来。',
    '柜台上有一张很旧的邮票，图案是一条已经改道的河。有人说它过期了，局长说，思念又不走那条河。',
    '第一辆铲雪车刚刚经过。今天也许能寄出一些东西。如果你有一句还没来得及说的话，我们还留着最后一个信封。'
  ]}
]);

export const SAVE_KEY = 'cmc-rain-radio-v1';
export const MAX_VOLUME = .7;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const stationAt = index => { const n = Number(index); return STATIONS[((Math.trunc(Number.isFinite(n) ? n : 0) % STATIONS.length) + STATIONS.length) % STATIONS.length]; };
export const stationIndex = id => Math.max(0, STATIONS.findIndex(s => s.id === id));
export function nearestStation(frequency) {
  const f = Number(frequency);
  if (!Number.isFinite(f)) return 0;
  return STATIONS.reduce((best, s, i) => Math.abs(s.frequency - f) < Math.abs(STATIONS[best].frequency - f) ? i : best, 0);
}
export function defaultPreferences() { return { version: 1, station: 'store', volume: .3, timerMinutes: 0, favorites: [], lines: {}, discovered: ['store'] }; }
export function restorePreferences(raw) {
  const p = defaultPreferences();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return p;
  const ids = STATIONS.map(s => s.id);
  p.station = ids.includes(raw.station) ? raw.station : p.station;
  p.volume = typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? clamp(raw.volume, 0, MAX_VOLUME) : p.volume;
  p.timerMinutes = [0, 15, 30, 60].includes(raw.timerMinutes) ? raw.timerMinutes : 0;
  p.favorites = Array.isArray(raw.favorites) ? [...new Set(raw.favorites.filter(id => ids.includes(id)))] : [];
  p.discovered = Array.isArray(raw.discovered) ? [...new Set(raw.discovered.filter(id => ids.includes(id)))] : [p.station];
  if (!p.discovered.includes(p.station)) p.discovered.push(p.station);
  STATIONS.forEach(s => { const n = raw.lines?.[s.id]; p.lines[s.id] = Number.isSafeInteger(n) && n >= 0 ? n % s.lines.length : 0; });
  return p;
}
export function tune(preferences, index) {
  const station = stationAt(index);
  preferences.station = station.id;
  if (!preferences.discovered.includes(station.id)) preferences.discovered.push(station.id);
  return station;
}
export function nextBroadcast(preferences) {
  const s = STATIONS.find(s => s.id === preferences.station) || STATIONS[0];
  preferences.lines[s.id] = ((preferences.lines[s.id] || 0) + 1) % s.lines.length;
  return s.lines[preferences.lines[s.id]];
}
export function toggleFavorite(preferences) {
  const i = preferences.favorites.indexOf(preferences.station);
  if (i < 0) preferences.favorites.push(preferences.station);
  else preferences.favorites.splice(i, 1);
  return i < 0;
}
export function remainingSeconds(deadline, now = Date.now()) {
  return Number.isFinite(deadline) && deadline > 0 ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}
export function formatDuration(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
// A repeatable soft-noise buffer; generation does not create an audio device.
export function makeNoise(length, seed = 17) {
  const values = new Float32Array(length);
  let n = seed >>> 0 || 17, low = 0;
  for (let i = 0; i < length; i++) {
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    const white = (n >>> 0) / 4294967296 * 2 - 1;
    low = .94 * low + .06 * white;
    values[i] = clamp(.45 * white + 2.3 * low, -1, 1);
  }
  // Blend the loop seam so the long noise bed never makes a repeating click.
  const seam = Math.min(512, Math.floor(length / 8));
  for (let i = 0; i < seam; i++) {
    const mix = (i + 1) / seam;
    values[length - seam + i] = values[length - seam + i] * (1 - mix) + values[0] * mix;
  }
  return values;
}
