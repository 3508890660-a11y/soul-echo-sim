/**
 * 选局池扫描：多组对手 × 多模式 × 多种子，按戏剧性与可讲性打分。
 * 用法：node videos/work/scan_pool.mjs [seeds=10] [outFile]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seeds = Number(process.argv[2] || 10);
const OUT = process.argv[3] || path.join(ROOT, 'videos/work/scan-pool.json');

const PAIRS = [
  ['kimi31pro', 'glm53', ['standard', 'blitz']],          // 红 vs 绿
  ['kimi31pro', 'deepseekv41flash', ['standard', 'blitz']], // 红 vs 白
  ['minimaxm3', 'deepseekv41flash', ['standard']],         // 红 vs 白
  ['minimaxm3', 'glm53', ['standard', 'blitz']],           // 红 vs 绿
  ['glm53', 'deepseekv4pro', ['standard']],                // 绿 vs 绿
  ['minimaxm31flash', 'step5preview', ['blitz']],          // 红 vs 绿
  ['kimi31pro', 'minimaxm31flash', ['standard']],          // 红 vs 红
  ['deepseekv41flash', 'glm53', ['grand']],                // 白 vs 绿（长局）
  ['kimi31pro', 'glm53', ['duo']],                         // 红 vs 绿（双色）
];

const cache = new Map();
async function load(id) {
  if (cache.has(id)) return cache.get(id);
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  const row = { id, mod, deck };
  cache.set(id, row);
  return row;
}

function stats(run) {
  const steps = run.steps;
  const track = steps.map((s) => s.snap.P.map((p) => p.life));
  const turns = steps[steps.length - 1].snap.turn;
  let leadChanges = 0;
  let prev = 0;
  let minMargin = 99;
  const perTurnLoss = new Map();
  let prevLife = track[0];
  for (let i = 0; i < track.length; i++) {
    const [l0, l1] = track[i];
    const d = l0 - l1;
    const sign = Math.sign(d);
    if (sign !== 0 && prev !== 0 && sign !== prev) leadChanges++;
    if (sign !== 0) prev = sign;
    minMargin = Math.min(minMargin, Math.abs(d));
    const t = steps[i].snap.turn;
    const loss = [Math.max(0, prevLife[0] - l0), Math.max(0, prevLife[1] - l1)];
    const cur = perTurnLoss.get(t) || [0, 0];
    perTurnLoss.set(t, [cur[0] + loss[0], cur[1] + loss[1]]);
    prevLife = [l0, l1];
  }
  let maxSwing = 0;
  let swingTurn = 0;
  for (const [t, [a, b]] of perTurnLoss) {
    const m = Math.max(a, b);
    if (m > maxSwing) { maxSwing = m; swingTurn = t; }
  }
  const final = track[track.length - 1];
  const w = run.winner;
  // 赢家在终局之前最深的一次落后
  let maxDeficit = 0;
  for (const l of track) {
    const deficit = w === 0 ? l[1] - l[0] : l[0] - l[1];
    if (deficit > maxDeficit) maxDeficit = deficit;
  }
  const log = steps.map((s) => s.text).join('\n');
  const count = (re) => (log.match(re) || []).length;
  return {
    turns, actions: run.actions, final: final.join(':'), leadChanges, minMargin,
    winnerLife: w == null ? null : final[w],
    loserLife: w == null ? null : final[1 - w],
    maxSwing, swingTurn, maxDeficit,
    crush: count(/碾压/g), crit: count(/暴击指示物/g), mt: count(/MT/g),
    empty: count(/生命卡组为空/g), encore: count(/终曲/g),
  };
}

const rows = [];
for (const [aId, bId, modes] of PAIRS) {
  const A = await load(aId);
  const B = await load(bId);
  for (const mode of modes) {
    for (let s = 0; s < seeds; s++) {
      for (const first of [0, 1]) {
        const seed = 20261201 + s * 7919;
        let run;
        try {
          run = playMatch({
            mode, seed, first, record: true, maxActions: 8000,
            deckA: A.deck, deckB: B.deck,
            colorA: A.mod.color, colorB: B.mod.color,
            spiritA: A.mod.spirit, spiritB: B.mod.spirit,
            scriptA: A.mod, scriptB: B.mod,
            nameA: (A.mod.meta && A.mod.meta.model) || aId,
            nameB: (B.mod.meta && B.mod.meta.model) || bId,
          });
        } catch (e) {
          continue;
        }
        if (run.winner == null) continue;
        const st = stats(run);
        const score =
          st.leadChanges * 3 +
          st.maxDeficit * 2.5 +
          (st.loserLife <= 1 ? 8 : 0) +
          (st.maxSwing >= 3 ? 4 : 0) +
          (st.turns >= 8 && st.turns <= 16 ? 5 : 0) +
          (st.empty >= 1 ? 2 : 0);
        rows.push({ aId, bId, mode, seed, first, winner: run.winner, colorA: A.mod.color, colorB: B.mod.color, score, ...st });
      }
    }
  }
  process.stderr.write(`scanned ${aId} vs ${bId}\n`);
}

rows.sort((x, y) => y.score - x.score);
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1), 'utf8');
for (const r of rows.slice(0, 18)) {
  const w = r.winner === 0 ? r.aId : r.bId;
  const d = r.winner === 0 ? `${r.colorA} ${r.aId}` : `${r.colorB} ${r.bId}`;
  console.log(
    [r.score.toFixed(1), r.mode, `${r.aId}(${r.colorA}) vs ${r.bId}(${r.colorB})`, 'seed=' + r.seed, 'first=' + r.first,
     '胜:' + d, 'T' + r.turns, '终' + r.final, '反转' + r.leadChanges, '最深落后' + r.maxDeficit,
     '单回合最大' + r.maxSwing + '@T' + r.swingTurn, '碾压' + r.crush, '暴击' + r.crit].join(' | '),
  );
}
console.log('---');
console.log('有效对局', rows.length, '｜写入', OUT);
