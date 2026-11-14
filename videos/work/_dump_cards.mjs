import { CARD_DATA } from '../../js/engine/cards.js';
const by = new Map(CARD_DATA.map(c => [c.name, c]));
for (const n of process.argv.slice(2)) {
  const c = by.get(n);
  if (!c) { console.log(n, '| MISSING'); continue; }
  const t = c.triggerText ? ` [${c.triggerText}]` : '';
  console.log(`${c.name}｜${c.color}｜${c.type}｜${c.cost.total}费(${c.cost.colored}+${c.cost.grey}灰)｜攻${c.attack} 冲${c.impact} 生${c.vitality}｜${(c.keywords||[]).join(' ')}${t}｜${c.text||'—'}`);
}
