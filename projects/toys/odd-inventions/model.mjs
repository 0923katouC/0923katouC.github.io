export const VERSION = 1;
export const PROBLEMS = [
  { id: 'dream', label: '醒来就忘的梦', noun: '梦境', target: '醒来前最后三秒的梦', instruction: '把枕边尚未散去的雾气拢在手心，闭眼数到七。', result: '它把快要忘掉的梦留下一个可以握住的轮廓。', side: '梦里的陌生人偶尔会要求补拍合照。' },
  { id: 'monday', label: '过于漫长的周一', noun: '周一', target: '不肯结束的星期一', instruction: '将日历翻到星期一，轻轻压住页角，不要惊动星期二。', result: '它把漫长的周一收成一小格，等有空再慢慢打开。', side: '被折叠的周一会从周末口袋里掉出来。' },
  { id: 'late', label: '总比自己早到的迟到', noun: '迟到', target: '尚未发生的迟到', instruction: '在出门前准备一句“马上就到”，留出三分钟承认它可能不是真的。', result: '它会提前告诉你哪一步让今天晚了三分钟。', side: '预报太准时，约会对象也可能提前出发。' },
  { id: 'words', label: '没来得及说的话', noun: '未尽之言', target: '那些抵达嘴边又退回去的话', instruction: '小声说一句“算了”，再把真正想说的留在后面。', result: '它替没说出口的话找一个温度合适的落脚处。', side: '偶尔会把“晚安”酿成一封很长的信。' },
  { id: 'rain', label: '出门才落下的雨', noun: '口袋晴天', target: '刚好落在肩膀上的那片雨', instruction: '在晴天收集一平方厘米的光，把它留给下一次阴天。', result: '它只让你周围一小圈暂时晴朗，足够看清路上的猫。', side: '附近的蜗牛可能递来一封投诉信。' },
  { id: 'memory', label: '忘在旧地方的好心情', noun: '旧日好天气', target: '遗落在旧地点的某个好下午', instruction: '找出一张旧车票，把站名念得比平时轻一点。', result: '它把一个好下午的空气带回现在，保留当时的光线。', side: '你可能突然很想吃一份已经停卖的点心。' },
  { id: 'awkward', label: '电梯里的漫长沉默', noun: '沉默', target: '两层楼之间无处安放的沉默', instruction: '在所有人都看向楼层数字时，先做一次不被察觉的深呼吸。', result: '它把尴尬的沉默转换成恰到好处的背景音乐。', side: '音乐可能让所有人同时想起同一个广告。' },
  { id: 'sock', label: '只剩一只的袜子', noun: '袜子远航', target: '洗衣机送往别处的另一只袜子', instruction: '把留下的袜子摆在身边，给离家的那只留一盏小灯。', result: '它追踪失散袜子的旅行路线，但尊重对方暂时不回家的决定。', side: '找到的袜子可能带回一袋不认识的纽扣。' },
  { id: 'sleep', label: '睡前忽然精神的脑袋', noun: '念头', target: '熄灯后突然排起长队的念头', instruction: '先给每个念头发一张号码牌，再把“明天再说”设为终点。', result: '它让念头按号码排队，终于不用挤在同一张枕头上。', side: '第二天第一位访客通常是昨晚忘记买的牙膏。' },
  { id: 'queue', label: '永远更快的隔壁队伍', noun: '等待', target: '总觉得选错队伍的那几分钟', instruction: '站稳后看一次表，把第二次看表的冲动暂时留在手心。', result: '它把等候时间换成一段不会被催促的发呆。', side: '轮到你时，设备也许正好觉得故事讲到精彩处。' },
  { id: 'cat', label: '猫不愿解释的表情', noun: '猫语', target: '那一声含义不明的“喵”', instruction: '朝猫礼貌地点点头，等猫决定这台机器是否值得理会。', result: '它能给猫的沉默写出三种互相矛盾的注释。', side: '所有翻译最后都可能附有“再加一份罐头”。' },
  { id: 'sunset', label: '来不及看的日落', noun: '落日', target: '恰好错过的最后一分钟夕阳', instruction: '把手心朝西摊开一会儿，不要催那一小块橘色。', result: '它把错过的日落移到下一次抬头的时候。', side: '晚霞会在室内坚持使用窗外的风速。' }
];
export const MATERIALS = [
  { id: 'copper', label: '旧铜与黄昏', texture: 'patina', note: '铜件经过七次黄昏自然氧化', color: '#af7950' },
  { id: 'glass', label: '半透明的玻璃', texture: 'glass', note: '玻璃须保留一处看不清的角落', color: '#79a0a8' },
  { id: 'paper', label: '折过的旧纸', texture: 'paper', note: '纸张应当读过至少一个好故事', color: '#a89267' },
  { id: 'cloud', label: '晒干的云', texture: 'cloud', note: '云朵必须晒到七分干，保留一点柔软', color: '#91a5b4' },
  { id: 'wood', label: '旧家具的木头', texture: 'wood', note: '木料仍记得原来那间屋子的温度', color: '#a18358' },
  { id: 'tin', label: '饼干盒铁皮', texture: 'tin', note: '铁皮必须散发极轻的黄油香', color: '#82928f' },
  { id: 'thread', label: '散步时捡到的线', texture: 'thread', note: '线头不可剪齐，需要留一段继续的可能', color: '#ad816e' },
  { id: 'porcelain', label: '有细裂纹的瓷', texture: 'porcelain', note: '细裂纹只允许漏光，不允许漏水', color: '#99a8a2' },
  { id: 'brass', label: '旧门牌与弹簧', texture: 'brass', note: '所有门牌都曾准确地等待过一个人', color: '#b19758' },
  { id: 'moon', label: '月亮的边角料', texture: 'moon', note: '仅采用满月修边时留下的碎料', color: '#a2a1b4' }
];
export const MECHANISMS = [
  { id: 'jar', suffix: '保鲜罐', verb: '低温保存', principle: '内部双层回声壁使内容物停留在“刚刚发生”的时刻。', form: 0 },
  { id: 'fold', suffix: '折叠器', verb: '折叠收纳', principle: '三组铰链只折叠多余的部分，保留你愿意重新展开的那一面。', form: 1 },
  { id: 'radio', suffix: '接收机', verb: '定向接收', principle: '天线避开所有正确频道，只接收刚好与你有关的微弱信号。', form: 2 },
  { id: 'press', suffix: '压缩机', verb: '缓慢压缩', principle: '手摇齿轮将庞大的感受压成适合口袋携带的小尺寸。', form: 3 },
  { id: 'lamp', suffix: '留光灯', verb: '微光转译', principle: '灯芯不燃烧原料，只将其中尚未冷却的一部分换成光。', form: 4 },
  { id: 'umbrella', suffix: '隔离伞', verb: '温柔隔离', principle: '伞面筛掉不必要的噪声，允许恰好需要的事从边缘通过。', form: 5 },
  { id: 'clock', suffix: '缓行仪', verb: '节律调节', principle: '摆轮按照事情值得等待的程度计时，而非钟表上的刻度。', form: 6 },
  { id: 'carousel', suffix: '回旋台', verb: '循环整理', principle: '转台让未完成的事情经过同一个窗口，每次都比上次轻一点。', form: 7 }
];
const STANDARDS = ['不接受催促', '不得用于证明自己很忙', '每次使用后请保留一点余地', '允许偶尔没有效果', '若听见轻响，请当作设备在思考', '不保证让明天更有效率', '可与一杯温水共同使用', '请放在不必解释的地方'];
const SIDE_EFFECTS = ['每逢下雨会多出一枚没有用途的螺丝。', '使用者可能比设备先松一口气。', '放久以后，会给自己起另一个名字。', '有时会把说明书折成一只很小的船。', '靠近窗边时，它会忘记正在工作。', '夜深时，指针会偏向一段旧旋律。', '第二次使用可能获得一次不合时宜的晴天。', '会把无关紧要的小事郑重存档。', '偶尔拒绝工作，理由是“今天已经够了”。', '设备底部可能出现一张去往陌生街区的车票。', '需要留一格空白，防止愿望挤得太满。', '长时间不用，会长出一颗想出门的螺帽。'];
const EXAMINERS = ['第七号审查员', '夜班档案员', '窗边值班员', '临时发明委员会', '旧物保管员', '星期三事务员'];
const ABSURD = ['稍微偏离现实', '认真地不太有用', '有理有据地离谱', '基本不服从常识', '常识已自行请假'];

export function cleanName(value) {
  return Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\ufffe\uffff]/g, '').replace(/[\uD800-\uDFFF]/gu, '').trim()).slice(0, 28).join('');
}
export function normalizeOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const seed = Number(input.seed);
  const level = Number(input.level);
  return {
    seed: Number.isSafeInteger(seed) && seed > 0 && seed <= 0xffffffff ? seed : 104729,
    problem: PROBLEMS.some(p => p.id === input.problem) ? input.problem : 'dream',
    material: MATERIALS.some(m => m.id === input.material) ? input.material : 'copper',
    level: Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3,
    name: cleanName(input.name)
  };
}
export function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function invent(input = {}) {
  const options = normalizeOptions(input);
  const problem = PROBLEMS.find(p => p.id === options.problem);
  const material = MATERIALS.find(m => m.id === options.material);
  const index = PROBLEMS.indexOf(problem) * 1009 + MATERIALS.indexOf(material) * 97 + options.level * 17;
  const rand = randomSource((options.seed + index) >>> 0);
  const pick = list => list[Math.floor(rand() * list.length)];
  const mechanism = pick(MECHANISMS);
  const serial = `${options.seed.toString(36).toUpperCase().padStart(4, '0')}-${PROBLEMS.indexOf(problem).toString().padStart(2, '0')}${MATERIALS.indexOf(material)}`;
  return {
    options, problem, material, mechanism, serial,
    name: options.name || `${problem.noun}${mechanism.suffix}`,
    classification: ABSURD[options.level - 1],
    abstract: `${mechanism.verb}${problem.target}。${problem.result}`,
    principle: `${mechanism.principle}${material.note}。`,
    steps: [problem.instruction, `${['轻旋罐盖，给内容物留下刚好一口气的空间', '沿折线压下两侧铰链，直到多余的部分躲进夹层', '把两根天线朝向窗外，缓慢寻找最安静的频道', '顺时针摇动曲柄三次，听齿轮把分量慢慢卸下', '握住灯座等待片刻，让灯芯认出你带来的光', '张开伞面，站在影子的正中央，等边缘自然垂落', '拨动指针一次，再让摆锤按自己的节奏走', '将小事依次放进吊舱，轻推转台直到重心安稳'][mechanism.form]}。把状态停在“${['差不多', '不要紧', '再一会儿', '慢慢来', '刚刚好'][options.level - 1]}”。`, `当${['罐内出现一小段云', '折痕不再向外张望', '扬声器轻轻叹了一口气', '最小的齿轮停下来发呆', '玻璃上亮起一小团暖色', '伞沿滴下一滴并不存在的雨', '指针轻轻点头', '最后一只吊舱经过窗口'][mechanism.form]}时，停止操作。剩下的事交给它。`],
    caution: `${problem.side}${pick(SIDE_EFFECTS)}`,
    standard: pick(STANDARDS), examiner: pick(EXAMINERS),
    specs: [
      { label: '额定耐心', value: `${2 + Math.floor(rand() * 13)} 次深呼吸` },
      { label: '有效半径', value: `${['半张书桌', '一只口袋', '刚好两个人', '一小段走廊', '今天之内'][Math.floor(rand() * 5)]}` },
      { label: '空想转速', value: `${13 + Math.floor(rand() * 87) * options.level} 转念 / 分` },
      { label: '实用程度', value: `${Math.max(1, 12 - options.level * 2)}%（尚待证实）` }
    ],
    shape: { teeth: 10 + Math.floor(rand() * 8), rings: 2 + Math.floor(rand() * 3), offset: 16 + Math.floor(rand() * 25), spokes: 5 + Math.floor(rand() * 6), phase: Math.round(rand() * 360), bulbs: 2 + Math.floor(rand() * 4), pressure: 22 + Math.floor(rand() * 52) }
  };
}

export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const n = value => Number(value).toFixed(2).replace(/\.00$/, '');
function circle(cx, cy, r, extra = '') { return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${extra}/>`; }
function line(x1, y1, x2, y2, extra = '') { return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${extra}/>`; }
function gear(cx, cy, radius, teeth, phase) {
  let d = '';
  for (let i = 0; i < teeth * 4; i++) { const angle = (i / (teeth * 4) * 360 + phase) * Math.PI / 180; const r = i % 4 === 1 || i % 4 === 2 ? radius : radius * .85; d += `${i ? 'L' : 'M'}${n(cx + Math.cos(angle) * r)},${n(cy + Math.sin(angle) * r)} `; }
  return `<path d="${d}Z" fill="url(#hatch)"/>${circle(cx, cy, radius * .53)}${circle(cx, cy, 7)}`;
}
function annotation(x1, y1, x2, y2, text, align = 'start') { return `<g stroke-width="1" opacity=".74">${circle(x1, y1, 3, 'fill="#214764"')}${line(x1, y1, x2, y2)}${line(x2, y2, x2 + (align === 'end' ? -70 : 70), y2)}<text x="${x2 + (align === 'end' ? -7 : 7)}" y="${y2 - 9}" text-anchor="${align}" fill="#214764" stroke="none" font-size="12">${escapeXML(text)}</text></g>`; }
function chassis(inv) {
  const s = inv.shape;
  const top = 184, bottom = 560;
  let d = '';
  switch (inv.mechanism.form) {
    case 0:
      d = `<ellipse cx="460" cy="260" rx="132" ry="36" fill="url(#material)"/><path d="M328 260V485Q328 534 460 534Q592 534 592 485V260" fill="url(#material)"/><ellipse cx="460" cy="485" rx="132" ry="36" stroke-dasharray="5 6"/><path d="M360 243V219Q460 189 560 219V243" fill="url(#hatch)"/><path d="M422 216V193Q460 175 498 193V216"/>${Array.from({length:s.rings},(_,i)=>`<ellipse cx="460" cy="${310+i*47}" rx="${70+i*9}" ry="${15+i*2}" stroke-dasharray="${2+i} ${5+i}"/>`).join('')}<path d="M392 433Q414 369 444 405Q474 326 500 405Q537 379 534 433Z" fill="#c4a16a" fill-opacity=".17"/><path d="M339 303V480M581 303V480" opacity=".4"/>${circle(460, 446, 26)}${line(460,446,470,429)}`;
      break;
    case 1:
      d = `<path d="M290 455L395 250L555 223L661 450L493 535Z" fill="url(#material)"/><path d="M290 455L454 429L395 250M454 429L555 223M454 429L661 450M454 429L493 535"/><path d="M319 430L405 280L549 254L629 431L496 503Z" stroke-dasharray="5 7"/><path d="M343 395L501 369L579 402L420 429Z" fill="url(#hatch)"/>${[[-1,1],[1,1]].map(([sign])=>gear(460+sign*91,470,s.offset, s.teeth, s.phase)).join('')}<path d="M395 250L374 201M555 223L578 184"/><path d="M360 198L383 204M569 177L585 191"/>`;
      break;
    case 2:
      d = `<rect x="305" y="315" width="310" height="220" rx="18" fill="url(#material)"/><rect x="327" y="337" width="266" height="72" rx="4"/><path d="M342 373H578"/>${Array.from({length:17},(_,i)=>line(345+i*14,355,345+i*14,i%4===0?383:369)).join('')}<path d="M${354+s.offset} 337V408" stroke="#a66b3e" stroke-width="3"/>${circle(369,467,34)}${circle(369,467,23)}${line(369,467,380,450)}${Array.from({length:7},(_,i)=>line(442,438+i*10,577,438+i*10)).join('')}<path d="M460 315V269M443 269H477M432 256H488M375 314L333 214M545 314L587 214"/>${Array.from({length:s.rings},(_,i)=>`<path d="M${416-i*24} ${242-i*12}Q460 ${208-i*34} ${504+i*24} ${242-i*12}"/>`).join('')}`;
      break;
    case 3:
      d = `<rect x="332" y="268" width="240" height="228" rx="8" fill="url(#material)"/><path d="M350 268V218H554V268M350 496V527H554V496"/>${gear(438,374,76,s.teeth,s.phase)}${gear(551,420,42,s.teeth-3,s.phase+17)}<path d="M438 374H624V315H651"/>${circle(651,315,13,'fill="url(#hatch)"')}<path d="M304 302H332M304 435H332M572 302H605"/>${Array.from({length:s.bulbs},(_,i)=>`<rect x="${369+i*38}" y="${228-(i%2)*14}" width="25" height="${40+(i%2)*14}" fill="url(#hatch)"/>`).join('')}`;
      break;
    case 4:
      d = `<path d="M393 492L527 492L542 526H378Z" fill="url(#hatch)"/><path d="M445 486V452H475V486"/><path d="M365 270Q366 220 460 215Q554 220 555 270L526 437Q460 468 394 437Z" fill="url(#material)"/><ellipse cx="460" cy="272" rx="95" ry="24"/><path d="M406 225Q400 175 460 174Q520 175 514 225"/><path d="M460 417Q427 386 449 349Q460 331 462 300Q492 335 477 358Q508 392 460 417Z" fill="#c4a16a" fill-opacity=".27"/>${Array.from({length:s.spokes},(_,i)=>{const a= Math.PI*2*i/s.spokes;return line(460+Math.cos(a)*128,325+Math.sin(a)*113,460+Math.cos(a)*151,325+Math.sin(a)*137)}).join('')}${line(393,272,418,444)}${line(527,272,502,444)}`;
      break;
    case 5:
      d = `<path d="M268 333Q460 95 652 333Q608 294 572 333Q533 294 496 333Q460 294 423 333Q385 294 348 333Q311 294 268 333Z" fill="url(#material)"/><path d="M460 213V500Q460 545 416 527Q393 515 414 491"/><path d="M460 212Q360 258 348 333M460 212Q402 258 423 333M460 212Q518 258 496 333M460 212Q560 258 572 333M460 195V213"/>${Array.from({length:s.bulbs},(_,i)=>{const x=330+i*72;return `<path d="M${x} 365V${420+i%2*25}"/>${circle(x,427+i%2*25,8,'fill="url(#hatch)"')}`}).join('')}`;
      break;
    case 6:
      d = `<rect x="350" y="228" width="220" height="286" rx="80" fill="url(#material)"/>${circle(460,331,80)}${circle(460,331,66)}${Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return line(460+Math.cos(a)*59,331+Math.sin(a)*59,460+Math.cos(a)*70,331+Math.sin(a)*70)}).join('')}${line(460,331,460+Math.cos(s.phase*Math.PI/180)*52,331+Math.sin(s.phase*Math.PI/180)*52)}${line(460,331,432,312)}<path d="M460 411V469"/>${circle(460,473,s.offset)}<path d="M384 509L371 538M536 509L549 538M411 226V202H509V226"/><path d="M393 441Q405 479 430 490M527 441Q515 479 490 490" stroke-dasharray="4 5"/>`;
      break;
    default:
      d = `<ellipse cx="460" cy="463" rx="170" ry="57" fill="url(#material)"/><ellipse cx="460" cy="445" rx="170" ry="57"/><path d="M290 445V463M630 445V463M460 228V448"/>${circle(460,232,17,'fill="url(#hatch)"')}${Array.from({length:s.spokes},(_,i)=>{const a=i*Math.PI*2/s.spokes;const x=460+Math.cos(a)*128,y=320+Math.sin(a)*30;return `${line(460,249,x,y)}${line(x,y,x,y+95)}<rect x="${n(x-16)}" y="${n(y+75)}" width="32" height="44" rx="7" fill="url(#material)"/>`}).join('')}<path d="M400 513V534H520V513"/>${gear(460,445,35,s.teeth,s.phase)}`;
  }
  const marks = [
    [[328,320,'A · 双层回声壁'],[460,446,'B · 慢一点刻度'],[460,534,'C · 留白罐底']],
    [[395,250,'A · 折页入口'],[551,470,'B · 回卷齿轮'],[493,535,'C · 折叠支点']],
    [[375,314,'A · 偏心天线'],[510,467,'B · 叹气扬声器'],[369,467,'C · 安静频道旋钮']],
    [[395,250,'A · 轻量进料口'],[551,420,'B · 转念齿轮'],[438,374,'C · 手摇曲柄轴']],
    [[365,270,'A · 余温玻璃罩'],[460,375,'B · 留光灯芯'],[460,492,'C · 暖意底座']],
    [[348,333,'A · 放空伞骨'],[572,333,'B · 筛声伞沿'],[416,527,'C · 慢弯伞柄']],
    [[411,226,'A · 提醒提梁'],[460,331,'B · 从容指针'],[460,473,'C · 耐心摆锤']],
    [[460,232,'A · 转念轴承'],[588,415,'B · 小事吊舱'],[460,445,'C · 重心齿轮']]
  ][inv.mechanism.form];
  return `<g stroke="#214764" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round">${d}${annotation(marks[0][0],marks[0][1],225,282,marks[0][2], 'end')}${annotation(marks[1][0],marks[1][1],690,382,marks[1][2])}${annotation(marks[2][0],marks[2][1],612,570,marks[2][2])}${line(276,590,646,590,'stroke-width="1"')}${line(276,582,276,598)}${line(646,582,646,598)}<text x="460" y="610" text-anchor="middle" stroke="none" fill="#214764" font-size="12">比例 1 : ${inv.options.level + 1} 的想象</text></g>`;
}
function textLines(value, width = 28) { const chars = Array.from(value); const rows=[]; while(chars.length) rows.push(chars.splice(0,width).join('')); return rows; }
export function renderBlueprint(inv, compact = false) {
  const height = compact ? 670 : 1120;
  const abstract = textLines(inv.abstract, 39).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 ${height}" role="img" aria-labelledby="blueprint-title blueprint-desc"><title id="blueprint-title">${escapeXML(inv.name)} · 虚构专利蓝图</title><desc id="blueprint-desc">${escapeXML(inv.abstract)}</desc><defs><pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#214764" stroke-opacity=".055" stroke-width="1"/></pattern><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="8" stroke="#214764" stroke-width="1" stroke-opacity=".16"/></pattern><pattern id="material" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${inv.material.color}" fill-opacity=".10"/>${materialTexture(inv.material.texture)}</pattern></defs><rect width="920" height="${height}" fill="#f4eedf"/><rect x="22" y="22" width="876" height="${height-44}" fill="url(#grid)" stroke="#214764" stroke-opacity=".35"/><g fill="#214764" font-family="'PingFang SC','Microsoft YaHei',sans-serif"><text x="58" y="69" font-size="12" letter-spacing="3">无用发明局 / USELESS INVENTIONS BUREAU</text><text x="862" y="69" text-anchor="end" font-size="11">档案 ${escapeXML(inv.serial)}</text><path d="M58 88H862" stroke="#214764" stroke-opacity=".35"/><text x="58" y="136" font-size="${inv.name.length > 17 ? 23 : 32}" font-family="'Songti SC','STSong',serif">${escapeXML(inv.name)}</text><text x="58" y="162" font-size="11" opacity=".67">材料：${escapeXML(inv.material.label)} · ${escapeXML(inv.classification)}</text></g>${chassis(inv)}${compact ? '' : `<g fill="#214764" font-family="'PingFang SC','Microsoft YaHei',sans-serif"><path d="M58 655H862" stroke="#214764" stroke-opacity=".35"/><text x="58" y="690" font-size="12" letter-spacing="3">发明摘要 / ABSTRACT</text>${abstract.map((row,i)=>`<text x="58" y="${724+i*25}" font-size="16">${escapeXML(row)}</text>`).join('')}<path d="M58 809H862" stroke="#214764" stroke-opacity=".25"/>${inv.specs.map((spec,i)=>{const x=i%2?490:58,y=850+Math.floor(i/2)*64;return `<text x="${x}" y="${y}" font-size="11" opacity=".6">${escapeXML(spec.label)}</text><text x="${x}" y="${y+26}" font-size="17">${escapeXML(spec.value)}</text>`}).join('')}<g transform="translate(728 994) rotate(-12)" fill="none" stroke="#a45f42"><rect x="-107" y="-31" width="214" height="62" rx="3" stroke-width="2"/><rect x="-101" y="-25" width="202" height="50" stroke-width=".7"/><text x="0" y="7" text-anchor="middle" stroke="none" fill="#a45f42" font-size="20" letter-spacing="3">实用性暂不受理</text></g><text x="58" y="1008" font-size="12">审查意见：${escapeXML(inv.standard)}</text><text x="58" y="1034" font-size="11" opacity=".6">签字：${escapeXML(inv.examiner)}</text><path d="M58 1062H862" stroke="#214764" stroke-opacity=".25"/><text x="58" y="1087" font-size="10" opacity=".6">CMC · 纯属空想，欢迎认真收藏。</text><text x="862" y="1087" text-anchor="end" font-size="10" opacity=".6">FIG. 0${inv.mechanism.form + 1} / SEED ${inv.options.seed}</text></g>`}</svg>`;
}
function materialTexture(type) {
  if (type === 'glass' || type === 'porcelain') return '<path d="M2 19L19 2M12 23L23 12" stroke="#214764" stroke-opacity=".12"/>';
  if (type === 'wood' || type === 'paper') return '<path d="M0 8Q6 3 12 8T24 8M0 18Q6 13 12 18T24 18" fill="none" stroke="#214764" stroke-opacity=".1"/>';
  if (type === 'cloud' || type === 'moon') return '<circle cx="8" cy="8" r="3" fill="none" stroke="#214764" stroke-opacity=".1"/><circle cx="19" cy="20" r="1" fill="#214764" fill-opacity=".1"/>';
  if (type === 'thread') return '<path d="M0 0L24 24M24 0L0 24" stroke="#214764" stroke-opacity=".08"/>';
  return '<circle cx="6" cy="6" r="1" fill="#214764" fill-opacity=".18"/><circle cx="18" cy="18" r="1" fill="#214764" fill-opacity=".18"/>';
}

export function shareURL(base, input) {
  const o = normalizeOptions(input), url = new URL(base);
  url.search = ''; url.hash = '';
  url.searchParams.set('s', o.seed); url.searchParams.set('p', o.problem); url.searchParams.set('m', o.material); url.searchParams.set('a', o.level);
  if (o.name) url.searchParams.set('n', o.name);
  return url.href;
}
export function readShare(input) {
  const query = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  return normalizeOptions({ seed: query.get('s'), problem: query.get('p'), material: query.get('m'), level: query.get('a'), name: query.get('n') });
}
export function restoreFavorites(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.filter(item => item && typeof item === 'object' && item.version === VERSION && item.options && typeof item.options === 'object' && !Array.isArray(item.options) && Number.isSafeInteger(item.options.seed) && item.options.seed > 0 && item.options.seed <= 0xffffffff && PROBLEMS.some(p => p.id === item.options.problem) && MATERIALS.some(m => m.id === item.options.material) && Number.isInteger(item.options.level) && item.options.level >= 1 && item.options.level <= 5).map(item => ({ version: VERSION, options: normalizeOptions(item.options) })).filter(item => {
    const key = favoriteKey(item.options);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 24);
}
export const favoriteKey = input => { const o=normalizeOptions(input);return `${o.seed}|${o.problem}|${o.material}|${o.level}|${o.name}`; };

export function readArchive(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return { last: null, favorites: [] };
    return { last: parsed.last && typeof parsed.last === 'object' ? normalizeOptions(parsed.last) : null, favorites: restoreFavorites(parsed.favorites) };
  } catch { return { last: null, favorites: [] }; }
}
