// 策略名称：赤渊燎原（红黑直伤拆生命）
// 选择理由：SE01 的胜利条件是「拆空对方生命卡组再补 1 点」。红黑两色集中了本环境
//           最廉价的直伤（火球术／焚尽／燃魂／混沌冲击）与最廉价的清障（自杀式袭击／
//           爆燃／混沌打击），配合敏捷／预制小单位每回合磨脸，是标准 10 点生命下
//           完成拆库计划最快的路线；红+黑恰好满足 duo 的双色构筑约束。
// 主责模式：standard

export const meta = {
  id: 'glm53',
  model: 'GLM5.3',
  modelId: 'glm-5.3',
  name: '赤渊燎原',
  desc: '敏捷预制小单位持续磨脸，火球术／焚尽／燃魂等直伤收尾拆空对方生命卡组。',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  火焰鸟: 4,
  地狱犬: 4,
  烈焰斗士: 4,
  熔岩投手: 3,
  烈焰战将: 2,
  火球术: 4,
  爆燃: 2,
  血怒: 2,
  烈焰之力: 2,
  焚尽: 2,
  自杀式袭击: 4,
  灵质榨取: 4,
  食魂者: 2,
  骸骨祭坛: 2,
  燃魂: 4,
  混沌冲击: 4,
  混沌打击: 2,
};

export const spirit = '余烬执火者';
export const color = '红';

// 直伤（对灵体）牌表
const FACE_DMG = { 混沌冲击: 1, 火球术: 2, 焚尽: 3, 燃魂: 2 };

const isUnit = (c) => !!c && c.type === '灵像';
const val = (c) => (c ? (c.atk || 0) + (c.hp || 0) + (c.imp || 0) * 3000 : 0);
const rem = (c) => (c ? Math.max(0, (c.hp || 0) - (c.damage || 0)) : 0);
const hasKw = (c, k) => !!c && (c.keywords || []).includes(k);
const passOf = (moves) =>
  moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

// 估算 u 宣告攻击后，对方可能拿出的阻挡者（与引擎 block 枚举口径一致）
function potentialBlockers(u, oppField) {
  const agile = hasKw(u, '敏捷');
  return oppField.filter((b) => {
    if (!isUnit(b)) return false;
    if (b.tapped && !hasKw(b, '守护')) return false;
    if (agile && !hasKw(b, '敏捷') && !(b.tapped && hasKw(b, '守护'))) return false;
    return true;
  });
}

export function choose(view, moves) {
  try {
    const picked = pick(view, moves);
    if (picked && moves.indexOf(picked) >= 0) return picked;
  } catch (e) {
    /* 打分异常则退回让过 */
  }
  return passOf(moves);
}

function pick(view, moves) {
  if (!moves || !moves.length) return null;
  if (view.over) return passOf(moves);
  if (view.inspect) return inspectPick(view, moves);
  const stage = view.combat && view.combat.stage;
  if (stage === 'attackers') {
    if (view.active !== view.me.idx) return passOf(moves);
    return attackPick(view, moves);
  }
  if (stage === 'support') return supportPick(view, moves);
  if (stage === 'blockers') return blockPick(view, moves);
  if (stage === 'order') return orderPick(view, moves);
  if (stage === 'damage') return passOf(moves);
  const myMain =
    view.active === view.me.idx &&
    (view.phase === 'main1' || view.phase === 'main2') &&
    !(view.chain && view.chain.length);
  if (!myMain) return responsePick(view, moves);
  return mainPick(view, moves);
}

// ── 灵体检视：带 CT 的揭示可白得 1 个暴击指示物，其余直接入手 ──
function inspectPick(view, moves) {
  const card = view.inspect && view.inspect.card;
  const reveal = moves.find((m) => m.type === 'inspectReveal');
  if (reveal && card && String(card.trigger || '').includes('CT')) return reveal;
  return moves.find((m) => m.type === 'inspectTake') || passOf(moves);
}

// ── 攻击宣告：只打「能穿」的攻击 ──
function attackPick(view, moves) {
  const me = view.me, opp = view.opp;
  const atkMoves = moves.filter((m) => m.type === 'attack');
  if (!atkMoves.length) return passOf(moves);
  let best = null, bestScore = 0.1;
  for (const m of atkMoves) {
    const u = me.field.find((c) => c.uid === m.uid);
    if (!u) continue;
    const uRem = rem(u);
    let s;
    if (m.target === 'spirit') {
      const potential = potentialBlockers(u, opp.field);
      if (!potential.length) {
        s = 20 + (u.imp || 0) * 8;
      } else if (hasKw(u, '超冲击')) {
        const totalHp = potential.reduce((t, b) => t + rem(b), 0);
        s = u.atk >= totalHp ? 15 + (u.imp || 0) * 8 : -40;
      } else {
        s = -40;
      }
    } else {
      const t = opp.field.find((c) => c.uid === m.target);
      if (!t) continue;
      const tRem = rem(t);
      const kills = (u.atk || 0) >= tRem;
      const uFirst = hasKw(u, '先攻');
      const tFirst = hasKw(t, '先攻');
      s = -20;
      if (kills) {
        if ((uFirst && !tFirst) || (t.atk || 0) < uRem) s = 14 + val(t) / 1000;
        else if (tFirst && !uFirst && (t.atk || 0) >= uRem) s = -25;
        else s = 6 + (val(t) - val(u)) / 1000;
      }
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

// ── 支援：打脸攻击一律用暴击指示物加 1 冲击；+1000 攻恰好补刀单位时也用 ──
function supportPick(view, moves) {
  const cb = view.combat;
  const sup = moves.find((m) => m.type === 'supportSpirit');
  if (!sup) return passOf(moves);
  if (!cb || cb.target === 'spirit') return sup;
  const u = view.me.field.find((c) => c.uid === cb.attackerUid);
  const t = view.opp.field.find((c) => c.uid === cb.target);
  if (u && t && (u.atk || 0) < rem(t) && (u.atk || 0) + 1000 >= rem(t)) return sup;
  return passOf(moves);
}

// ── 阻挡：一个能存活的阻挡者即可完全吸收非践踏攻击 ──
function blockPick(view, moves) {
  const me = view.me, opp = view.opp;
  const cb = view.combat;
  if (!cb) return passOf(moves);
  const find = (uid) =>
    opp.field.find((c) => c.uid === uid) || me.field.find((c) => c.uid === uid);
  const attacker = find(cb.attackerUid);
  if (!attacker || !isUnit(attacker)) return passOf(moves);
  const current = cb.blockers || [];
  const aAtk = attacker.atk || 0;
  const aRem = rem(attacker);
  const aImp = attacker.imp || 0;
  const blockMoves = moves.filter(
    (m) => m.type === 'block' && !current.includes(m.uid)
  );
  const cands = blockMoves
    .map((m) => ({ m, b: find(m.uid) }))
    .filter((x) => isUnit(x.b));

  // 攻击指向我方单位：我方单位能存活或能换掉攻击者就让它自己接
  if (cb.target !== 'spirit') {
    const t = find(cb.target);
    if (!t) return passOf(moves);
    if (aAtk < rem(t) || (t.atk || 0) >= aRem) return passOf(moves);
    const killer = cands.filter((x) => (x.b.atk || 0) >= aRem)
      .sort((x, y) => val(y.b) - val(x.b))[0];
    if (killer) return killer.m;
    const absorber = cands.filter((x) => aAtk < rem(x.b))
      .sort((x, y) => rem(y.b) - rem(x.b))[0];
    if (absorber && val(t) > val(absorber.b) + 2000) return absorber.m;
    return passOf(moves);
  }

  const currentAtk = current.reduce((s, uid) => {
    const b = find(uid);
    return s + (b ? b.atk || 0 : 0);
  }, 0);
  if (current.length) {
    const b0 = find(current[0]);
    if (b0 && aAtk < rem(b0)) return passOf(moves); // 已被完全吸收
    if (currentAtk >= aRem) return passOf(moves); // 阻挡者足以击杀
    const need = aRem - currentAtk;
    const reach = cands.filter((x) => (x.b.atk || 0) >= need)
      .sort((x, y) => val(y.b) - val(x.b))[0];
    if (reach) return reach.m;
    const big = cands.sort((x, y) => (y.b.atk || 0) - (x.b.atk || 0))[0];
    if (big && (aImp >= 2 || me.life <= 5)) return big.m;
    return passOf(moves);
  }

  if (!cands.length) return passOf(moves);
  // 1) 白吃攻击者：能击杀且自己存活
  for (const { m, b } of cands) {
    if ((b.atk || 0) >= aRem && aAtk < rem(b)) return m;
  }
  // 2) 换掉攻击者（阻挡者也会死）
  const killers = cands.filter((x) => (x.b.atk || 0) >= aRem);
  if (killers.length) {
    if (val(attacker) >= 6000 || aImp >= 2 || me.life <= 6 || killers.length >= 2) {
      killers.sort((x, y) => val(x.b) - val(y.b));
      return killers[0].m;
    }
    return passOf(moves);
  }
  // 3) 吸收：自己存活、挡下全部冲击
  const absorbers = cands.filter((x) => aAtk < rem(x.b))
    .sort((x, y) => rem(y.b) - rem(x.b));
  if (absorbers.length && (aImp >= 2 || me.life <= 6 || aAtk >= 3000)) {
    return absorbers.find((x) => hasKw(x.b, '自愈')) || absorbers[0];
  }
  // 4) 弃子：濒死或冲击 2 的攻击用最便宜的单位硬挡
  if ((aImp >= 2 && me.life <= 5) || me.life <= aImp) {
    const chump = cands.sort((x, y) => val(x.b) - val(y.b))[0];
    return chump.m;
  }
  return passOf(moves);
}

// ── 多阻挡者顺序（我是攻击方）：按各排列模拟致命分配，最大化击杀价值 ──
function orderPick(view, moves) {
  const cb = view.combat;
  const attacker = view.me.field.find((c) => c.uid === cb.attackerUid);
  if (!attacker) return passOf(moves);
  const atk = attacker.atk || 0;
  let best = null, bestScore = -1;
  for (const m of moves) {
    if (m.type !== 'orderBlockers') continue;
    let power = atk, score = 0;
    for (const uid of m.order) {
      const b = view.opp.field.find((c) => c.uid === uid);
      if (!b) continue;
      const lethal = rem(b);
      if (power >= lethal) { score += val(b) / 1000 + 2; power -= lethal; }
      else break;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || passOf(moves);
}

// ── 主阶段：单步贪心打分，引擎会在每次动作后再次调用 ──
function mainPick(view, moves) {
  const me = view.me, opp = view.opp;
  const myUnits = me.field.filter(isUnit);
  const oppUnits = opp.field.filter(isUnit);
  const hand = me.hand || [];
  const faceInHand = hand.reduce((s, c) => s + (FACE_DMG[c.name] || 0), 0);
  const finishing = opp.life <= faceInHand;
  const main1 = view.phase === 'main1';
  const needBlack =
    !me.essence.some((c) => c.color === '黑') && hand.some((c) => c.color === '黑');

  let best = null, bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'play' && m.type !== 'setEssence' && m.type !== 'ability' &&
        m.type !== 'spiritSpecial' && m.type !== 'spiritDraw') continue;
    let s = -1;
    if (m.type === 'setEssence') {
      const c = hand.find((x) => x.uid === m.uid);
      if (!c) continue;
      const want = Math.min(6, Math.floor(view.turn / 2) + 2);
      if (me.essence.length === 0) s = 60;
      else if (me.essence.length < want && hand.length >= 3) s = 40;
      if (s > 0) s += (needBlack && c.color === '黑' ? 6 : 0) + (c.cost.total || 0) * 0.5;
    } else if (m.type === 'spiritSpecial') {
      if (!main1) continue;
      const t = me.field.find((x) => x.uid === (m.targets || [])[0]);
      if (!isUnit(t) || t.tapped) continue;
      const aggr = (t.atk || 0) + (t.imp || 0) * 2500 +
        (hasKw(t, '敏捷') && oppUnits.some((b) => !b.tapped) ? 3000 : 0);
      s = 55 + aggr / 1000;
    } else if (m.type === 'spiritDraw') {
      if (me.deck <= 0) continue;
      s = (hand.length < 4 ? 26 : 10) + (main1 ? 0 : 8);
    } else if (m.type === 'ability') {
      const t = opp.field.find((x) => x.uid === (m.targets || [])[0]);
      if (isUnit(t) && rem(t) <= 1000) s = 62 + val(t) / 1000;
    } else {
      const c = hand.find((x) => x.uid === m.uid);
      if (!c) continue;
      s = playScore(view, m, c, { myUnits, finishing, main1, hand });
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

function playScore(view, m, c, ctx) {
  const me = view.me, opp = view.opp;
  const name = c.name;
  if (c.type !== '灵感') {
    let s = 60 + (c.cost.total || 0) + ((c.imp || 0) >= 2 ? 8 : 0);
    if (me.field.length >= 6) s -= 30;
    return s;
  }
  const face = FACE_DMG[name];
  if (face) {
    const early = view.turn <= 4 && ctx.myUnits.length < 3;
    return 30 + face * 4 - (early ? 45 : 0) + (ctx.finishing ? 55 : 0);
  }
  if (name === '爆燃') {
    const t = opp.field.find((x) => x.uid === (m.targets || [])[0]);
    if (!isUnit(t)) return -1;
    const tRem = rem(t);
    if (tRem <= 3000) return 68 + val(t) / 1000;
    if ((t.atk || 0) >= 3500 && tRem <= 4000) return 18;
    return -1;
  }
  if (name === '混沌打击') {
    const t = opp.field.find((x) => x.uid === (m.targets || [])[0]);
    if (!isUnit(t)) return -1;
    if (rem(t) <= 2000) return 55 + val(t) / 1000;
    if ((t.atk || 0) >= 3500 && rem(t) <= 3000) return 20;
    return -1;
  }
  if (name === '自杀式袭击') {
    const own = me.field.find((x) => x.uid === (m.targets || [])[0]);
    const tgt = opp.field.find((x) => x.uid === (m.targets || [])[1]);
    if (!isUnit(own) || !tgt) return -1;
    return 70 + (val(tgt) - val(own)) / 1000;
  }
  if (name === '燃魂') {
    const own = me.field.find((x) => x.uid === (m.targets || [])[0]);
    if (!isUnit(own)) return -1;
    if (ctx.myUnits.length <= 1 && !ctx.finishing) return -1;
    return 46 + (ctx.finishing ? 45 : 0) + (ctx.myUnits.length >= 3 ? 8 : 0) -
      val(own) / 2000;
  }
  if (name === '灵质榨取') {
    let s = 26 + (ctx.hand.length <= 3 ? 12 : 0);
    if (m.mode === 'bury' && ctx.hand.length >= 3) s += 8;
    return s;
  }
  if (name === '血怒' || name === '烈焰之力') {
    if (!ctx.main1) return -1;
    const t = me.field.find((x) => x.uid === (m.targets || [])[0]);
    if (!isUnit(t) || t.tapped || !hasKw(t, '预制')) return -1;
    const push = opp.life <= (t.imp || 0) + 1;
    if (name === '烈焰之力') return push ? 60 : 6; // 单位回合末会死，只做斩杀用
    return push ? 58 : view.turn >= 4 ? 30 : 12;
  }
  return 8;
}

// ── 响应窗口：response/combat_start 的富余灵能全部转成直伤；对方回合用爆燃点杀威胁 ──
function responsePick(view, moves) {
  const me = view.me, opp = view.opp;
  const stage = view.combat && view.combat.stage;
  const plays = moves.filter((m) => m.type === 'play');
  if (!plays.length) return passOf(moves);
  const hand = me.hand || [];
  if (stage === 'response' || stage === 'combat_start') {
    let best = null, bestScore = 0;
    for (const m of plays) {
      const c = hand.find((x) => x.uid === m.uid);
      if (!c) continue;
      const d = FACE_DMG[c.name];
      if (d) {
        const s = 30 + d * 4;
        if (s > bestScore) { bestScore = s; best = m; }
      }
    }
    return best || passOf(moves);
  }
  if (view.active !== me.idx || (view.chain && view.chain.length)) {
    let best = null, bestScore = 0;
    for (const m of plays) {
      const c = hand.find((x) => x.uid === m.uid);
      if (!c || c.name !== '爆燃') continue;
      const t = opp.field.find((x) => x.uid === (m.targets || [])[0]);
      if (isUnit(t) && rem(t) <= 3000 && (t.atk || 0) >= 3000) {
        const s = 55 + val(t) / 1000;
        if (s > bestScore) { bestScore = s; best = m; }
      }
    }
    return best || passOf(moves);
  }
  return passOf(moves);
}
