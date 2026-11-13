import fs from 'node:fs';
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/engine/precons.js';
import { TACTICIAN } from '../js/ai/builtin.js';

const names = Object.keys(PRECONS);
const records = [];
let failed = 0;
function invariant(result, label) {
  const errors = [];
  const cards = Object.values(result.game.cards);
  if (cards.filter((c) => !c.token).length !== 80) errors.push('非衍生物数量不是 80');
  for (const c of cards) {
    if (!Number.isFinite(c.damage) || c.damage < 0) errors.push(`${c.uid} 伤害异常`);
    if (c.token && ['hand', 'deck', 'life', 'essence'].includes(c.zone)) errors.push(`衍生物进入非法区域 ${c.zone}`);
  }
  for (const p of result.game.players) {
    for (const [key, value] of Object.entries(p.stats)) if (!Number.isFinite(value)) errors.push(`${p.name} ${key} 非有限数`);
    if (p.life.length === 0 && !result.game.over) errors.push('生命为 0 但对局未结束');
  }
  if (result.log.some((x) => /脚本异常|非法动作|未实现卡牌效果|NaN|undefined/.test(x))) errors.push('日志包含异常回退或未实现效果');
  if (!result.game.over || result.reason?.includes('安全上限')) errors.push(`未正常结束：${result.reason}`);
  if (errors.length) failed++;
  return errors;
}

for (let i = 0; i < names.length; i++) {
  for (let first = 0; first < 2; first++) {
    const a = names[i], b = names[(i + 1) % names.length];
    const result = playMatch({ preconA: a, preconB: b, scriptA: TACTICIAN, scriptB: TACTICIAN, seed: 9100 + i * 10 + first, first, record: false });
    const errors = invariant(result, `${a} vs ${b}`);
    const row = { A: a, B: b, first, seed: 9100 + i * 10 + first, winner: result.winner, reason: result.reason, turns: result.game.turn, actions: result.actions, errors };
    records.push(row);
    console.log(`${errors.length ? '✗' : '✓'} ${a} vs ${b}｜先手 ${first === 0 ? 'A' : 'B'}｜${result.actions} 动作｜${result.reason}`);
    if (errors.length) console.error(`  ${errors.join('；')}`);
  }
}
fs.mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../reports/smoke.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), scope: '脚本 AI 引擎不变量测试，不是真人平衡结论', passed: records.length - failed, failed, records }, null, 2));
console.log(`\n预组冒烟：${records.length - failed}/${records.length} 通过。`);
if (failed) process.exitCode = 1;
