/**
 * 单个 AI 脚本自检。
 * 用法：node tools/agent-check.mjs <id>   （例：node tools/agent-check.mjs hy4）
 *
 * 检查项：
 *   1. 文件存在、语法可解析、无 import/require
 *   2. 五个导出齐全（meta / deck / spirit / color / choose）
 *   3. meta 字段齐全且与分工表一致
 *   4. 卡组合法：40—60 张、同名 ≤4、无灵体、卡名存在，四个模式各校验一次
 *   5. 灵体存在于八色灵体表
 *   6. 四个模式各跑 1 局镜像对局（自己 vs 内置战术脚本），不得出现脚本异常、非法动作、超时判和
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MODE_IDS, MODES, validateDeck, deckColors, playMatch } from '../js/engine/rules.js';
import { BY_NAME, BY_ID, SPIRIT_DATA } from '../js/engine/cards.js';
import {
  createGame, legalMoves, makeView, applyMove, _testing,
} from '../js/engine/rules.js';
import { TACTICIAN } from '../js/ai/builtin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT = {
  hy4: { model: 'hy4', modelId: 'hy4std', primaryMode: 'standard' },
  hy3: { model: 'hy3', modelId: 'hy3', primaryMode: 'grand' },
  glm53: { model: 'GLM5.3', modelId: 'glm-5.3', primaryMode: 'standard' },
  glm53flash: { model: 'GLM5.3flash', modelId: 'glm-5.3-flash', primaryMode: 'duo' },
  minimaxm3: { model: 'MiniMax M3', modelId: 'minimax-m3-pay', primaryMode: 'duo' },
  minimaxm31flash: { model: 'MiniMax M3.1flash', modelId: 'minimax-m3.1-flash', primaryMode: 'blitz' },
  kimi31pro: { model: 'KIMI 3.1pro', modelId: 'kimi-k3.1-pro', primaryMode: 'duo' },
  kimi28preview: { model: 'KIMI 2.8preview', modelId: 'kimi-k2.8-preview', primaryMode: 'blitz' },
  deepseekv41flash: { model: 'deepseek v4.1flash', modelId: 'deepseek-v4.1-flash', primaryMode: 'grand' },
  deepseekv4pro: { model: 'deepseek v4pro', modelId: 'deepseek-v4-pro', primaryMode: 'standard' },
  step5preview: { model: 'step5preview', modelId: 'step-5-preview', primaryMode: 'grand' },
  mimov26pro: { model: 'MIMO-v2.6-pro', modelId: 'mimo-v2.6-pro', primaryMode: 'blitz' },
};

const id = process.argv[2];
if (!id) {
  console.error('用法：node tools/agent-check.mjs <id>');
  console.error(`已知 id：${Object.keys(EXPECT).join(' / ')}`);
  process.exit(2);
}
const expect = EXPECT[id];
if (!expect) {
  console.error(`未知 id：${id}。允许：${Object.keys(EXPECT).join(' / ')}`);
  process.exit(2);
}

const results = [];
const ok = (label, note = '') => results.push({ pass: true, label, note });
const bad = (label, note = '') => results.push({ pass: false, label, note });
const file = path.join(ROOT, 'agents', `agent-${id}.js`);

// ── 1. 文件与语法 ────────────────────────────────
if (!fs.existsSync(file)) {
  bad('文件存在', `缺少 agents/agent-${id}.js`);
  report();
}
ok('文件存在', `agents/agent-${id}.js`);

const source = fs.readFileSync(file, 'utf8');
if (/^\s*(import|export\s+\*\s+from|export\s+\{[^}]*\}\s+from)/m.test(source) || /\brequire\s*\(/.test(source)) {
  bad('零依赖', '脚本内出现 import / export from / require');
} else {
  ok('零依赖');
}
if (/\bfetch\s*\(|\bprocess\./.test(source)) bad('无外部访问', '出现 fetch 或 process');
else ok('无外部访问');

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) {
  bad('语法可解析', (check.stderr || '').split('\n').slice(0, 4).join(' '));
  report();
}
ok('语法可解析');

// ── 2. 导出 ──────────────────────────────────────
let mod;
try {
  mod = await import(`file://${file.replace(/\\/g, '/')}?v=${Date.now()}`);
} catch (error) {
  bad('模块可加载', error.message);
  report();
}
for (const key of ['meta', 'deck', 'spirit', 'color', 'choose']) {
  if (key === 'choose' ? typeof mod.choose !== 'function' : mod[key] == null) bad(`导出 ${key}`, '缺失');
  else ok(`导出 ${key}`);
}

// ── 3. meta ─────────────────────────────────────
const meta = mod.meta || {};
const metaChecks = [
  ['id', meta.id === id, `应为 ${id}，实际 ${meta.id}`],
  ['model', meta.model === expect.model, `应为 ${expect.model}，实际 ${meta.model}`],
  ['modelId', meta.modelId === expect.modelId, `应为 ${expect.modelId}，实际 ${meta.modelId}`],
  ['name', typeof meta.name === 'string' && meta.name.trim().length > 0, '策略名不能为空'],
  ['desc', typeof meta.desc === 'string' && meta.desc.trim().length >= 10, '策略理由至少 10 字'],
  ['primaryMode', meta.primaryMode === expect.primaryMode, `应为 ${expect.primaryMode}，实际 ${meta.primaryMode}`],
  ['modes', Array.isArray(meta.modes) && MODE_IDS.every((m) => meta.modes.includes(m)), `必须含 ${MODE_IDS.join('/')}`],
];
for (const [field, pass, note] of metaChecks) {
  if (pass) ok(`meta.${field}`);
  else bad(`meta.${field}`, note);
}

// ── 4. 卡组 ─────────────────────────────────────
const deck = mod.deck;
const list = Array.isArray(deck) ? deck : Object.entries(deck || {}).flatMap(([n, c]) => Array(Number(c)).fill(n));
if (list.length) ok('卡组张数', `${list.length} 张`);
else bad('卡组张数', 'deck 为空');

const unknown = [...new Set(list.filter((n) => !BY_NAME.get(n) && !BY_ID.get(n)))];
if (unknown.length) bad('卡名存在', `未知卡名：${unknown.slice(0, 5).join('、')}`);
else ok('卡名存在');

for (const mode of MODE_IDS) {
  const v = validateDeck(list, mode);
  if (v.ok) ok(`卡组合法 · ${MODES[mode].name}`, `${list.length} 张`);
  else bad(`卡组合法 · ${MODES[mode].name}`, v.errors.slice(0, 3).join('；'));
}

const tally = deckColors(list);
ok('颜色覆盖', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}${n}`).join(' '));

const spiritNames = new Set(SPIRIT_DATA.map((s) => s.name));
if (spiritNames.has(mod.spirit)) ok('灵体合法', mod.spirit);
else bad('灵体合法', `「${mod.spirit}」不在八色灵体表；可选：${[...spiritNames].join('、')}`);

const colorOfSpirit = SPIRIT_DATA.find((s) => s.name === mod.spirit)?.color;
if (colorOfSpirit && mod.color !== colorOfSpirit) {
  ok('主色与灵体一致（建议项）', `主色 ${mod.color}，灵体色 ${colorOfSpirit}——不一致不违规，但费用结构可能吃亏`);
} else if (colorOfSpirit) ok('主色与灵体一致', `${mod.color}`);

if (results.some((r) => !r.pass)) report();

// ── 5. 四模式镜像对局 ───────────────────────────
for (const mode of MODE_IDS) {
  const base = {
    mode,
    deckA: list, deckB: list,
    colorA: mod.color, colorB: colorOfSpirit || mod.color,
    spiritA: mod.spirit, spiritB: mod.spirit,
    scriptA: mod, scriptB: TACTICIAN,
    seed: 20261113, record: false, maxActions: 6000,
  };
  let run;
  const t0 = Date.now();
  try {
    run = playMatch(base);
  } catch (error) {
    bad(`对局可跑 · ${MODES[mode].name}`, error.message);
    continue;
  }
  const ms = Date.now() - t0;
  const errors = run.log.filter((l) => /脚本异常|脚本返回非法动作/.test(l));
  const timeout = /安全上限/.test(String(run.reason));
  if (errors.length) bad(`对局可跑 · ${MODES[mode].name}`, errors.slice(0, 2).join(' / '));
  else if (timeout) bad(`对局可跑 · ${MODES[mode].name}`, `打到 ${run.actions} 动作上限判和，疑似动作循环`);
  else if (!run.game.over) bad(`对局可跑 · ${MODES[mode].name}`, '对局未结束');
  else ok(`对局可跑 · ${MODES[mode].name}`, `${run.actions} 动作 / ${ms}ms / ${run.reason}`);

  // 反向再跑一局：自己执后手，检查两个座位都不异常
  try {
    const rev = playMatch({ ...base, first: 1, seed: 20261114 });
    const revErr = rev.log.filter((l) => /脚本异常|脚本返回非法动作/.test(l));
    if (revErr.length) bad(`后手方对局 · ${MODES[mode].name}`, revErr.slice(0, 2).join(' / '));
    else if (/安全上限/.test(String(rev.reason))) bad(`后手方对局 · ${MODES[mode].name}`, '疑似动作循环');
    else ok(`后手方对局 · ${MODES[mode].name}`, `${rev.actions} 动作`);
  } catch (error) {
    bad(`后手方对局 · ${MODES[mode].name}`, error.message);
  }
}

// ── 6. 阻挡阶段 toggle 探针 ─────────────────────
try {
  const probe = blockToggleProbe(mod, list, mod.color, mod.spirit);
  if (probe.ok) ok('阻挡阶段不循环', probe.note);
  else bad('阻挡阶段不循环', probe.detail);
} catch (error) {
  bad('阻挡阶段不循环', `探针异常：${error.message}`);
}

report();

/**
 * 阻挡阶段 toggle 探针。
 *
 * 引擎的 `block` 是切换式：uid 已在 combat.blockers 里时返回它＝取消阻挡。
 * 「每次挑最优阻挡者并返回 block」会在一对状态间无限来回，而镜像对局未必触发
 * （对手决策恰好让最优解稳定），只有跨对手才暴露。这里直接构造一个
 * 「我方两个单位、对方一个弱势攻击者」的局面，连续询问 10 次：
 * 同一个 uid 被返回 3 次以上即判定为 toggle 循环。
 */
function blockToggleProbe(mod, deck, color, spirit) {
  const g = createGame({
    mode: 'standard', deckA: deck, deckB: deck,
    colorA: color, colorB: color, spiritA: spirit, spiritB: spirit,
    seed: 20260101, mulligan: false, scriptA: mod, scriptB: null,
  });
  const atk = _testing.put(g, 0, '圣光聚合体', 'field');
  _testing.put(g, 1, '光能守护者', 'field');
  _testing.put(g, 1, '晨祷侍从', 'field');
  g.priority = 1;
  _testing.setCombat(g, {
    stage: 'blockers', attacker: 0, attackerUid: atk, target: 'spirit',
    blockers: [], supportAtk: 0, supportImp: 0, spiritSupported: false,
  });
  const counts = {};
  let asks = 0;
  for (let i = 0; i < 10; i++) {
    const moves = legalMoves(g);
    if (!moves.length) break;
    let mv;
    try { mv = mod.choose(makeView(g, 1), moves); }
    catch (e) { return { ok: false, detail: `探针中脚本抛异常：${e.message}` }; }
    if (!mv || mv.type !== 'block') break;
    if (!moves.some((m) => JSON.stringify(m) === JSON.stringify(mv))) return { ok: false, detail: '返回了非法的阻挡动作' };
    counts[mv.uid] = (counts[mv.uid] || 0) + 1;
    asks++;
    if (counts[mv.uid] > 2) {
      const name = BY_ID.get(g.cards[mv.uid]?.id)?.name || mv.uid;
      return { ok: false, detail: `【${name}】的 block 被反复返回 ${counts[mv.uid]} 次——toggle 循环` };
    }
    applyMove(g, mv);
  }
  return { ok: true, note: asks ? `连续 ${asks} 次阻挡决策无往返` : '首次即选择让过（未触发往返）' };
}

function report() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  console.log(`\n=== agent-${id}.js 自检 ===`);
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.label}${r.note ? `　${r.note}` : ''}`);
  console.log(`\n合计 ${results.length} 项：${pass} 通过，${fail.length} 失败`);
  if (fail.length) {
    console.log('\n必须先修掉以下问题再交：');
    for (const r of fail) console.log(`  · ${r.label}：${r.note}`);
    process.exit(1);
  }
  console.log('全部通过。');
  process.exit(0);
}
