import fs from 'node:fs';
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/engine/precons.js';
import { TACTICIAN } from '../js/ai/builtin.js';

const names = Object.keys(PRECONS), records = [];
const summary = Object.fromEntries(names.map((n) => [n, { games: 0, wins: 0, losses: 0, draws: 0 }]));
let match = 0, abnormal = 0;
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  for (let first = 0; first < 2; first++) {
    const seed = 20261112 + match * 97;
    const r = playMatch({ preconA: names[i], preconB: names[j], scriptA: TACTICIAN, scriptB: TACTICIAN, seed, first, record: false });
    const winnerName = r.winner == null ? null : names[r.winner === 0 ? i : j];
    const tokensOutside = Object.values(r.game.cards).filter((c) => c.token && ['hand', 'deck', 'life', 'essence'].includes(c.zone)).length;
    const errors = r.log.filter((x) => /脚本异常|非法动作|未实现卡牌效果|NaN|undefined/.test(x));
    if (tokensOutside || errors.length || r.reason?.includes('安全上限')) abnormal++;
    records.push({ match: ++match, A: names[i], B: names[j], first, seed, winner: winnerName, reason: r.reason, turns: r.game.turn, actions: r.actions, tokensOutside, errors });
    summary[names[i]].games++; summary[names[j]].games++;
    if (r.winner == null) { summary[names[i]].draws++; summary[names[j]].draws++; }
    else { summary[winnerName].wins++; summary[names[r.winner === 0 ? j : i]].losses++; }
    console.log(`${String(match).padStart(2)}｜${names[i]} vs ${names[j]}｜${winnerName || '平局'}｜${r.game.turn} 回合｜${r.actions} 动作`);
  }
}
const report = { generatedAt: new Date().toISOString(), scope: '30 局确定性脚本 AI 循环赛，仅用于引擎覆盖与故障发现，不是真人胜率或平衡评级', matches: records.length, abnormal, summary, records };
fs.mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../reports/round-robin.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n循环赛完成：${records.length} 局，异常 ${abnormal}。结果已写入 reports/round-robin.json。`);
if (abnormal) process.exitCode = 1;
