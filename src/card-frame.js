/**
 * 灵魂回响 · 基本卡图框架（SVG）
 *
 * 按《卡牌基础模版.png》的分区重绘：左上双费圈、顶部卡名与类型、右上触发标记、
 * 中部卡图、词条条、效果文本框、底部攻击力／冲击力与生命力。
 * 纯字符串输出，不依赖 DOM，可在浏览器、Node 与导出脚本中共用。
 */

export const FRAME = Object.freeze({ width: 630, height: 880 });

/** 八色取自观战台 oklch 变量换算出的十六进制，保证与站点配色同源。 */
export const COLOR_HEX = Object.freeze({
  白: '#dcc17f', 黑: '#677380', 红: '#e8594d', 蓝: '#519fdd',
  绿: '#5dad70', 黄: '#cfb656', 紫: '#af73c9', 灰: '#94a1a4',
});

export const RARITY_PIPS = Object.freeze({ 微响: 1, 叠响: 2, 共鸣: 3, 绝响: 4 });

const FONT_SERIF = "'Noto Serif SC','Songti SC','SimSun',serif";
const FONT_SANS = "'Noto Sans SC','Microsoft YaHei','PingFang SC',sans-serif";

let seq = 0;
const nextId = (p) => `${p}${(++seq).toString(36)}`;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');
const colorOf = (c) => COLOR_HEX[c] || COLOR_HEX.灰;

/** 粗略字宽：全角按 1em，半角按 0.55em，够 CJK 卡面排版用。 */
function charWidth(ch, size) {
  if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) return size;
  if (ch === ' ') return size * 0.3;
  return size * 0.55;
}

function wrap(text, maxWidth, size) {
  const lines = [];
  for (const raw of String(text ?? '').split('\n')) {
    let line = '';
    let width = 0;
    for (const ch of raw) {
      const w = charWidth(ch, size);
      if (width + w > maxWidth && line) { lines.push(line); line = ''; width = 0; }
      line += ch;
      width += w;
    }
    lines.push(line);
  }
  return lines;
}

/** 卡图占位：品牌六边形＋眼形，按卡色着色；有 art 时直接嵌图。 */
function artLayer(card, id, color) {
  const { x, y, w, h } = artRect(card);
  if (card.art) {
    return `<image href="${esc(card.art)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}-clip)"/>`;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = 3.1;
  return `<g opacity=".9">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="url(#${id}-art)"/>
    <g transform="translate(${cx - 22 * s},${cy - 22 * s}) scale(${s})" opacity=".3">
      <path d="M22 3 38 12v20L22 41 6 32V12Z" fill="none" stroke="${color}" stroke-width="1.1"/>
      <path d="M13 23c4-11 14-11 18 0-4 11-14 11-18 0Z" fill="none" stroke="${color}" stroke-width="1.1"/>
      <circle cx="22" cy="23" r="3.2" fill="${color}"/>
    </g>
    <text x="${cx}" y="${y + h - 16}" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" letter-spacing="6" fill="${color}" opacity=".45">卡图</text>
  </g>`;
}

function artRect(card) {
  const tall = card.type === '灵体';
  return { x: 40, y: 148, w: 550, h: tall ? 400 : 356 };
}

function costLayer(card, id, color) {
  if (card.type === '灵体') return '';
  const total = card.cost?.total ?? 0;
  const grey = card.cost?.grey ?? 0;
  const colored = card.cost?.colored ?? Math.max(0, total - grey);
  const big = `<g>
    <circle cx="66" cy="70" r="33" fill="#0b1416" stroke="${color}" stroke-width="2.5"/>
    <circle cx="66" cy="70" r="27" fill="none" stroke="${color}" stroke-width="1" opacity=".45"/>
    <text x="66" y="70" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SERIF}" font-size="31" font-weight="700" fill="${color}">${colored}</text>
  </g>`;
  const small = grey > 0 ? `<g>
    <circle cx="112" cy="108" r="21" fill="#151f21" stroke="#94a1a4" stroke-width="1.8"/>
    <text x="112" y="108" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SERIF}" font-size="19" font-weight="700" fill="#c3cccd">${grey}</text>
  </g>` : '';
  return `<g>${big}${small}</g>`;
}

function triggerLayer(card, color) {
  if (card.type === '灵体') return '';
  const trig = card.trigger && card.trigger !== '—' ? card.trigger : '—';
  const accent = /CT|MT/.test(trig) ? COLOR_HEX.红 : color;
  const label = trig === '—' ? '' : trig;
  return `<g>
    <circle cx="566" cy="70" r="27" fill="#0b1416" stroke="${accent}" stroke-width="2"/>
    ${label
    ? `<text x="566" y="70" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="17" font-weight="700" letter-spacing=".5" fill="${accent}">${esc(label)}</text>`
    : `<path d="M566 57 577 70 566 83 555 70Z" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".7"/>`}
  </g>`;
}

function keywordLayer(card, color) {
  const kws = (card.keywords || []).filter(Boolean);
  const y = artRect(card).y + artRect(card).h + 12;
  if (!kws.length) {
    return `<g><line x1="40" y1="${y + 15}" x2="590" y2="${y + 15}" stroke="#39484b" stroke-width="1" opacity=".8"/>
      <text x="315" y="${y + 15}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="14" fill="#6f8285">无词条</text></g>`;
  }
  let x = 40;
  const chips = [];
  for (const k of kws) {
    const w = Math.max(58, [...k].reduce((s, ch) => s + charWidth(ch, 18), 0) + 26);
    if (x + w > 590) break;
    chips.push(`<g><rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="${color}" opacity=".16"/>
      <rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="none" stroke="${color}" stroke-width="1" opacity=".55"/>
      <text x="${x + w / 2}" y="${y + 15}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="17" font-weight="600" fill="${color}" letter-spacing="1">${esc(k)}</text></g>`);
    x += w + 8;
  }
  return `<g>${chips.join('')}</g>`;
}

/** 逐档缩字号直到放得下；仍放不下才截断，避免长文本静默溢出。 */
function fitText(text, maxWidth, maxHeight) {
  const steps = [[21, 32], [20, 30], [19, 29], [18, 27], [17, 26], [16, 25], [15, 24], [14, 22]];
  for (const [size, lineH] of steps) {
    const lines = wrap(text, maxWidth, size);
    if (lines.length * lineH <= maxHeight) return { size, lineH, lines };
  }
  const [size, lineH] = steps[steps.length - 1];
  return { size, lineH, lines: wrap(text, maxWidth, size).slice(0, Math.floor(maxHeight / lineH)) };
}

function textLayer(card, color) {
  const top = artRect(card).y + artRect(card).h + 56;
  const h = 744 - top;
  const fitted = String(card.text || '').trim() ? fitText(card.text, 508, h - 40) : null;
  const lines = fitted ? fitted.lines : [];
  const size = fitted ? fitted.size : 21;
  const lineH = fitted ? fitted.lineH : 32;
  const body = lines.map((l, i) => `<tspan x="62" dy="${i ? lineH : 0}">${esc(l)}</tspan>`).join('');
  return `<g>
    <rect x="40" y="${top}" width="550" height="${h}" rx="10" fill="#070f11" opacity=".62"/>
    <rect x="40" y="${top}" width="550" height="${h}" rx="10" fill="none" stroke="${color}" stroke-width="1" opacity=".22"/>
    ${lines.length
    ? `<text x="62" y="${top + 38}" font-family="${FONT_SANS}" font-size="${size}" fill="#e9e4da">${body}</text>`
    : `<text x="315" y="${top + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="17" fill="#6f8285" letter-spacing="2">无效果文本</text>`}
  </g>`;
}

function statCell(x, w, y, value, label, color, big = 38) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="72" rx="10" fill="#070f11" opacity=".58"/>
    <rect x="${x}" y="${y}" width="${w}" height="72" rx="10" fill="none" stroke="${color}" stroke-width="1" opacity=".28"/>
    <text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SERIF}" font-size="${big}" font-weight="700" fill="#e9e4da">${esc(value)}</text>
    <text x="${x + w / 2}" y="${y + 58}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="13" letter-spacing="2" fill="#8fa2a4">${esc(label)}</text>
  </g>`;
}

function statLayer(card, color) {
  const y = 752;
  if (card.type === '灵体') {
    return `<g><rect x="40" y="${y}" width="550" height="72" rx="10" fill="#070f11" opacity=".58"/>
      <rect x="40" y="${y}" width="550" height="72" rx="10" fill="none" stroke="${color}" stroke-width="1" opacity=".28"/>
      <text x="315" y="${y + 26}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="17" font-weight="600" fill="${color}" letter-spacing="3">灵体 · 不计入主卡组</text>
      <text x="315" y="${y + 52}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SANS}" font-size="13" fill="#8fa2a4">无费用 · 无攻击力 · 无生命力</text></g>`;
  }
  if (card.type === '灵像') {
    return `<g>${statCell(40, 128, y, num(card.attack), '攻击力', color)}${statCell(176, 128, y, num(card.impact), '冲击力', color)}${statCell(318, 272, y, num(card.vitality), '生命力', color)}</g>`;
  }
  if (card.type === '灵性') {
    return `<g>${statCell(40, 260, y, '灵性', '不参与战斗', color, 22)}${statCell(318, 272, y, num(card.vitality), '生命力', color)}</g>`;
  }
  const trig = card.trigger && card.trigger !== '—' ? card.trigger : '无触发';
  return `<g>${statCell(40, 260, y, '灵感', trig === '无触发' ? '使用后进入分解区' : `触发 ${trig}`, color, 22)}${statCell(318, 272, y, '—', '无面板数值', color, 22)}</g>`;
}

function footerLayer(card, color) {
  const pips = RARITY_PIPS[card.rarity] || 0;
  const rarity = card.rarity || '';
  const rarityWidth = [...rarity].reduce((s, ch) => s + charWidth(ch, 13), 0) + Math.max(0, [...rarity].length - 1) * 2;
  const pipRight = 590 - rarityWidth - 12;
  const step = 16;
  const pipsSvg = Array.from({ length: pips }, (_, i) => {
    const cx = pipRight - (pips - 1 - i) * step;
    return `<path d="M${cx} 838 ${cx + 5} 847 ${cx} 856 ${cx - 5} 847Z" fill="${color}" opacity=".85"/>`;
  }).join('');
  return `<g>
    <text x="40" y="850" font-family="${FONT_SANS}" font-size="13" letter-spacing="1.5" fill="#7f9294">${esc(card.code || '')}</text>
    <text x="590" y="850" text-anchor="end" font-family="${FONT_SANS}" font-size="13" letter-spacing="2" fill="${color}" opacity=".9">${esc(rarity)}</text>
    ${pipsSvg}
  </g>`;
}

/**
 * 生成一张卡的完整卡面。
 * @param {object} card 卡牌数据（CARD_DATA / SPIRIT_DATA 的条目）
 * @param {{ annotated?: boolean, art?: string }} [opts]
 */
export function cardFrameSVG(card, opts = {}) {
  const id = nextId('cf');
  const color = colorOf(card.color);
  const mixed = card.mixed ? `<tspan fill="${COLOR_HEX.黄}"> · 混色</tspan>` : '';
  const sub = card.type === '灵体'
    ? `灵体${mixed}`
    : `${card.type || ''}${mixed}`;
  const costText = card.type === '灵体' ? '' : costLine(card);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME.width} ${FRAME.height}" width="${FRAME.width}" height="${FRAME.height}" role="img" aria-label="${esc(card.name)} 卡面">
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#152123"/><stop offset=".55" stop-color="#101a1c"/><stop offset="1" stop-color="#0a1213"/>
    </linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset=".5" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity=".85"/>
    </linearGradient>
    <linearGradient id="${id}-art" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".14"/><stop offset="1" stop-color="${color}" stop-opacity=".04"/>
    </linearGradient>
    <clipPath id="${id}-clip"><rect x="${artRect(card).x}" y="${artRect(card).y}" width="${artRect(card).w}" height="${artRect(card).h}" rx="12"/></clipPath>
  </defs>
  <rect x="8" y="8" width="614" height="864" rx="32" fill="url(#${id}-bg)" stroke="url(#${id}-edge)" stroke-width="4"/>
  <rect x="20" y="20" width="590" height="840" rx="24" fill="none" stroke="${color}" stroke-width="1" opacity=".3"/>
  <rect x="116" y="32" width="398" height="60" rx="8" fill="#0a1315" opacity=".8"/>
  <rect x="116" y="32" width="398" height="60" rx="8" fill="none" stroke="${color}" stroke-width="1.2" opacity=".7"/>
  <text x="315" y="63" text-anchor="middle" dominant-baseline="central" font-family="${FONT_SERIF}" font-size="33" font-weight="700" letter-spacing="3" fill="#f2ede3">${esc(card.name)}</text>
  <text x="315" y="110" text-anchor="middle" font-family="${FONT_SANS}" font-size="15" letter-spacing="3" fill="#8fa2a4">${sub}${costText}</text>
  ${costLayer(card, id, color)}
  ${triggerLayer(card, color)}
  ${artLayer(card, id, color)}
  ${keywordLayer(card, color)}
  ${textLayer(card, color)}
  ${statLayer(card, color)}
  ${footerLayer(card, color)}
</svg>`;
}

function costLine(card) {
  const colors = card.cost?.colors || {};
  const parts = Object.entries(colors).map(([c, n]) => `${c}${n}`);
  if (card.cost?.grey) parts.push(`灰${card.cost.grey}`);
  return parts.length ? `　${parts.join(' ')}` : '';
}

/** 结构标注版：用于说明各分区含义，对应原《卡牌基础模版》的引线图。 */
export function annotatedFrameSVG(card = { name: '卡名', type: '灵像', color: '白', cost: { total: 5, colored: 4, grey: 1 }, attack: 5000, impact: 2, vitality: 6000, keywords: ['守护', '自愈'], text: '效果文本在此换行显示，按卡面宽度自动折行。', trigger: 'CT', rarity: '绝响', code: 'SE01-W-000' }) {
  const scale = 0.9;
  const ox = 190;
  const oy = 24;
  const callouts = [
    { side: 'l', x: 66, y: 70, ty: 54, label: '同色灵能', note: '与卡牌同色的灵能' },
    { side: 'l', x: 112, y: 108, ty: 128, label: '灰色灵能', note: '任意颜色均可支付' },
    { side: 'l', x: 44, y: 330, ty: 300, label: '卡图', note: '版面主体' },
    { side: 'l', x: 44, y: 536, ty: 520, label: '词条', note: '固定能力短标签' },
    { side: 'l', x: 60, y: 788, ty: 764, label: '攻击力／冲击力', note: '战斗／打生命' },
    { side: 'r', x: 514, y: 62, ty: 54, label: '卡名', note: '' },
    { side: 'r', x: 514, y: 110, ty: 118, label: '卡牌类型', note: '灵像／灵感／灵性／灵体' },
    { side: 'r', x: 566, y: 70, ty: 190, label: '触发标记', note: 'LT／ST／MT／CT' },
    { side: 'r', x: 586, y: 650, ty: 640, label: '效果文本', note: '按卡面宽度自动折行' },
    { side: 'r', x: 586, y: 788, ty: 782, label: '生命力', note: '灵像与灵性才有' },
    { side: 'r', x: 586, y: 850, ty: 862, label: '编号／稀有度', note: '' },
  ];
  const lines = callouts.map((c) => {
    const px = ox + c.x * scale;
    const py = oy + c.y * scale;
    const lx = c.side === 'l' ? ox - 18 : ox + FRAME.width * scale + 18;
    const tx = c.side === 'l' ? lx - 8 : lx + 8;
    const anchor = c.side === 'l' ? 'end' : 'start';
    return `<g>
      <line x1="${lx}" y1="${c.ty}" x2="${px}" y2="${py}" stroke="#d09945" stroke-width="1" opacity=".55"/>
      <circle cx="${px}" cy="${py}" r="3.2" fill="#d09945"/>
      <circle cx="${lx}" cy="${c.ty}" r="2.4" fill="#d09945" opacity=".8"/>
      <text x="${tx}" y="${c.ty - 3}" text-anchor="${anchor}" font-family="${FONT_SANS}" font-size="15" font-weight="600" fill="#e9e4da">${esc(c.label)}</text>
      ${c.note ? `<text x="${tx}" y="${c.ty + 15}" text-anchor="${anchor}" font-family="${FONT_SANS}" font-size="12" fill="#8fa2a4">${esc(c.note)}</text>` : ''}
    </g>`;
  }).join('');
  const legend = Object.entries(COLOR_HEX).map(([name, hex], i) => `<g transform="translate(${210 + i * 76},946)">
      <rect x="-11" y="-11" width="22" height="22" rx="5" fill="none" stroke="${hex}" stroke-width="2"/>
      <text x="0" y="26" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" fill="#8fa2a4">${name}</text>
    </g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 990" width="1000" height="990" role="img" aria-label="基本卡图框架结构图">
  <rect width="1000" height="990" fill="#0d1618"/>
  <g transform="translate(${ox},${oy}) scale(${scale})">${cardFrameSVG(card).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g>
  ${lines}
  <text x="500" y="916" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" letter-spacing="3" fill="#8fa2a4">卡框颜色＝卡牌颜色　·　尺寸 63×88mm　·　viewBox 630×880</text>
  ${legend}
  </svg>`;
}

/** 无标注的空框，用作模板底稿。 */
export function blankFrameSVG(color = '灰') {
  return cardFrameSVG({
    name: '卡名', type: '灵像', color, cost: { total: 0, colored: 0, grey: 0 },
    attack: 0, impact: 0, vitality: 0, keywords: [], text: '', trigger: '—', rarity: '', code: '',
  });
}
