// 策略名称：烬骨连锁
// 选择理由：红黑低费单位、祭献移除与直伤能互相转化，缩短对手组织防线的时间。
// 主责模式：duo

export const meta = {
  id: 'kimi31pro',
  model: 'KIMI 3.1pro',
  modelId: 'kimi-k3.1-pro',
  name: '烬骨连锁',
  desc: '以低费灵像维持祭品供应，用祭献、终曲与直伤连续削空生命卡组。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  火焰鸟: 4,
  灰烬小僧: 4,
  地狱犬: 4,
  烈焰斗士: 4,
  爆燃: 4,
  火球术: 4,
  焚尽: 2,
  烈焰战将: 2,
  自杀式袭击: 4,
  灵质榨取: 4,
  蹒跚的僵尸: 4,
  掘墓人: 2,
  灵魂交易: 2,
  燃魂: 4,
  血焰狂徒: 2,
};

export const spirit = '余烬执火者';
export const color = '红';

const num = (value) => Number.isFinite(value) ? value : 0;
const atk = (card) => num(card?.atk ?? card?.attack);
const imp = (card) => num(card?.imp ?? card?.impact);
const hpLeft = (card) => Math.max(0, num(card?.hp ?? card?.vitality) - num(card?.damage));
const cost = (card) => num(card?.cost?.total);
const has = (card, word) => Array.isArray(card?.keywords) && card.keywords.includes(word);
const findCard = (cards, uid) => (cards || []).find((card) => card.uid === uid);
const isMain = (view) => view.active === view.me.idx
  && (view.phase === 'main1' || view.phase === 'main2') && !view.chain.length;

function pickBest(moves, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const value = score(move);
    if (Number.isFinite(value) && value > bestScore) {
      best = move;
      bestScore = value;
    }
  }
  return best;
}

function ownValue(card) {
  if (!card) return 0;
  let value = 8 + cost(card) * 4 + atk(card) / 650 + imp(card) * 9 + hpLeft(card) / 1300;
  if (has(card, '预制')) value += 4;
  if (has(card, '敏捷')) value += 4;
  if (has(card, '先攻')) value += 5;
  if (has(card, '守护')) value += 4;
  if (card.tapped) value -= 5;
  if (card.doomed) value -= 12;
  return value;
}

function enemyValue(card) {
  if (!card) return 0;
  let value = 10 + cost(card) * 4 + atk(card) / 550 + imp(card) * 11 + hpLeft(card) / 1200;
  if (card.type === '灵性') value = 12 + cost(card) * 5 + hpLeft(card) / 1200;
  if (has(card, '预制')) value += 5;
  if (has(card, '敏捷')) value += 5;
  if (has(card, '先攻')) value += 7;
  if (has(card, '超冲击')) value += 7;
  if (has(card, '践踏')) value += 4;
  return value;
}

function deathDamage(card) {
  return card && (card.name === '灰烬小僧' || card.name === '烈焰战将') ? 1 : 0;
}

function fodderScore(card, view) {
  if (!card) return -100;
  let score = 48 - ownValue(card) * 1.7;
  if (card.token) score += 60;
  if (card.name === '灰烬小僧') score += 82;
  if (card.name === '烈焰战将') score += 24;
  if (card.name === '蹒跚的僵尸') {
    score += view.opp.field.length ? 34 : -28;
    if (view.me.life <= 4) score -= 45;
  }
  if (card.tapped) score += 12;
  score += Math.min(15, num(card.damage) / 250);
  if (card.doomed) score += 35;
  return score;
}

function requirements(card) {
  const colored = card?.cost?.colors;
  if (colored && Object.keys(colored).length) return Object.entries(colored);
  return num(card?.cost?.colored) > 0 ? [[card.color, num(card.cost.colored)]] : [];
}

function essenceScore(view, move) {
  const me = view.me;
  const candidate = findCard(me.hand, move.uid);
  if (!candidate) return -100;
  const count = me.essence.length;
  const needsSix = me.hand.some((card) => cost(card) >= 6);
  const target = needsSix ? 6 : 5;
  let score = count < target ? 128 - count * 7 : 4;
  if (count >= target && count < 7) {
    const missing = me.hand.some((card) => requirements(card).some(([name, amount]) => {
      const sources = me.essence.filter((item) => item.color === name).length;
      return sources < amount;
    }));
    if (missing) score = 34;
  }
  if (me.handCount <= 2 && count >= 4) score -= 35;

  const sources = { 红: 0, 黑: 0 };
  for (const item of me.essence) {
    if (item.color === '红' || item.color === '黑') sources[item.color]++;
  }
  const need = { 红: 0, 黑: 0 };
  for (const card of me.hand) {
    if (card.uid === candidate.uid) continue;
    for (const [name, amount] of requirements(card)) {
      if (name !== '红' && name !== '黑') continue;
      const deficit = Math.max(0, amount - sources[name]);
      need[name] += deficit * (1.4 - Math.min(0.6, cost(card) / 10));
    }
  }
  if (candidate.color === '红' || candidate.color === '黑') {
    score += need[candidate.color] * 13;
    if (!need[candidate.color]) score -= 12;
    if (sources[candidate.color] >= 4 && need[candidate.color] === 0) score -= 9;
  }

  const copies = me.hand.filter((card) => card.name === candidate.name).length;
  if (copies > 1) score += 18;
  if (candidate.name === '焚尽' || candidate.name === '烈焰战将') score -= 13;
  if (candidate.name === '火球术' || candidate.name === '燃魂') score -= 8;
  if (candidate.name === '灵魂交易' && !me.grave.length) score += 14;
  if (candidate.name === '爆燃' && !view.opp.field.some((card) => card.type === '灵像')) score += 12;
  if (cost(candidate) >= 6 && count < 4) score += 12;
  return score;
}

function damageScore(view, target, amount) {
  if (!target) return -100;
  const lethal = amount >= hpLeft(target);
  if (view.me.field.some((card) => card.uid === target.uid)) {
    if (deathDamage(target) && lethal) return view.opp.life < 1 ? 1000 : 12;
    return -120;
  }
  let score = enemyValue(target) + amount / 120;
  if (lethal) score += 52;
  if (has(target, '碾压') && !lethal) score -= 80;
  if (view.combat && target.uid === view.combat.attackerUid) score += lethal ? 70 : 18;
  return score;
}

function directScore(view, amount) {
  let score = 48 + amount * 25;
  if (amount > view.opp.life) score += 1000;
  else if (view.opp.life <= 4) score += 25;
  return score;
}

function playScore(view, move) {
  const me = view.me;
  const card = findCard(me.hand, move.uid);
  if (!card) return -100;
  const main = isMain(view);
  const name = card.name;

  if (name === '爆燃') {
    const targetUid = move.targets[0];
    const target = findCard([...me.field, ...view.opp.field], targetUid);
    const amount = num(target?.damage) > 0 ? 3000 : 1000;
    const score = 17 + damageScore(view, target, amount);
    return main ? score : score - (amount >= hpLeft(target) ? 0 : 35);
  }
  if (name === '火球术') return main ? directScore(view, 2) : (2 > view.opp.life ? 1000 : -12);
  if (name === '焚尽') {
    const amount = me.field.some((item) => item.type === '灵像') ? 3 : 4;
    return main ? directScore(view, amount) + 5 : (amount > view.opp.life ? 1000 : -12);
  }
  if (name === '燃魂') {
    const fodder = findCard(me.field, move.targets[0]);
    const amount = 2 + deathDamage(fodder);
    let score = directScore(view, amount) + fodderScore(fodder, view) * 0.65;
    if (fodder?.name === '蹒跚的僵尸' && view.opp.field.length) score += 35;
    if (!main && amount <= view.opp.life) score -= 90;
    return score;
  }
  if (name === '自杀式袭击') {
    const fodder = findCard(me.field, move.targets[0]);
    const target = findCard(view.opp.field, move.targets[1]);
    let score = 22 + enemyValue(target) * 1.15 + fodderScore(fodder, view) * 0.75;
    score += deathDamage(fodder) * 22;
    if (view.combat && target?.uid === view.combat.attackerUid) score += 55;
    if (!main && target?.uid !== view.combat?.attackerUid) score -= 30;
    return score;
  }
  if (name === '灵质榨取') {
    if (me.deck <= 2 && me.life <= 3) return -100;
    let score = move.mode === 'bury' ? 47 : 32;
    if (move.mode === 'bury' && me.handCount < 4) score -= 22;
    if (me.handCount <= 2) score += 18;
    if (me.handCount >= 7) score -= 16;
    if (me.deck < 8) score -= 15;
    return main ? score : score - 5;
  }
  if (name === '灵魂交易') {
    if (!move.targets.length) return -100;
    const target = findCard(me.grave, move.targets[0]);
    if (!target) return -100;
    let score = 27 + cost(target) * 5 + imp(target) * 5;
    if (target.name === '燃魂' || target.name === '火球术' || target.name === '灰烬小僧') score += 20;
    if (me.handCount <= 3) score += 20;
    return main ? score : score - 12;
  }

  if (card.type === '灵像') {
    let score = 48 + cost(card) * 4 + atk(card) / 1000 + imp(card) * 9 + num(card.vitality) / 1600;
    if (name === '灰烬小僧') score += 15;
    if (name === '地狱犬' || name === '烈焰斗士') score += 14;
    if (name === '烈焰战将') score += 24;
    if (name === '血焰狂徒') score += 10;
    if (name === '蹒跚的僵尸') score += view.opp.field.length ? 8 : -8;
    if (view.phase === 'main1') score += has(card, '预制') ? 18 : -13;
    if (view.phase === 'main2') score += 12;
    return score;
  }
  return 25;
}

function mainScore(view, move) {
  if (move.type === 'play') return playScore(view, move);
  if (move.type === 'setEssence') return essenceScore(view, move);
  if (move.type === 'pass') return 0;
  if (move.type === 'tapEssence') return -30;
  if (move.type === 'spiritDraw') {
    if (!isMain(view)) return -40;
    let score = view.me.handCount <= 5 ? 57 : 39;
    if (view.me.deck < 6) score -= 18;
    return score;
  }
  if (move.type === 'spiritSpecial') {
    if (view.phase !== 'main1' || !isMain(view)) return -35;
    const target = findCard(view.me.field, move.targets[0]);
    if (!target || target.tapped) return -20;
    return 72 + imp(target) * 12 + atk(target) / 800 + (has(target, '预制') ? 8 : 0);
  }
  if (move.type === 'ability') {
    const source = findCard([...view.me.field, ...view.me.essence], move.uid);
    if (source?.name === '血焰狂徒') {
      const fodder = findCard(view.me.field, move.targets[0]);
      return 43 + fodderScore(fodder, view) * 0.8 + (view.phase === 'main1' ? 16 : 0);
    }
    return 20;
  }
  return -10;
}

function legalBlocker(blocker, attacker) {
  if (!blocker || blocker.type !== '灵像') return false;
  if (blocker.tapped && !has(blocker, '守护')) return false;
  if (has(attacker, '敏捷') && !has(blocker, '敏捷') && !(blocker.tapped && has(blocker, '守护'))) return false;
  return true;
}

function attackScore(view, move) {
  if (move.type === 'pass') return 25;
  const attacker = findCard(view.me.field, move.uid);
  if (!attacker) return -100;
  const attack = atk(attacker);
  const impact = imp(attacker);
  if (move.target === 'spirit') {
    const blockers = view.opp.field.filter((card) => legalBlocker(card, attacker));
    const possibleImpact = impact + (view.me.spirit.crit > 0 ? 1 : 0);
    let score = 51 + impact * 23;
    if (possibleImpact > view.opp.life) score += 1000;
    if (view.opp.life <= 4) score += 25;
    if (!blockers.length) score += 52;
    else {
      const badTrade = blockers.every((blocker) => atk(blocker) >= hpLeft(attacker)
        && !(has(attacker, '先攻') && attack >= hpLeft(blocker)));
      if (badTrade) score -= deathDamage(attacker) ? 12 : 43;
      if (attacker.doomed) score += 35;
    }
    return score;
  }
  const target = findCard(view.opp.field, move.target);
  if (!target) return -100;
  const kills = attack >= hpLeft(target);
  const safe = target.type !== '灵像' || (has(attacker, '先攻') && kills) || atk(target) < hpLeft(attacker);
  let score = 29 + enemyValue(target) * 0.75;
  if (kills) score += 43;
  else score -= 22;
  if (!safe) score -= ownValue(attacker) * 1.15;
  if (deathDamage(attacker) && !safe) score += 22;
  if (target.type === '灵性') score += 18;
  return score;
}

function blockScore(view, move) {
  const combat = view.combat;
  const attacker = findCard(view.opp.field, combat.attackerUid);
  if (!attacker) return 100;
  const chosen = combat.blockers || [];
  const currentCards = chosen.map((uid) => findCard(view.me.field, uid)).filter(Boolean);
  const currentAttack = currentCards.reduce((sum, card) => sum + atk(card), 0);
  const currentKills = currentAttack >= hpLeft(attacker) && currentCards.length > 0;
  const incoming = imp(attacker);
  const target = combat.target === 'spirit' ? null : findCard(view.me.field, combat.target);
  const targetDies = target && atk(attacker) >= hpLeft(target);

  if (move.type === 'pass') {
    if (currentKills) return 145;
    let score = 18 - incoming * 13;
    if (combat.target === 'spirit' && incoming > view.me.life) score -= 1000;
    if (targetDies) score -= ownValue(target) * 2;
    return score;
  }
  if (move.type !== 'block') return -100;
  const blocker = findCard(view.me.field, move.uid);
  if (!blocker) return -100;
  const combined = currentAttack + atk(blocker);
  const kills = combined >= hpLeft(attacker);
  const firstKill = has(blocker, '先攻') && atk(blocker) >= hpLeft(attacker);
  const dies = atk(attacker) >= hpLeft(blocker) && !firstKill;
  let score = 25 + incoming * 19;
  if (kills) score += 48 + enemyValue(attacker) * 0.35;
  if (dies) score -= ownValue(blocker) * 1.25;
  if (dies && blocker.name === '灰烬小僧') score += 36;
  if (dies && blocker.name === '烈焰战将') score += 28;
  if (dies && blocker.name === '蹒跚的僵尸') score += 12;
  if (firstKill) score += 30;
  if (targetDies) score += ownValue(target) * 1.2;
  if (combat.target === 'spirit' && incoming > view.me.life) score += 1000;
  if (chosen.length) score -= 18;
  return score;
}

function orderScore(view, move) {
  const attacker = findCard(view.me.field, view.combat.attackerUid);
  let remaining = atk(attacker);
  let score = 0;
  for (const uid of move.order) {
    const blocker = findCard(view.opp.field, uid);
    if (!blocker) continue;
    const assigned = Math.min(remaining, hpLeft(blocker));
    remaining -= assigned;
    if (assigned >= hpLeft(blocker)) score += 30 + enemyValue(blocker) * 0.2;
    score += assigned / 1000;
  }
  return score;
}

export function choose(view, moves) {
  try {
    if (view.inspect) {
      const reveal = moves.find((move) => move.type === 'inspectReveal');
      const card = view.inspect.card;
      if (reveal && card && String(card.trigger || '').includes('CT')
        && (view.me.essence.length >= 3 || view.opp.life <= 3)) return reveal;
      return moves.find((move) => move.type === 'inspectTake') || moves[0];
    }
    const stage = view.combat?.stage;
    if (stage === 'attackers') return pickBest(moves, (move) => attackScore(view, move));
    if (stage === 'support') return moves.find((move) => move.type === 'supportSpirit')
      || moves.find((move) => move.type === 'pass');
    if (stage === 'blockers') {
      const chosen = view.combat.blockers || [];
      const fresh = moves.filter((move) => move.type !== 'block' || !chosen.includes(move.uid));
      return pickBest(fresh, (move) => blockScore(view, move))
        || moves.find((move) => move.type === 'pass') || moves[moves.length - 1];
    }
    if (stage === 'order') {
      const orders = moves.filter((move) => move.type === 'orderBlockers');
      return pickBest(orders, (move) => orderScore(view, move)) || orders[0] || moves[0];
    }
    const best = pickBest(moves, (move) => mainScore(view, move));
    if (best) return best;
  } catch (error) {
    // 任何异常都退回引擎给出的让过动作。
  }
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
