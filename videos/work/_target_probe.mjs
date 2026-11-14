import { createGame, legalMoves, _testing as T, unitHp } from '../../js/engine/rules.js';
import { BY_ID } from '../../js/engine/cards.js';
const D = (g, uid) => BY_ID.get(g.cards[uid].id);

const g = createGame({ seed: 7, mulligan: false });
T.setPhase(g, 'main1', 0);
g.players[0].turnCount = 2; g.players[1].turnCount = 2; g.turn = 4;

const atk = T.put(g, 0, '烈焰斗士', 'field');
const unit = T.put(g, 1, '新人冒险者', 'field');
const rel = T.put(g, 1, '骸骨祭坛', 'field');
T.setCombat(g, { stage: 'attackers', attackerUid: null, blockers: [] });
g.priority = 0;

const moves = legalMoves(g).filter((m) => m.type === 'attack' && m.uid === atk);
console.log('可宣告的攻击目标：');
for (const m of moves) {
  const label = m.target === 'spirit' ? '灵体' : `${D(g, m.target).name}(${D(g, m.target).type})`;
  console.log('  ->', label);
}
console.log('\n规则书 7.1-2：目标为「对方灵体或 1 只合法灵像」；灵性卡不是合法目标。');
