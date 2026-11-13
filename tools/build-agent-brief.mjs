/**
 * 从 cards.se01.js 生成面向 AI 脚本作者的纯卡面清单（agents/brief/03-卡池.md）。
 * 只导出卡面字段：编号 / 卡名 / 类型 / 稀有度 / 费用 / 面板 / 关键词 / 效果文本 / 触发。
 * 不导出任何胜率、平衡结论、实测记录或引擎内部评分——卡池文件必须是纯规则事实。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_DATA, SPIRIT_DATA } from '../js/engine/cards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'agents/brief/03-卡池.md');

const ORDER = ['白', '黑', '红', '蓝', '紫', '绿', '黄', '灰'];
const TYPE_ORDER = ['灵像', '灵感', '灵性'];

const fmtCost = (c) => {
  const parts = Object.entries(c.colors || {}).map(([k, v]) => `${k}${v}`);
  const colored = parts.length ? parts.join('') : (c.colored ? `同色${c.colored}` : '');
  const grey = c.grey ? `＋灰${c.grey}` : '';
  return `${c.total}｜${colored || '0'}${grey}`;
};

const fmtStats = (d) => {
  if (d.type === '灵像') return `${d.attack} / ${d.impact} / ${d.vitality}`;
  if (d.type === '灵性') return `— / — / ${d.vitality}`;
  return '—';
};

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

const groups = [];
for (const color of ORDER) {
  const list = CARD_DATA.filter((d) => d.color === color && !d.mixed)
    .sort((a, b) => a.code.localeCompare(b.code));
  if (list.length) groups.push({ title: `${color}（${list.length} 张）`, list });
}
const mixed = CARD_DATA.filter((d) => d.mixed).sort((a, b) => a.code.localeCompare(b.code));
if (mixed.length) groups.push({ title: `混色（${mixed.length} 张，同一张卡需两种颜色灵能）`, list: mixed });

const lines = [];
lines.push('# SE01《第一声回响》卡池');
lines.push('');
lines.push('> 本文件由引擎卡数据自动生成，只含卡面事实。你需要的全部卡牌信息都在这里。');
lines.push(`> 主卡组共 ${CARD_DATA.length} 个卡名；另有 ${SPIRIT_DATA.length} 个灵体不进入主卡组，单独选择 1 个。`);
lines.push('');
lines.push('## 读表说明');
lines.push('');
lines.push('- **费用**写作 `总费｜颜色费用＋灰费`。例：`4｜白2黑1＋灰1` 表示总费 4，需 2 点白色灵能、1 点黑色灵能、1 点任意颜色灵能（灰费可由任何颜色的灵能支付）。');
lines.push('- `同色3` 表示 3 点费用须由该卡自身颜色支付。');
lines.push('- **面板**为 `攻击 / 冲击 / 生命力`。灵性卡无攻击与冲击，只有生命力，可被攻击但不能攻击或阻挡。');
lines.push('- **关键词**只写名字，含义见 `01-接口约定.md` 的关键词表。');
lines.push('');
lines.push('## 卡牌一览');
lines.push('');

for (const g of groups) {
  lines.push(`### ${g.title}`);
  lines.push('');
  lines.push('| 编号 | 卡名 | 类型 | 稀有度 | 费用 | 攻/冲/生 | 关键词 | 效果 |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const d of g.list) {
    lines.push(`| ${d.code} | ${esc(d.name)} | ${d.type} | ${d.rarity} | ${fmtCost(d.cost)} | ${fmtStats(d)} | ${esc((d.keywords || []).join('、') || '—')} | ${esc(d.text || '—')} |`);
  }
  lines.push('');
}

lines.push(`### 灵体（${SPIRIT_DATA.length} 个，构筑时选 1 个，不占主卡组）`);
lines.push('');
lines.push('| 编号 | 卡名 | 颜色 | 能力 |');
lines.push('|---|---|---|---|');
for (const s of [...SPIRIT_DATA].sort((a, b) => a.code.localeCompare(b.code))) {
  lines.push(`| ${s.code} | ${esc(s.name)} | ${s.color} | ${esc(s.text)} |`);
}
lines.push('');
lines.push('> 八色灵体都另有一个**专属启动能力**，与通用能力（横置检视主卡组顶 1 张，或支付 1 点同色灵能将其揭示入手）共用同一次横置，一回合二选一。专属能力的内容与上表能力同源，具体见各灵体卡面。');
lines.push('');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`已生成 ${path.relative(ROOT, OUT)}：${CARD_DATA.length} 个主卡组卡名 + ${SPIRIT_DATA.length} 个灵体`);
