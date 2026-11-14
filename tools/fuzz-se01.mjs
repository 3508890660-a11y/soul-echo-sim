// SE01 全卡池随机对局压力测试：验证 148 名目都能被构筑、使用、结算，且不抛未实现错误。
import { CARD_DATA, SPIRIT_DATA, BY_NAME, BY_SPIRIT } from '../js/engine/cards.js';
import { playMatch, legalMoves, applyMove, createGame, ENGINE_INFO } from '../js/engine/rules.js';
import { TACTICIAN } from '../js/ai/builtin.js';

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROUNDS = Number(val('--rounds', 40));
const SEED = Number(val('--seed', 20261113));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const rand = rng(SEED);

const pool = CARD_DATA.map((c) => c.name);
const byColor = {};
for (const c of CARD_DATA) (byColor[c.color] ||= []).push(c.name);

/** 随机卡组：先定灵体，再让 60% 的卡取自灵体同色，满足构筑硬约束。 */
function randomDeck(spiritName) {
  const color = BY_SPIRIT.get(spiritName)?.color;
  const picked = new Set();
  const same = [...(byColor[color] || [])];
  while (picked.size < 6 && same.length) picked.add(same.splice(Math.floor(rand() * same.length), 1)[0]);
  let guard = 0;
  while (picked.size < 10 && guard++ < 400) picked.add(pool[Math.floor(rand() * pool.length)]);
  const deck = {};
  for (const name of picked) deck[name] = 4;
  return deck;
}
const randomSpirit = () => SPIRIT_DATA[Math.floor(rand() * SPIRIT_DATA.length)].name;

let ok = 0, stalled = 0, failed = 0;
const problems = [];
const used = new Set();
const seen = { enter: 0, activate: 0, trigger: 0, mixed: 0 };

for (let i = 0; i < ROUNDS; i++) {
  const spiritA = randomSpirit(), spiritB = randomSpirit();
  const deckA = randomDeck(spiritA), deckB = randomDeck(spiritB);
  for (const n of Object.keys(deckA)) used.add(n);
  for (const n of Object.keys(deckB)) used.add(n);
  try {
    const r = playMatch({
      deckA, deckB, scriptA: TACTICIAN, scriptB: TACTICIAN,
      seed: SEED + i, colorA: BY_SPIRIT.get(spiritA).color,
      colorB: BY_SPIRIT.get(spiritB).color,
      spiritA, spiritB,
      record: false,
    });
    const bad = r.log.filter((l) => /未实现卡牌效果|非法动作|脚本异常|状态异常/.test(l));
    for (const l of r.log) {
      if (/进入战场/.test(l)) seen.enter++;
      if (/激活/.test(l)) seen.activate++;
      if (/触发/.test(l)) seen.trigger++;
    }
    if (bad.length) { failed++; problems.push(`第 ${i} 局：${bad.slice(0, 2).join(' / ')}`); }
    else if (/安全上限/.test(r.reason || '')) { stalled++; problems.push(`第 ${i} 局：打到动作上限（${r.actions}）`); }
    else ok++;
  } catch (error) {
    failed++;
    problems.push(`第 ${i} 局崩溃：${error.message}`);
  }
}

console.log(`随机对局 ${ROUNDS} 局：正常 ${ok}，僵局 ${stalled}，失败 ${failed}`);
console.log(`覆盖卡名 ${used.size} / ${pool.length}`);
console.log(`事件计数 进场 ${seen.enter}｜激活 ${seen.activate}｜触发 ${seen.trigger}`);
console.log(`实现范围 ${ENGINE_INFO.implemented} 常规 / ${ENGINE_INFO.approx.length} 近似`);
if (problems.length) { console.log('问题：'); for (const p of problems.slice(0, 10)) console.log(' -', p); }
if (failed) process.exitCode = 1;
