/** 复现「同回合多次阻挡」样例。用法：node videos/work/_block_repro.mjs <seed> <turn> */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch } from '../../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function load(id) {
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  return { id, mod, deck };
}
const A = await load('deepseekv41flash');
const B = await load('step5preview');
const seed = Number(process.argv[2] || 20277919);
const turn = Number(process.argv[3] || 18);
const run = playMatch({
  mode: 'standard', seed, first: 1, record: true, maxActions: 6000,
  deckA: A.deck, deckB: B.deck,
  colorA: A.mod.color, colorB: B.mod.color,
  spiritA: A.mod.spirit, spiritB: B.mod.spirit,
  scriptA: A.mod, scriptB: B.mod,
  nameA: A.id, nameB: B.id,
});
const log = run.log;
const start = log.findIndex((x) => x.includes(`第 ${turn} 回合`));
const end = log.findIndex((x, i) => i > start && x.includes(`第 ${turn + 1} 回合`));
console.log(`seed=${seed} 第 ${turn} 回合日志（${start}→${end}）`);
for (let i = start; i < (end < 0 ? log.length : end); i++) console.log(`${i}: ${log[i]}`);
