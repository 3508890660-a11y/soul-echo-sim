/**
 * 阻挡专项审计：重跑一局，把战斗相关日志连同当时场面数值打出来。
 * 用法：node videos/work/_block_audit.mjs <aId> <bId> <mode> <seed> <first>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';

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

const KEY = /阻挡|践踏|碾压|毁灭|超冲击|攻击对方|反击|进入战斗|战斗伤害/;
console.log(`seed=${seed} first=${first}  ${A.id} vs ${B.id}  动作 ${run.actions}`);

for (let i = 0; i < run.steps.length; i++) {
  const s = run.steps[i];
  const lines = (s.text || '').split('\n').filter((x) => KEY.test(x));
  if (!lines.length) continue;
  const snap = s.snap;
  const field = (p, who) => p.field
    .filter((c) => c.type === '灵像' || c.token)
    .map((c) => `${c.name}[${c.atk}/${c.imp}/${c.hp}${c.damage ? `-${c.damage}` : ''}${c.tapped ? '·横' : ''}${c.keywords?.length ? '·' + c.keywords.join('') : ''}]`)
    .join(' ');
  console.log(`\n--- 步 ${i} T${snap.turn} ---`);
  for (const l of lines) console.log('  ' + l);
  console.log(`  场面 P0: ${field(snap.P[0])}`);
  console.log(`  场面 P1: ${field(snap.P[1])}`);
}
