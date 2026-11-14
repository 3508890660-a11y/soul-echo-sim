/**
 * 打印每局「每个回合的最后一步索引」与「首血步索引」，供分镜取帧。
 * 用法：node videos/work/turn_index.mjs videos/work/match-*.json
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of process.argv.slice(2)) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lastOfTurn = new Map();
  m.steps.forEach((s, i) => lastOfTurn.set(s.snap.turn, i));
  const lifeAt = (i) => m.steps[i].snap.P.map((p) => p.life).join(':');
  const turns = [...lastOfTurn].map(([t, i]) => `T${t}:#${i}(${lifeAt(i)})`).join(' ');
  const firstBlood = m.steps.findIndex((s, i) => i > 0
    && (s.snap.P[0].life !== m.steps[i - 1].snap.P[0].life || s.snap.P[1].life !== m.steps[i - 1].snap.P[1].life));
  const open = m.steps.findIndex((s) => s.snap.turn === 1 && s.text.includes('将 1 张手牌置于灵质区'));
  console.log(`\n${path.basename(file)}  首血#${firstBlood}(${lifeAt(firstBlood)}) 开局#${open} 末#${m.steps.length - 1}`);
  console.log(turns);
}
