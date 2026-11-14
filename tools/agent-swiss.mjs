/**
 * 12 份 AI 脚本的瑞士轮。
 *
 * 用法：
 *   node tools/agent-swiss.mjs                        # 四模式各 3 届，每届 5 轮
 *   node tools/agent-swiss.mjs --mode duo --seasons 5
 *   node tools/agent-swiss.mjs --rounds 6 --seasons 1 --mode standard
 *
 * 瑞士轮规则：
 *   - 第一轮按种子随机排序配对，之后按场分降序，同分组内优先配未交手的对手。
 *   - 计分 3-1-0（胜 3 / 和 1 / 负 0）。12 人 5 轮，无轮空。
 *   - 同分排名依次比：Buchholz（对手场分之和）→ 直接交手胜负 → 种子随机。
 *   - 每局先手按桌号交替，消除先手偏差；局种子由 masterSeed 派生，可完整复现。
 *
 * 输出 agent-progress/swiss.json 与 swiss.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_IDS, MODES, playMatch, validateDeck } from '../js/engine/rules.js';
import { Rng } from '../js/engine/rules.js';

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
const seasons = Number(argOf('--seasons', '3'));
const rounds = Number(argOf('--rounds', '5'));
const modes = onlyMode ? [onlyMode] : [...MODE_IDS];

const agents = [];
for (const id of IDS) {
  const file = path.join(ROOT, 'agents', `agent-${id}.js`);
  if (!fs.existsSync(file)) continue;
  const mod = await import(`file://${file.replace(/\\/g, '/')}?v=${Date.now()}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([n, c]) => Array(Number(c)).fill(n));
  agents.push({ id, mod, deck, meta: mod.meta || {} });
}

const pairKey = (a, b) => [a, b].sort().join('|');

/** 按场分降序、同分组内按种子随机打散。 */
function seedOrder(rows, rng) {
  const groups = new Map();
  for (const r of rows) {
    const k = String(r.mp);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.keys()]
    .sort((a, b) => Number(b) - Number(a))
    .flatMap((k) => rng.shuffle([...groups.get(k)]));
}

/** 同分组内优先配未交手者，落单的向下浮动。 */
function pairRound(order, played) {
  const pool = [...order];
  const pairs = [];
  while (pool.length) {
    const a = pool.shift();
    let idx = pool.findIndex((b) => b.mp === a.mp && !played.has(pairKey(a.id, b.id)));
    if (idx < 0) idx = pool.findIndex((b) => !played.has(pairKey(a.id, b.id)));
    if (idx < 0) idx = 0;
    pairs.push([a, pool.splice(idx, 1)[0]]);
  }
  return pairs;
}

function playOne(mode, A, B, seed, first) {
  const run = playMatch({
    mode, seed, first, record: false, maxActions: 8000,
    deckA: A.deck, deckB: B.deck,
    colorA: A.mod.color, colorB: B.mod.color,
    spiritA: A.mod.spirit, spiritB: B.mod.spirit,
    scriptA: A.mod, scriptB: B.mod,
  });
  const anomaly = run.log.some((l) => /脚本异常|脚本返回非法动作/.test(l)) || /安全上限/.test(String(run.reason));
  return { winner: run.winner, actions: run.actions, anomaly, reason: run.reason };
}

const out = { generatedAt: new Date().toISOString(), rounds, seasonsPerMode: seasons, modes: {} };

for (const mode of modes) {
  const spec = MODES[mode];
  if (!spec) continue;
  const checks = new Map(agents.map((a) => [a.id, validateDeck(a.deck, mode, { spirit: a.spirit })]));
  const pool = agents.filter((a) => checks.get(a.id).ok);
  const excluded = agents.filter((a) => !checks.get(a.id).ok);
  if (excluded.length) console.warn(`${spec.name} 排除不合法卡组：${excluded.map((a) => `${a.id}（${checks.get(a.id).errors[0]}）`).join('；')}`);
  if (pool.length < 4) { console.warn(`${spec.name} 可参赛脚本不足，跳过`); continue; }

  const seasonResults = [];
  for (let s = 0; s < seasons; s++) {
    const masterSeed = 20261113 + s * 6151;
    const think = (tag) => new Rng(`${masterSeed}:${tag}`.split('').reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7));
    const rowOf = Object.fromEntries(pool.map((a) => [a.id, {
      id: a.id, model: a.meta.model || a.id, strategy: a.meta.name || '',
      primaryMode: a.meta.primaryMode || '—', mp: 0, win: 0, loss: 0, draw: 0,
      opps: [], anomalies: 0, actions: 0,
    }]));

    const played = new Set();
    const roundLog = [];
    let order = seedOrder(Object.values(rowOf), think(`entrants:${mode}:${s}`));

    for (let r = 0; r < rounds; r++) {
      const pairs = pairRound(order, played);
      const results = [];
      pairs.forEach(([A, B], m) => {
        played.add(pairKey(A.id, B.id));
        const first = (m + r) % 2;
        const res = playOne(mode, pool.find((x) => x.id === A.id), pool.find((x) => x.id === B.id),
          masterSeed + r * 101 + m * 17, first);
        const ra = rowOf[A.id], rb = rowOf[B.id];
        ra.opps.push(B.id); rb.opps.push(A.id);
        ra.actions += res.actions; rb.actions += res.actions;
        if (res.anomaly) { ra.anomalies++; rb.anomalies++; }
        if (res.winner === null || res.winner === undefined) { ra.mp += 1; rb.mp += 1; ra.draw++; rb.draw++; }
        else if (res.winner === 0) { ra.mp += 3; ra.win++; rb.loss++; }
        else { rb.mp += 3; rb.win++; ra.loss++; }
        results.push({ table: m + 1, a: A.id, b: B.id, first, winner: res.winner, actions: res.actions, reason: res.reason });
      });
      roundLog.push({ round: r + 1, results });
      order = seedOrder(Object.values(rowOf), think(`r${r}:${mode}:${s}`));
    }

    // Buchholz：对手最终场分之和
    for (const row of Object.values(rowOf)) row.buchholz = row.opps.reduce((n, id) => n + rowOf[id].mp, 0);

    const standings = Object.values(rowOf).sort((a, b) => b.mp - a.mp || b.buchholz - a.buchholz || a.id.localeCompare(b.id));
    standings.forEach((row, i) => { row.rank = i + 1; });
    seasonResults.push({ season: s + 1, masterSeed, standings, rounds: roundLog });
    console.log(`\n【${spec.name} · 第 ${s + 1} 届】种子 ${masterSeed}`);
    for (const row of standings) {
      console.log(`  ${String(row.rank).padStart(2)}. ${row.id.padEnd(18)} ${String(row.mp).padStart(2)} 分  ${row.win}胜${row.loss}负${row.draw}平  Buchholz ${String(row.buchholz).padStart(2)}  ${row.strategy}`);
    }
  }

  // 跨届聚合
  const agg = {};
  for (const a of pool) agg[a.id] = { id: a.id, model: a.meta.model, strategy: a.meta.name, primaryMode: a.meta.primaryMode, ranks: [], mp: 0, win: 0, loss: 0, draw: 0, anomalies: 0 };
  for (const sr of seasonResults) {
    for (const row of sr.standings) {
      const t = agg[row.id];
      t.ranks.push(row.rank); t.mp += row.mp; t.win += row.win; t.loss += row.loss; t.draw += row.draw; t.anomalies += row.anomalies;
    }
  }
  const ranking = Object.values(agg).map((t) => ({
    ...t,
    avgRank: t.ranks.reduce((a, b) => a + b, 0) / t.ranks.length,
    titles: t.ranks.filter((r) => r === 1).length,
    top4: t.ranks.filter((r) => r <= 4).length,
  })).sort((a, b) => a.avgRank - b.avgRank || b.titles - a.titles);

  out.modes[mode] = { name: spec.name, life: spec.life, seasons: seasonResults, aggregate: ranking };
  console.log(`\n【${spec.name} · ${seasons} 届聚合】`);
  for (const t of ranking) {
    console.log(`  ${t.id.padEnd(18)} 平均名次 ${t.avgRank.toFixed(2)}  夺冠 ${t.titles}  前四 ${t.top4}  总场分 ${t.mp}  (${t.win}胜${t.loss}负${t.draw}平)`);
  }
}

const dir = path.join(ROOT, 'agent-progress');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'swiss.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

// ── markdown ────────────────────────────────────
const md = [];
md.push('# 12 模型对战脚本 · 瑞士轮');
md.push('');
md.push(`> 生成于 ${out.generatedAt}。四模式各 ${seasons} 届，每届 ${rounds} 轮、6 桌、共 ${rounds * 6} 局。`);
md.push('> 计分 3-1-0；同分依次比 Buchholz（对手场分和）、直接交手、种子。每桌先手按桌号与轮次交替。');
md.push('> 每份脚本都用自己的卡组与灵体，引擎与规则完全相同。');
md.push('');

for (const [mode, data] of Object.entries(out.modes)) {
  md.push(`## ${data.name}`);
  md.push('');
  md.push(`### ${seasons} 届聚合`);
  md.push('');
  md.push('| 名次 | 脚本 | 模型 | 策略 | 平均名次 | 夺冠 | 前四 | 总场分 | 战绩 | 异常 |');
  md.push('|---:|---|---|---|---:|---:|---:|---:|---|---:|');
  data.aggregate.forEach((t, i) => {
    md.push(`| ${i + 1} | \`${t.id}\` | ${t.model} | ${t.strategy} | ${t.avgRank.toFixed(2)} | ${t.titles} | ${t.top4} | ${t.mp} | ${t.win}-${t.loss}-${t.draw} | ${t.anomalies} |`);
  });
  md.push('');
  for (const sr of data.seasons) {
    md.push(`### 第 ${sr.season} 届（种子 ${sr.masterSeed}）`);
    md.push('');
    md.push('| 名次 | 脚本 | 场分 | 胜-负-平 | Buchholz |');
    md.push('|---:|---|---:|---|---:|');
    for (const row of sr.standings) {
      md.push(`| ${row.rank} | \`${row.id}\` | ${row.mp} | ${row.win}-${row.loss}-${row.draw} | ${row.buchholz} |`);
    }
    md.push('');
  }
}
fs.writeFileSync(path.join(dir, 'swiss.md'), md.join('\n'), 'utf8');
console.log('\n已写入 agent-progress/swiss.json 与 swiss.md');
