import { createGame, _testing as T, unitAtk, unitHp } from '../../js/engine/rules.js';
import { BY_ID } from '../../js/engine/cards.js';

const D = (g, uid) => BY_ID.get(g.cards[uid].id);

function game(seed = 7) {
  const g = createGame({ seed, mulligan: false });
  T.setPhase(g, 'main1', 0);
  g.players[0].turnCount = 2; g.players[1].turnCount = 2; g.turn = 4;
  return g;
}
const settle = (g, n = 12) => { for (let i = 0; i < n; i++) if (!T.progressAutomatic(g)) break; };

function dump(g, tag) {
  settle(g);
  console.log(`\n### ${tag}`);
  for (const p of g.players) {
    console.log(` P${p.idx}: ` + (p.field.map((u) => {
      const d = D(g, u);
      return `${d.name}(${d.type})[atk${unitAtk(g, u, null)}/hp${unitHp(g, u)}/dmg${g.cards[u].damage}]`;
    }).join(' ') || '(空)'));
  }
  console.log(' 日志尾：');
  for (const l of g.log.slice(-8)) console.log('   ' + l);
}

// 场景一：践踏溢出是否打到「灵性」卡
{
  const g = game();
  const atk = T.put(g, 0, '焚城巨兵', 'field');
  const blk = T.put(g, 1, '新人冒险者', 'field');
  const rel = T.put(g, 1, '骸骨祭坛', 'field');
  console.log('焚城巨兵:', D(g, atk).keywords, '｜骸骨祭坛 type:', D(g, rel).type, 'hp:', unitHp(g, rel));
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [blk], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  dump(g, '践踏溢出（对方场上有灵性卡）');
  console.log('>>> 骸骨祭坛 区域=', g.cards[rel].zone, ' 伤害=', g.cards[rel].damage);
}

// 场景二：单阻挡，攻击力远超阻挡者生命
{
  const g = game();
  const atk = T.put(g, 0, '焚城巨兵', 'field');
  const blk = T.put(g, 1, '新人冒险者', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [blk], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  dump(g, '单阻挡 6500 vs 2000');
  console.log('>>> 阻挡者记录伤害=', g.cards[blk].damage, ' 区域=', g.cards[blk].zone);
}

// 场景三：碾压阻挡者 vs 有先攻的攻击者
{
  const g = game();
  const atk = T.put(g, 0, '烈焰斗士', 'field');
  const def = T.put(g, 1, '王牌巨象', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [def], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  dump(g, '烈焰斗士 3500 先攻 打 巨象 7000 碾压');
}
