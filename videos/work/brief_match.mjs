/**
 * 单局解剖：复盘一条候选对局的回合走势、转折点与终局。
 * 用法：node videos/work/brief_match.mjs <aId> <bId> <mode> <seed> <first>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';
import { targetGroups } from '../../js/engine/effects.js';
import { SE01_TARGETS } from '../../js/engine/effects.se01.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [aId, bId, mode, seedRaw, firstRaw] = process.argv.slice(2);
const seed = Number(seedRaw);
const first = Number(firstRaw || 0);

async function load(id) {
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  return { id, mod, deck };
}

function requiresOwnUnit(name) {
  const groups = [
    ...(targetGroups(name, 'main', 'main') || []),
    ...Object.values(SE01_TARGETS[name] || {}).flat().filter((x) => x && typeof x === 'object'),
  ];
  return groups.some((s) => s && s.kind === 'unit' && s.side === 'own' && s.min == null && !s.dream);
}

const A = await load(aId);
const B = await load(bId);
const run = playMatch({
  mode, seed, first, record: true, maxActions: 8000,
  deckA: A.deck, deckB: B.deck,
  colorA: A.mod.color, colorB: B.mod.color,
  spiritA: A.mod.spirit, spiritB: B.mod.spirit,
  scriptA: A.mod, scriptB: B.mod,
  nameA: (A.mod.meta && A.mod.meta.model) || aId,
  nameB: (B.mod.meta && B.mod.meta.model) || bId,
});

const steps = run.steps;
const name = [A.mod.meta?.model || aId, B.mod.meta?.model || bId];
const deckName = [A.mod.meta?.deckName || A.mod.spirit, B.mod.meta?.deckName || B.mod.spirit];
console.log(`${mode} seed=${seed} first=${first | 0}  ${name[0]}(${A.mod.color}) ${deckName[0]}  vs  ${name[1]}(${B.mod.color}) ${deckName[1]}`);
console.log(`胜者 ${run.winner == null ? '和局' : name[run.winner]} ｜ ${run.reason} ｜ ${run.actions} 动作 ｜ ${steps.length} 步`);

// 每回合双方生命
const byTurn = new Map();
for (const s of steps) {
  byTurn.set(s.snap.turn, [s.snap.P[0].life, s.snap.P[1].life]);
}
console.log('回合走势：', [...byTurn].map(([t, l]) => `T${t} ${l[0]}:${l[1]}`).join('  '));

// 每回合伤害与转折
let prev = [99, 99];
let prevSign = 0;
const beats = [];
for (const [t, l] of byTurn) {
  const dmg = [Math.max(0, prev[0] - l[0]), Math.max(0, prev[1] - l[1])];
  const sign = Math.sign(l[0] - l[1]);
  const flip = sign !== 0 && prevSign !== 0 && sign !== prevSign;
  if (dmg[0] + dmg[1] > 0) beats.push(`T${t} 伤害 ${dmg[0]}/${dmg[1]}${flip ? '  ← 领先易手' : ''}`);
  if (sign !== 0) prevSign = sign;
  prev = l;
}
console.log('转折：');
for (const b of beats) console.log('  ' + b);

// 关键牌与关键事件
const log = steps.map((s) => s.text).join('\n');
for (const key of ['王牌巨象', '碾压', '暴击指示物', '圣光打击', '终曲', '生命卡组为空']) {
  const n = (log.match(new RegExp(key, 'g')) || []).length;
  if (n) console.log(`事件 ${key} × ${n}`);
}

// 目标数为零仍打出（引擎缺陷）自检
let bad = 0;
for (let i = 0; i < steps.length; i++) {
  const text = steps[i].text || '';
  const m = text.match(/使用【(.+?)】/) || text.match(/横置【(.+?)】启动能力/);
  if (!m || !requiresOwnUnit(m[1])) continue;
  const before = i > 0 ? steps[i - 1].snap : steps[i].snap;
  const owner = before.P.find((p) => text.startsWith(p.name));
  if (owner && owner.field.filter((c) => c.type === '灵像' || c.token).length === 0) bad++;
}
console.log(`空场目标缺陷 ${bad} 次`);

// 终局前最后 12 步
console.log('终局前 12 步：');
for (const s of steps.slice(-12)) console.log(`  [T${s.snap.turn}] ${s.text.split('\n')[0]}`);
