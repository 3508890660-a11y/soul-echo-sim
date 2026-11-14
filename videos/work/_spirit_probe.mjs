import { createGame, _testing as T, keywords } from '../../js/engine/rules.js';
import { BY_NAME, BY_ID } from '../../js/engine/cards.js';

function game(seed = 7) {
  const g = createGame({ seed, mulligan: false });
  T.setPhase(g, 'main1', 0);
  g.players[0].turnCount = 2; g.players[1].turnCount = 2; g.turn = 4;
  return g;
}
const name = (g, u) => BY_ID.get(g.cards[u].id).name;

// A. 灵体被阻挡后是否掉血
{
  const g = game();
  const before = g.players[1].life.length;
  const atk = T.put(g, 0, '烈焰斗士', 'field');
  const blk = T.put(g, 1, '新人冒险者', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [blk], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  for (let i = 0; i < 30; i++) if (!T.progressAutomatic(g)) break;
  console.log('A. 攻击灵体被阻挡：生命', before, '->', g.players[1].life.length);
  console.log('   日志：');
  for (const l of g.log.slice(-6)) console.log('     ' + l);
}

// B. 毁灭 + 碾压：打印关键词判断
{
  const g = game();
  const atk = T.put(g, 0, '焚城巨兵', 'field');
  const def = T.put(g, 1, '王牌巨象', 'field');
  const def2 = T.put(g, 1, '新人冒险者', 'field');
  const d = BY_NAME.get('焚城巨兵');
  d.keywords.push('毁灭');
  console.log('\nB. 焚城巨兵关键词：', d.keywords, '｜引擎读出：', keywords(g, atk));
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [def, def2], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  console.log('   巨象:', g.cards[def].zone, '｜新人冒险者:', g.cards[def2].zone);
  for (const l of g.log.slice(-12)) console.log('     ' + l);
  d.keywords.pop();
}
