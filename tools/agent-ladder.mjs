/**
 * 12 份 AI 脚本的循环赛。
 * 用法：
 *   node tools/agent-ladder.mjs                     # 全部四种模式，各跑一轮双循环
 *   node tools/agent-ladder.mjs --mode standard     # 只跑一个模式
 *   node tools/agent-ladder.mjs --seeds 3           # 每对打 3 个种子（默认 2）
 *
 * 每个模式内：12 份脚本两两对战，双方各先手一次（双循环），种子固定可复现。
 * 输出 agent-progress/ladder.json 与 ladder.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_IDS, MODES, playMatch, validateDeck } from '../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IDS = [
  'hy4', 'hy3', 'glm53', 'glm53flash', 'minimaxm3', 'minimaxm31flash',
  'kimi31pro', 'kimi28preview', 'deepseekv41flash', 'deepseekv4pro', 'step5preview', 'mimov26pro',
];

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const onlyMode = argOf('--mode', null);
const seedsPerPair = Number(argOf('--seeds', '2'));
const modes = onlyMode ? [onlyMode] : [...MODE_IDS];

const agents = [];
for (const id of IDS) {
  const file = path.join(ROOT, 'agents', `agent-${id}.js`);
  if (!fs.existsSync(file)) { console.warn(`跳过缺失脚本 ${id}`); continue; }
  const mod = await import(`file://${file.replace(/\\/g, '/')}?v=${Date.now()}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([n, c]) => Array(Number(c)).fill(n));
  agents.push({ id, mod, deck, meta: mod.meta || {} });
}
if (agents.length < 2) { console.error('可参赛脚本不足 2 份'); process.exit(1); }

const out = { generatedAt: new Date().toISOString(), seedsPerPair, modes: {} };

for (const mode of modes) {
  const modeSpec = MODES[mode];
  if (!modeSpec) { console.warn(`未知模式 ${mode}，跳过`); continue; }

  // 模式内先做一次构筑合法性体检，不合法的直接标红，不静默剔除
  const checks = new Map(agents.map((a) => [a.id, validateDeck(a.deck, mode, { spirit: a.spirit })]));
  const illegal = agents.filter((a) => !checks.get(a.id).ok);
  const board = Object.fromEntries(agents.map((a) => [a.id, {
    id: a.id, model: a.meta.model || a.id, primaryMode: a.meta.primaryMode || '—',
    strategy: a.meta.name || '', win: 0, loss: 0, draw: 0, plays: 0, actions: 0, anomalies: 0, ms: 0,
  }]));

  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < agents.length; j++) {
      if (i === j) continue;
      const A = agents[i], B = agents[j];
      if (illegal.includes(A) || illegal.includes(B)) continue;
      for (let s = 0; s < seedsPerPair; s++) {
        const seed = 20261113 + s * 7919;
        const first = s % 2;
        let run;
        const t0 = Date.now();
        try {
          run = playMatch({
            mode, seed, first, record: false, maxActions: 8000,
            deckA: A.deck, deckB: B.deck,
            colorA: A.mod.color, colorB: B.mod.color,
            spiritA: A.mod.spirit, spiritB: B.mod.spirit,
            scriptA: A.mod, scriptB: B.mod,
          });
        } catch (error) {
          board[A.id].anomalies++;
          board[B.id].anomalies++;
          continue;
        }
        const ms = Date.now() - t0;
        const bad = run.log.some((l) => /脚本异常|脚本返回非法动作/.test(l)) || /安全上限/.test(String(run.reason));
        for (const side of [A, B]) { board[side.id].plays++; board[side.id].actions += run.actions; board[side.id].ms += ms; }
        if (bad) { board[A.id].anomalies++; board[B.id].anomalies++; }
        if (run.winner === null || run.winner === undefined) { board[A.id].draw++; board[B.id].draw++; }
        else if (run.winner === 0) { board[A.id].win++; board[B.id].loss++; }
        else { board[B.id].win++; board[A.id].loss++; }
      }
    }
  }

  const rows = Object.values(board)
    .map((r) => ({
      ...r,
      winrate: r.plays ? r.win / r.plays : 0,
      avgActions: r.plays ? Math.round(r.actions / r.plays) : 0,
      avgMs: r.plays ? Math.round(r.ms / r.plays) : 0,
    }))
    .sort((a, b) => b.winrate - a.winrate || b.win - a.win);

  out.modes[mode] = {
    name: modeSpec.name, life: modeSpec.life, handStart: modeSpec.handStart,
    illegal: illegal.map((a) => a.id),
    rows,
  };
  console.log(`\n【${modeSpec.name}】生命 ${modeSpec.life} / 起手 ${modeSpec.handStart}`);
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(18)} ${String(r.win).padStart(3)}胜 ${String(r.loss).padStart(3)}负 ${String(r.draw).padStart(3)}和  ${(r.winrate * 100).toFixed(1).padStart(5)}%  ${String(r.avgActions).padStart(4)} 动作/局  异常 ${r.anomalies}`);
  }
  if (illegal.length) console.log(`  ! 卡组不合法：${illegal.map((a) => `${a.id}（${checks.get(a.id).errors[0]}）`).join('；')}`);
}

// 跨模式总表：把每个脚本在四模式里按主责 1.0、其他 0.5 加权
const overall = {};
for (const a of agents) overall[a.id] = { id: a.id, model: a.meta.model || a.id, primaryMode: a.meta.primaryMode, strategy: a.meta.name, weighted: 0, weight: 0 };
for (const [mode, data] of Object.entries(out.modes)) {
  for (const r of data.rows) {
    const w = r.primaryMode === mode ? 1 : 0.5;
    overall[r.id].weighted += r.winrate * w;
    overall[r.id].weight += w;
  }
}
out.overall = Object.values(overall)
  .map((r) => ({ ...r, score: r.weight ? r.weighted / r.weight : 0 }))
  .sort((a, b) => b.score - a.score);

console.log('\n【加权总表】主责模式权重 1.0，其余模式 0.5');
for (const r of out.overall) {
  console.log(`  ${r.id.padEnd(18)} ${(r.score * 100).toFixed(1).padStart(5)}%  主责 ${String(r.primaryMode).padEnd(9)} ${r.strategy}`);
}

const dir = path.join(ROOT, 'agent-progress');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'ladder.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const md = [];
md.push('# 12 模型对战脚本 · 循环赛结果');
md.push('');
md.push(`> 生成于 ${out.generatedAt}。每模式内 12 份脚本两两对战，双方各先手一次，共 ${seedsPerPair * 132} 局/模式。`);
md.push('> 每个脚本按自己的卡组与灵体出战，引擎与规则完全相同，差异只来自组卡与决策。');
md.push('');
for (const [mode, data] of Object.entries(out.modes)) {
  md.push(`## ${data.name}（生命 ${data.life} / 起手 ${data.handStart}）`);
  md.push('');
  md.push('| 名次 | 脚本 | 模型 | 主责模式 | 策略 | 胜 | 负 | 和 | 胜率 | 平均动作 | 异常 |');
  md.push('|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|');
  data.rows.forEach((r, i) => {
    md.push(`| ${i + 1} | \`${r.id}\` | ${r.model} | ${r.primaryMode} | ${r.strategy} | ${r.win} | ${r.loss} | ${r.draw} | ${(r.winrate * 100).toFixed(1)}% | ${r.avgActions} | ${r.anomalies} |`);
  });
  md.push('');
}
md.push('## 加权总表');
md.push('');
md.push('> 主责模式权重 1.0，其余模式 0.5。');
md.push('');
md.push('| 名次 | 脚本 | 模型 | 主责模式 | 策略 | 加权胜率 |');
md.push('|---:|---|---|---|---|---:|');
out.overall.forEach((r, i) => {
  md.push(`| ${i + 1} | \`${r.id}\` | ${r.model} | ${r.primaryMode} | ${r.strategy} | ${(r.score * 100).toFixed(1)}% |`);
});
md.push('');
fs.writeFileSync(path.join(dir, 'ladder.md'), md.join('\n'), 'utf8');
console.log(`\n已写入 agent-progress/ladder.json 与 ladder.md`);
