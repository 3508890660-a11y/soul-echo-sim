/**
 * 关键事件链：只打「出牌 / 攻击 / 伤害结算 / 破坏 / 碾压」这几类行，按回合分组。
 * 用法：node videos/work/trace.mjs <aId> <bId> <mode> <seed> <first>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [aId, bId, mode, seedS, firstS] = process.argv.slice(2);

async function load(id) {
  const m = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(m.deck)
    ? m.deck
    : Object.entries(m.deck || {}).flatMap(([k, v]) => Array(Number(v)).fill(k));
  return { m, deck };
}

const A = await load(aId);
const B = await load(bId);
const run = playMatch({
  mode, seed: Number(seedS), first: Number(firstS), record: true, maxActions: 8000,
  deckA: A.deck, deckB: B.deck,
  colorA: A.m.color, colorB: B.m.color,
  spiritA: A.m.spirit, spiritB: B.m.spirit,
  scriptA: A.m, scriptB: B.m,
  nameA: (A.m.meta && A.m.meta.model) || aId,
  nameB: (B.m.meta && B.m.meta.model) || bId,
});

const keep = /使用【|以【|的生命伤害事件结束|生命卡组为空|被状态检查破坏|碾压|攻击未被阻挡/;
let lastTurn = -1;
for (const s of run.steps) {
  const t = s.snap.turn;
  if (keep.test(s.text)) {
    if (t !== lastTurn) {
      console.log(`--- T${t}　生命 ${s.snap.P[0].life}:${s.snap.P[1].life}`);
      lastTurn = t;
    }
    console.log('   ' + s.text.split('\n')[0]);
  }
}
console.log('结果', run.winner === 0 ? 'A 胜' : 'B 胜', '｜', run.reason, '｜', run.steps.length, '步');
