/**
 * 阻挡与目标合法性批量扫描：跑 N 局随机对局，统计规则违背出现次数。
 * 用法：node videos/work/_block_scan.mjs [局数]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';
import { CARD_DATA } from '../../js/engine/cards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const N = Number(process.argv[2] || 40);

const RELIC = new Set(CARD_DATA.filter((c) => c.type === '灵性').map((c) => c.name));
const UNIT = new Set(CARD_DATA.filter((c) => c.type === '灵像').map((c) => c.name));

const AGENTS = [
  'kimi31pro', 'minimaxm3', 'deepseekv41flash', 'step5preview',
  'glm53flash', 'minimaxm31flash', 'hy4', 'deepseekv4pro',
  'glm53', 'hy3', 'qwen35max', 'kimi25',
];

async function load(id) {
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  return { id, mod, deck };
}

const pool = [];
for (const id of AGENTS) {
  try { pool.push(await load(id)); } catch { /* 缺文件就跳过 */ }
}
console.log(`载入 ${pool.length} 份脚本，跑 ${N} 局`);

const stat = {
  relicAsAttackTarget: 0,
  relicAsTrampleTarget: 0,
  relicDestroyedByCombat: 0,
  blockEvents: 0,
  attackerNoBacklash: 0,
  sameUnitMultiBlock: 0,
  relicBlockDeclared: 0,
};
const samples = [];

for (let i = 0; i < N; i++) {
  const A = pool[i * 2 % pool.length], B = pool[(i * 2 + 1) % pool.length];
  if (A === B) continue;
  const seed = 20270000 + i * 7919;
  let run;
  try {
    run = playMatch({
      mode: 'standard', seed, first: i % 2, record: true, maxActions: 6000,
      deckA: A.deck, deckB: B.deck,
      colorA: A.mod.color, colorB: B.mod.color,
      spiritA: A.mod.spirit, spiritB: B.mod.spirit,
      scriptA: A.mod, scriptB: B.mod,
      nameA: A.id, nameB: B.id,
    });
  } catch (e) { console.log(`局 ${i} 抛错：${e.message}`); continue; }

  const blockedThisTurn = new Map();
  for (const s of run.steps) {
    const t = s.text || '';
    // 攻击目标为灵性
    const m = t.match(/以【(.+?)】攻击对方【(.+?)】/);
    if (m && RELIC.has(m[2])) {
      stat.relicAsAttackTarget++;
      if (samples.length < 12) samples.push(`[攻击灵性] seed=${seed} ${t.split('\n')[0]}`);
    }
    // 践踏打到灵性
    const tr = t.match(/践踏将剩余攻击力分配给【(.+?)】/);
    if (tr && RELIC.has(tr[1])) {
      stat.relicAsTrampleTarget++;
      if (samples.length < 12) samples.push(`[践踏灵性] seed=${seed} ${tr[0]}`);
    }
    // 灵性被战斗破坏
    for (const line of t.split('\n')) {
      const dm = line.match(/^【(.+?)】被(状态检查|毁灭)破坏/);
      if (dm && RELIC.has(dm[1])) {
        stat.relicDestroyedByCombat++;
        if (samples.length < 12) samples.push(`[灵性被战斗破坏] seed=${seed} ${line}`);
      }
    }
    // 同回合同一灵像多次阻挡（按 uid 判定；同名多张是两回事）
    if (/宣告阻挡/.test(t)) {
      stat.blockEvents++;
      const bm = t.match(/【(.+?)】宣告阻挡/);
      if (bm) {
        if (RELIC.has(bm[1])) stat.relicBlockDeclared++;
        const uid = s.snap.combat?.blockers?.at(-1);
        const key = `${s.snap.turn}:${uid ?? bm[1]}`;
        const n = (blockedThisTurn.get(key) || 0) + 1;
        blockedThisTurn.set(key, n);
        if (n > 1) { stat.sameUnitMultiBlock++; if (samples.length < 12) samples.push(`[同回合多次阻挡] seed=${seed} ${bm[1]} uid=${uid} T${s.snap.turn}`); }
      }
    }
  }
}

console.log(JSON.stringify(stat, null, 2));
console.log('样例：');
for (const x of samples) console.log('  ' + x);
