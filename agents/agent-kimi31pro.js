// 策略名称：赤蓝燃穿
// 选择理由：红色直伤与冲击压力缩短对局，蓝色过牌与反制提高稳定性。
// 主责模式：duo

export const meta = {
  id: 'kimi31pro',
  model: 'KIMI 3.1pro',
  modelId: 'kimi-k3.1-pro',
  name: '赤蓝燃穿',
  desc: '用低费灵像持续施压，以红色直伤终结，蓝色过牌和反制维持节奏。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  火焰鸟: 4,
  地狱犬: 4,
  烈焰斗士: 3,
  火球术: 4,
  爆燃: 4,
  血怒: 2,
  灰烬小僧: 3,
  熔岩投手: 2,
  烈焰战将: 2,
  焚尽: 2,
  炽焰学者: 2,
  预案引燃: 2,
  智慧之光: 4,
  奥术飞弹: 4,
  分解射线: 2,
  法术反制: 2,
  彩虹喷射: 2,
  浮空书库: 2,
};

export const spirit = '余烬执火者';
export const color = '红';

const atkOf = (card) => Number(card && (card.atk ?? card.attack)) || 0;
const impOf = (card) => Number(card && (card.imp ?? card.impact)) || 0;
const hpOf = (card) => Number(card && (card.hp ?? card.vitality)) || 0;
const costOf = (card) => Number(card && card.cost && card.cost.total) || 0;

function inZone(zone, uid) {
  return (zone || []).find((card) => card && card.uid === uid) || null;
}

function fieldCard(view, uid) {
  if (!uid || typeof uid !== 'string') return null;
  return inZone(view.me.field, uid) || inZone(view.opp.field, uid);
}

function handCard(view, move) {
  return inZone(view.me.hand, move.uid);
}

function targetCards(view, move) {
  return (move.targets || [])
    .map((target) => fieldCard(view, typeof target === 'string' ? target : target && target.uid))
    .filter(Boolean);
}

function ownTarget(view, move) {
  return targetCards(view, move).find((card) => inZone(view.me.field, card.uid)) || null;
}

function enemyTargets(view, move) {
  return targetCards(view, move).filter((card) => inZone(view.opp.field, card.uid));
}

function unitValue(card) {
  if (!card) return 0;
  return costOf(card) * 120 + atkOf(card) / 10 + impOf(card) * 80 + hpOf(card) / 20;
}

function bestMove(moves, score) {
  let selected = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const value = score(move);
    if (value > bestScore) {
      selected = move;
      bestScore = value;
    }
  }
  return selected;
}

function cardColors(card) {
  if (!card) return [];
  if (card.name === '炽焰学者' || card.name === '预案引燃') return ['红', '蓝'];
  if (card.cost && card.cost.colors) {
    const colors = Object.keys(card.cost.colors).filter((key) => card.cost.colors[key]);
    if (colors.length) return colors;
  }
  return card.color ? [card.color] : [];
}

function essenceScore(view, move) {
  const card = handCard(view, move);
  if (!card) return -1000;
  const count = view.me.essence.length;
  const needsRamp = view.me.hand.some((item) => costOf(item) > count);
  if (count >= 8 && !needsRamp) return -100;
  if (count >= 10 || (view.me.handCount <= 1 && count >= 6)) return -50;

  let score = count < 8 ? 900 : 260;
  score += costOf(card) * 9;
  if (costOf(card) > count + 1) score += 30;
  if (card.name === '火球术' || card.name === '焚尽') score -= 75;
  if (card.name === '法术反制') score -= 25;

  const red = view.me.essence.filter((item) => cardColors(item).includes('红')).length;
  const blue = view.me.essence.filter((item) => cardColors(item).includes('蓝')).length;
  const colors = cardColors(card);
  const blueDemand = view.me.hand.filter((item) => cardColors(item).includes('蓝')).length;
  if (colors.includes('红') && red < 3) score += 130 - red * 25;
  if (colors.includes('蓝') && blue < 2 && blueDemand >= 2) score += 115 - blue * 25;
  if (colors.includes('蓝') && red >= 3 && blue === 0 && blueDemand > 0) score += 80;
  return score;
}

function directDamage(card, view) {
  if (!card) return 0;
  if (card.name === '火球术') return 2;
  if (card.name === '焚尽') {
    return view.me.field.some((item) => item.type === '灵像') ? 3 : 4;
  }
  if (card.name === '炽焰学者') return 1;
  return 0;
}

function drawPenalty(view) {
  let score = 0;
  if (view.me.handCount >= 7) score -= 550;
  if (view.me.deck <= 2) score -= 1200;
  else if (view.me.deck <= 6) score -= 400;
  return score;
}

function playScore(view, move) {
  const card = handCard(view, move);
  if (!card) return -1000;
  const cost = costOf(card);
  let score = 0;

  if (card.type === '灵像') {
    score = 570 + cost * 35 + atkOf(card) / 100 + impOf(card) * 35;
    if ((card.keywords || []).includes('预制')) score += 70;
    if (!view.me.field.some((item) => item.type === '灵像')) score += 40;
    return score;
  }

  if (card.type === '灵性') {
    const spells = view.me.hand.filter((item) => item.type === '灵感').length;
    return 610 + spells * 25 + (view.phase === 'main1' ? 40 : 0);
  }

  const burn = directDamage(card, view);
  if (burn) {
    score = card.name === '焚尽' ? 830 : 720;
    if (view.mode === 'blitz') score += 150;
    if (view.opp.life <= 4) score += 350;
    if (burn > view.opp.life) score += 100000;
    return score;
  }

  if (card.name === '智慧之光') {
    return 430 + Math.max(0, 6 - view.me.handCount) * 35 + drawPenalty(view);
  }
  if (card.name === '法术反制') {
    const enemyChain = view.chain.some((item) => item.controller !== view.me.idx && !item.countered);
    return enemyChain ? 4200 + view.chain.length * 15 : -500;
  }
  if (card.name === '血怒') {
    const target = ownTarget(view, move);
    if (!target || view.phase !== 'main1') return -250;
    score = 500 + atkOf(target) / 80 + (target.tapped ? -250 : 80);
    if (!target.tapped && impOf(target) + 1 > view.opp.life) score += 1500;
    return score;
  }

  const enemies = enemyTargets(view, move);
  if (!enemies.length) return -400;
  const target = enemies[0];
  const threat = enemies.reduce((sum, item) => sum + unitValue(item), 0) / 5;

  if (card.name === '爆燃') {
    const damage = target.damage > 0 ? 3000 : 1000;
    return 590 + threat + (damage >= hpOf(target) ? 1100 : 0) + (target.damage > 0 ? 100 : 0);
  }
  if (card.name === '奥术飞弹') {
    return 620 + threat + (hpOf(target) <= 2000 ? 1050 : 0) + drawPenalty(view);
  }
  if (card.name === '预案引燃') {
    return 650 + threat + (hpOf(target) <= 2000 ? 1050 : 0) + drawPenalty(view);
  }
  if (card.name === '分解射线') {
    score = 720 + threat;
    if (move.mode === 'destroy2') score += 180;
    if (move.mode === 'both') score += 320;
    if (move.mode === 'condense') score -= 80;
    return score;
  }
  if (card.name === '彩虹喷射') {
    return 450 + costOf(target) * 110 + drawPenalty(view);
  }
  return 300 + cost * 20;
}

function abilityScore(view, move) {
  const card = inZone(view.me.field, move.uid) || inZone(view.me.essence, move.uid);
  if (!card) return -500;
  if (card.name === '炽焰学者') {
    return view.opp.life < 1 ? 100000 : 760;
  }
  if (card.name === '熔岩投手') {
    const target = enemyTargets(view, move)[0];
    if (target && hpOf(target) <= 1000) return 1050 + unitValue(target) / 5;
    return view.phase === 'main2' ? 300 : -100;
  }
  return 280;
}

function attackScore(view, move) {
  const attacker = inZone(view.me.field, move.uid);
  if (!attacker) return -500;
  const attack = atkOf(attacker);
  const impact = impOf(attacker);
  if (move.target === 'spirit') {
    let score = 520 + impact * 190 + attack / 100;
    if (impact > view.opp.life) score += 100000;
    if ((attacker.keywords || []).includes('敏捷')) score += 70;
    return score;
  }
  const target = fieldCard(view, move.target);
  if (!target) return -300;
  const kills = attack >= hpOf(target);
  const survives = hpOf(attacker) > atkOf(target);
  let score = kills ? 430 + unitValue(target) / 5 : 20;
  if (survives) score += 100;
  if ((attacker.keywords || []).includes('先攻') && kills) score += 100;
  if ((attacker.keywords || []).includes('践踏') && kills) score += 80;
  return score;
}

function supportScore(view, move) {
  if (move.type !== 'supportSpirit') return 0;
  const attacker = inZone(view.me.field, view.combat.attackerUid);
  if (!attacker) return 100;
  if (view.combat.target === 'spirit') {
    return impOf(attacker) + 1 > view.opp.life ? 100000 : 1100;
  }
  const target = fieldCard(view, view.combat.target);
  return target && atkOf(attacker) + 1000 >= hpOf(target) ? 900 : 250;
}

function blockerScore(view, move) {
  if (move.type === 'pass') return 0;
  if (move.type !== 'block' || view.combat.target !== 'spirit') return -1000;
  const blocker = inZone(view.me.field, move.uid);
  const attacker = inZone(view.opp.field, view.combat.attackerUid);
  if (!blocker || !attacker) return -1000;

  const impact = impOf(attacker);
  const lethal = impact > view.me.life;
  const emergency = impact >= view.me.life;
  const kills = atkOf(blocker) >= hpOf(attacker);
  const survives = hpOf(blocker) > atkOf(attacker);
  let score = lethal ? 1400 : emergency ? 900 : 0;

  if (kills) score += survives ? 480 : 280;
  else if (survives) score += 110;
  else if (!emergency) score -= 300;
  score += (unitValue(attacker) - unitValue(blocker)) / 12;
  if (view.me.life <= 3) score += 160;
  return score;
}

function chooseBlockers(view, moves) {
  const chosen = view.combat.blockers || [];
  const attacker = inZone(view.opp.field, view.combat.attackerUid);
  const chosenAttack = chosen.reduce((sum, uid) => sum + atkOf(inZone(view.me.field, uid)), 0);
  if (attacker && chosen.length && chosenAttack >= hpOf(attacker)) {
    return moves.find((move) => move.type === 'pass') || null;
  }
  const fresh = moves.filter((move) => move.type !== 'block' || !chosen.includes(move.uid));
  return bestMove(fresh, (move) => blockerScore(view, move));
}

function orderScore(view, move) {
  const order = move.order || [];
  return order.reduce((score, uid, index) => {
    return score - unitValue(inZone(view.me.field, uid)) * (order.length - index);
  }, 0);
}

function normalScore(view, move) {
  switch (move.type) {
    case 'setEssence': return essenceScore(view, move);
    case 'play': return playScore(view, move);
    case 'ability': return abilityScore(view, move);
    case 'spiritSpecial': {
      const target = ownTarget(view, move);
      if (!target) return 100;
      return 860 + atkOf(target) / 100 + impOf(target) * 40 + (target.tapped ? -300 : 100);
    }
    case 'spiritDraw': return 350 + drawPenalty(view);
    case 'tapEssence': return -1000;
    case 'pass': return 0;
    default: return 0;
  }
}

export function choose(view, moves) {
  try {
    if (view.inspect) {
      const take = moves.find((move) => move.type === 'inspectTake');
      const reveal = moves.find((move) => move.type === 'inspectReveal');
      const card = view.inspect.card;
      if (reveal && card && view.me.handCount < 7 && view.me.deck > 2) {
        if (directDamage(card, view) || costOf(card) <= view.me.essence.length + 1) return reveal;
      }
      return take || reveal || moves.find((move) => move.type === 'pass');
    }

    if (view.combat && view.combat.stage === 'order') {
      const orders = moves.filter((move) => move.type === 'orderBlockers');
      return bestMove(orders, (move) => orderScore(view, move));
    }
    if (view.combat && view.combat.stage === 'blockers') return chooseBlockers(view, moves);
    if (view.combat && view.combat.stage === 'attackers') {
      return bestMove(moves, (move) => move.type === 'attack' ? attackScore(view, move) : 0);
    }
    if (view.combat && view.combat.stage === 'support') {
      return bestMove(moves, (move) => supportScore(view, move));
    }

    const selected = bestMove(moves, (move) => normalScore(view, move));
    if (selected) return selected;
  } catch (error) {
    // 异常时只退回引擎给出的让过动作。
  }
  return moves.find((move) => move.type === 'pass') || moves[moves.length - 1];
}
