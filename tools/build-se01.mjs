// 从 SE01_卡表.md 解析 148 名目，生成 js/engine/cards.se01.js。
// 唯一数据源是卡表 Markdown；不要手改生成物。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
// 卡表快照随仓库分发（docs/），保证 clone 后可直接构建；
// 若仓库外的权威卡表存在，仍以它为准，避免本地与设计稿不同步。
const LOCAL_MD = path.resolve(ROOT, 'docs/SE01_卡表.md');
const EXTERNAL_MD = path.resolve(ROOT, '../Soul Echo灵魂回响（以创之界限规则为灵感）/第一弹_第一声回响/SE01_卡表.md');
const MD = fs.existsSync(EXTERNAL_MD) ? EXTERNAL_MD : LOCAL_MD;
if (!fs.existsSync(MD)) throw new Error(`找不到卡表：${MD}`);
const OUT = path.resolve(ROOT, 'js/engine/cards.se01.js');

const COLOR_CODE = { W: '白', B: '黑', R: '红', U: '蓝', P: '紫', G: '绿', Y: '黄', C: '灰' };
const RARITY = new Set(['微响', '叠响', '共鸣', '绝响']);

const text = fs.readFileSync(MD, 'utf8');
const lines = text.split(/\r?\n/);

const cellsOf = (line) => line.replace(/\\\|/g, '｜').split('|').slice(1, -1).map((s) => s.trim());

function parseCost(raw) {
  const [totalPart, rest] = raw.split('｜');
  const total = Number(totalPart);
  if (!rest) throw new Error(`费用缺少分隔：${raw}`);
  const [coloredPart, greyPart] = rest.split('/');
  let grey = Number((greyPart || '0').replace(/[^\d]/g, '') || 0);
  const colors = {};
  let colored = 0;
  if (/^\d+$/.test(coloredPart)) {
    colored = Number(coloredPart);
  } else {
    const re = /([白黑红蓝紫绿黄灰])(\d+)/g;
    let m;
    while ((m = re.exec(coloredPart))) { colors[m[1]] = (colors[m[1]] || 0) + Number(m[2]); }
    if (colors.灰) { grey += colors.灰; delete colors.灰; }
    colored = Object.values(colors).reduce((a, b) => a + b, 0);
  }
  if (!Object.keys(colors).length && colored > 0) colors.__single = colored;
  return { total, colored, grey, colors };
}

function parseStats(raw) {
  if (!raw || raw === '—') return { attack: null, impact: null, vitality: null };
  const parts = raw.split('/').map((s) => s.trim());
  const num = (v) => (v === '—' ? null : Number(v));
  return { attack: num(parts[0]), impact: num(parts[1]), vitality: num(parts[2]) };
}

const cards = [];
for (const line of lines) {
  if (!line.startsWith('| SE01-')) continue;
  const c = cellsOf(line);
  if (c.length < 9) continue;
  const [code, nameRaw, type, rarity, costRaw, statsRaw, keywordsRaw, effectRaw, triggerRaw] = c;
  const m = code.match(/^SE01-([WBRUPGYC])-(\d{3})$/);
  if (m) {
    const color = COLOR_CODE[m[1]];
    const id = `se${m[1].toLowerCase()}${m[2]}`;
    const name = nameRaw.replace(/\s*\(R\)\s*$/, '').trim();
    const cost = parseCost(costRaw);
    const stats = parseStats(statsRaw);
    const triggerCode = (triggerRaw.match(/^(LT|ST|MT|CT)/) || [])[1] || '—';
    cards.push({
      id, code, name, type, rarity, color, set: 'SE01',
      reprint: /\(R\)/.test(nameRaw),
      cost: {
        total: cost.total,
        colored: cost.colored,
        grey: cost.grey,
        ...(Object.keys(cost.colors).some((k) => k !== '__single') ? { colors: cost.colors } : {}),
      },
      attack: stats.attack, impact: stats.impact, vitality: stats.vitality,
      keywords: keywordsRaw && keywordsRaw !== '—' ? keywordsRaw.split(/\s+/).filter(Boolean) : [],
      text: effectRaw === '—' ? '' : effectRaw,
      trigger: triggerCode,
      triggerText: triggerRaw === '—' ? '' : triggerRaw,
      note: '',
    });
    continue;
  }
  const sm = code.match(/^SE01-M-(\d{3})$/);
  if (sm) {
    const id = `sem${sm[1]}`;
    const cost = parseCost(costRaw);
    const stats = parseStats(statsRaw);
    const triggerCode = (triggerRaw.match(/^(LT|ST|MT|CT)/) || [])[1] || '—';
    cards.push({
      id, code, name: nameRaw.replace(/\s*\(R\)\s*$/, '').trim(), type, rarity,
      color: Object.keys(cost.colors)[0] || '灰', set: 'SE01', mixed: true, reprint: false,
      cost: { total: cost.total, colored: cost.colored, grey: cost.grey, colors: cost.colors },
      attack: stats.attack, impact: stats.impact, vitality: stats.vitality,
      keywords: keywordsRaw && keywordsRaw !== '—' ? keywordsRaw.split(/\s+/).filter(Boolean) : [],
      text: effectRaw === '—' ? '' : effectRaw,
      trigger: triggerCode,
      triggerText: triggerRaw === '—' ? '' : triggerRaw,
      note: '',
    });
  }
}

// 灵体
const spirits = [];
for (const line of lines) {
  if (!line.startsWith('| SE01-S-')) continue;
  const c = cellsOf(line);
  if (c.length < 4) continue;
  const [code, name, color, ability] = c;
  spirits.push({ id: `se${code.slice(-3)}`, code, name, color, type: '灵体', text: ability });
}

const byColor = {};
for (const c of cards) byColor[c.color] = (byColor[c.color] || 0) + 1;
const byRarity = {};
for (const c of cards) byRarity[c.rarity] = (byRarity[c.rarity] || 0) + 1;

console.log('卡牌', cards.length, '灵体', spirits.length);
console.log('色分布', byColor);
console.log('稀有度', byRarity);
console.log('混色', cards.filter((c) => c.mixed).length);
console.log('样例', JSON.stringify(cards.find((c) => c.code === 'SE01-W-001'), null, 1));
console.log('混色样例', JSON.stringify(cards.find((c) => c.mixed), null, 1));
console.log('灵体样例', JSON.stringify(spirits[0], null, 1));

const header = `// 由 tools/build-se01.mjs 从 SE01_卡表.md 生成；请勿手改。
// 148 名目：七色＋灰 128、灵体 8、混色 12。
`;
const body = `export const SE01_CARDS = ${JSON.stringify(cards, null, 2)};\n\nexport const SE01_SPIRITS = ${JSON.stringify(spirits, null, 2)};\n`;
fs.writeFileSync(OUT, header + body, 'utf8');
console.log('已写入', OUT);
