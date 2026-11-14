/**
 * 逐回合打印「谁用什么打了多少」，用于写解说词。
 * 用法：node videos/work/turn_dump.mjs videos/work/match-x.json 10 11 12
 */
import fs from 'node:fs';
import path from 'node:path';

const [file, ...turnArgs] = process.argv.slice(2);
const turns = new Set(turnArgs.map(Number));
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const hit = /使用【|以【|受到 .* 伤害|被状态检查破坏|碾压|陷阱|攻击未被阻挡|生命伤害事件结束/;
let cur = null;
for (const s of m.steps) {
  const t = s.snap.turn;
  if (turns.size && !turns.has(t)) continue;
  if (t !== cur) { console.log(`--- T${t}　${s.snap.P.map((p) => p.life).join(':')}`); cur = t; }
  for (const line of s.text.split('\n')) {
    if (hit.test(line) && !/支付|状态推进|进入.*步骤/.test(line)) console.log('   ' + line.trim());
  }
}
