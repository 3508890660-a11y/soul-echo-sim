/**
 * 录一局完整快照，供 produce.py 生成对局解说视频。
 * 用法：node videos/work/record_match.mjs <A> <B> <mode> <seed> <first>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playMatch, ENGINE_INFO } from '../../js/engine/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [aId, bId, mode, seedRaw, firstRaw, tag] = process.argv.slice(2);
const seed = Number(seedRaw);
const first = Number(firstRaw ?? 0);

const load = async (id) => {
  const mod = await import(`file://${path.join(ROOT, 'agents', `agent-${id}.js`).replace(/\\/g, '/')}`);
  const deck = Array.isArray(mod.deck)
    ? mod.deck
    : Object.entries(mod.deck || {}).flatMap(([name, count]) => Array(Number(count)).fill(name));
  return { id, mod, deck };
};

const A = await load(aId);
const B = await load(bId);
const run = playMatch({
  mode, seed, first, record: true, maxActions: 8000,
  deckA: A.deck, deckB: B.deck,
  colorA: A.mod.color, colorB: B.mod.color,
  spiritA: A.mod.spirit, spiritB: B.mod.spirit,
  scriptA: A.mod, scriptB: B.mod,
  nameA: A.mod.meta?.model || aId, nameB: B.mod.meta?.model || bId,
});

const out = {
  engine: 'Soul Echo 0.3.0',
  config: {
    mode, seed, first,
    nameA: A.mod.meta?.model || aId, nameB: B.mod.meta?.model || bId,
    deckNameA: A.mod.meta?.name || aId, deckNameB: B.mod.meta?.name || bId,
    spiritA: A.mod.spirit, spiritB: B.mod.spirit,
    colorA: A.mod.color, colorB: B.mod.color,
    cardsA: A.deck.length, cardsB: B.deck.length,
  },
  steps: run.steps,
  log: run.log,
  result: { winner: run.winner, reason: run.reason, actions: run.actions, turns: run.steps[run.steps.length - 1].snap.turn },
};
const file = path.join(ROOT, 'videos', 'work', `match-${mode}-${seed}${tag ? '-' + tag : ''}.json`);
fs.writeFileSync(file, JSON.stringify(out), 'utf8');
const finalLife = run.steps[run.steps.length - 1].snap.P.map((p) => p.life).join(':');
console.log(file);
console.log('winner', run.winner, '| turns', out.result.turns, '| final life', finalLife, '| steps', run.steps.length, '| actions', run.actions);
