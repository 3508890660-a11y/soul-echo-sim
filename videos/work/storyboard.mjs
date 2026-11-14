/**
 * 分镜骨架：从录好的对局里挑「可讲的时间点」，打印步索引与当时的生命、日志行。
 * 用法：node videos/work/storyboard.mjs videos/work/match-xxx.json [...]
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of process.argv.slice(2)) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = m.config;
  console.log(`\n================ ${path.basename(file)}`);
  console.log(`${c.mode} seed=${c.seed} first=${c.first} ｜ ${c.nameA}(${c.colorA}) ${c.deckNameA} vs ${c.nameB}(${c.colorB}) ${c.deckNameB}`);
  console.log(`winner=${m.result.winner} turns=${m.result.turns} steps=${m.steps.length} 终局 ${m.steps.at(-1).snap.P.map((p) => p.life).join(':')}`);

  const turnLife = new Map();
  m.steps.forEach((s) => turnLife.set(s.snap.turn, s.snap.P.map((p) => p.life)));
  console.log('走势 ' + [...turnLife].map(([t, l]) => `T${t} ${l[0]}:${l[1]}`).join('  '));

  // 每次生命变化的第一步
  const changes = [];
  let prev = m.steps[0].snap.P.map((p) => p.life);
  for (let i = 0; i < m.steps.length; i++) {
    const life = m.steps[i].snap.P.map((p) => p.life);
    if (life[0] !== prev[0] || life[1] !== prev[1]) {
      changes.push({ i, turn: m.steps[i].snap.turn, from: prev.join(':'), to: life.join(':'), text: m.steps[i].text.split('\n')[0] });
      prev = life;
    }
  }
  console.log(`生命变化 ${changes.length} 次，前 14 次：`);
  for (const ch of changes.slice(0, 14)) console.log(`  #${ch.i} T${ch.turn} ${ch.from}→${ch.to}  ${ch.text}`);

  // 单次伤害最大的事件
  const hits = [];
  for (let i = 0; i < m.steps.length; i++) {
    const t = m.steps[i].text;
    const mm = t.match(/受到 (\d+) 点生命伤害/);
    if (mm) hits.push({ i, turn: m.steps[i].snap.turn, n: Number(mm[1]), text: t.split('\n')[0] });
  }
  hits.sort((a, b) => b.n - a.n);
  console.log('最大单次生命伤害：');
  for (const h of hits.slice(0, 5)) console.log(`  #${h.i} T${h.turn} ${h.n} 点  ${h.text}`);

  const last = m.steps.length - 1;
  console.log('终局三步：');
  for (const s of m.steps.slice(-3)) console.log(`  #${m.steps.indexOf(s)} [T${s.snap.turn}] ${s.text.split('\n')[0]}`);
  console.log('lastIndex', last);
}
