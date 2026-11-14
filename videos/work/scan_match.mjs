/**
 * 为解说视频挑一局：扫描两套脚本在指定模式下的多个种子，按戏剧性打分。
 * 用法：
 *   node videos/work/scan_match.mjs kimi31pro minimaxm3 standard 40
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const [aId = 'kimi31pro', bId = 'minimaxm3', mode = 'standard', nRaw = '30'] = process.argv.slice(2);
const n = Number(nRaw);

const load = async (id) => {
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  return { id, mod, deck };
};

const A = await load(aId);
const B = await load(bId);

const rows = [];
for (let s = 0; s < n; s++) {
  for (const first of [0, 1]) {
    const seed = 20261114 + s * 7919;
    let run;
    try {
      run = playMatch({
        mode, seed, first, record: true, maxActions: 8000,
        deckA: A.deck, deckB: B.deck,
        colorA: A.mod.color, colorB: B.mod.color,
        spiritA: A.mod.spirit, spiritB: B.mod.spirit,
        scriptA: A.mod, scriptB: B.mod,
        nameA: A.mod.meta?.model || aId, nameB: B.mod.meta?.model || bId,
      });
    } catch (error) {
      rows.push({ seed, first, error: error.message });
      continue;
    }
    const steps = run.steps;
    const lifeTrack = steps.map((st) => st.snap.P.map((p) => p.life));
    const winner = run.winner;
    const turns = steps[steps.length - 1].snap.turn;
    let leadChanges = 0;
    let prev = 0;
    let minMargin = 99;
    for (const [l0, l1] of lifeTrack) {
      const diff = l0 - l1;
      const sign = Math.sign(diff);
      if (sign !== 0 && prev !== 0 && sign !== prev) leadChanges++;
      if (sign !== 0) prev = sign;
      minMargin = Math.min(minMargin, Math.abs(diff));
    }
    const finalLife = lifeTrack[lifeTrack.length - 1];
    rows.push({
      seed, first, winner, turns, actions: run.actions, steps: steps.length,
      final: finalLife.join(':'), leadChanges, minMargin,
      loserLife: winner == null ? null : finalLife[1 - winner],
      winnerLife: winner == null ? null : finalLife[winner],
      reason: run.reason,
    });
  }
}

const ok = rows.filter((r) => !r.error && r.winner != null);
ok.sort((x, y) => {
  const score = (r) => (r.leadChanges * 3) + (5 - Math.min(5, r.loserLife)) * 4 + (r.winnerLife <= 3 ? 6 : 0) + (r.turns >= 8 && r.turns <= 18 ? 5 : 0);
  return score(y) - score(x);
});
for (const r of ok.slice(0, 12)) {
  console.log([
    r.seed, 'first=' + r.first, (r.winner === 0 ? aId : bId) + ' 胜',
    'T' + r.turns, r.actions + '动作', '终' + r.final,
    '反转' + r.leadChanges, '最小差' + r.minMargin,
  ].join(' | '));
}
console.log('---');
console.log('有效', ok.length, '/', rows.length, '｜' + aId + ' 胜', ok.filter((r) => r.winner === 0).length, '｜' + bId + ' 胜', ok.filter((r) => r.winner === 1).length);
const errs = rows.filter((r) => r.error);
if (errs.length) console.log('异常', errs.slice(0, 3));
