/**
 * 深根圣所（Deeproot Sanctuary）— step5preview
 * 选择理由：grand 长局（15 生命、50—60 张、5 张起手）最值钱的是「每回合稳定收益 + 牌库管理」。
 *   绿色灵质引擎（自然生长／丰收／幼苗守望者／部落祭司／灵体根脉育苗者）让费用上限每回合净涨 2 点以上，
 *   古树牧者、根脉网络、森林狼王随绿色灵质数量滚雪球；白色副色提供守护、解牌与生命管理，
 *   换取把比赛拖进我方巨像碾压的领域，最后用多张冲击 2 巨像＋全面成长收官。
 *   卡组 60 张、主色绿 70%，四模式通用；跨模式劣势如实写进设计说明。
 * 主责模式：grand
 */

export const meta = {
  id: 'step5preview',
  model: 'step5preview',
  modelId: 'step-5-preview',
  name: '深根圣所',
  desc: 'grand 长局里每回合稳定收益最值钱：绿意灵质滚雪球放大场面，白色守护与解牌换取时间，多张冲击 2 巨像在持久战中收官。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

// 卡组：绿 42（主色，70%）＋ 白 14（副色）＋ 灰 4（中性）。同名 ≤4，共 60 张。
export const deck = {
  // ── 绿：灵质引擎与 Scaling ──
  自然生长: 4,
  丰收: 3,
  幼苗守望者: 4,
  部落祭司: 4,
  森林守卫者: 2,
  藤蔓编织者: 1,
  根须缠绕: 3,
  生命灌注: 2,
  力量灌注: 2,
  全面成长: 3,
  根脉网络: 2,
  古树牧者: 4,
  森林狼王: 2,
  森林战将: 3,
  王牌巨象: 2,
  世界树苗: 1,
  // ── 白：守护、解牌、生命管理 ──
  圣光打击: 4,
  回复灵光: 2,
  晨祷侍从: 2,
  光能守护者: 2,
  圣所守卫: 2,
  圣光战将: 1,
  治愈灵光: 1,
  // ── 灰：中性补强 ──
  混沌打击: 2,
  荒原法则: 2,
};

export const spirit = '根脉育苗者';
export const color = '绿';

// ─────────────────────────────────────────────────────────────
// 基础工具
// ─────────────────────────────────────────────────────────────

const PREMIUM = new Set(['古树牧者', '森林战将', '王牌巨象', '圣光战将', '森林狼王', '世界树苗']);
const RAMP_CARDS = new Set(['自然生长', '丰收', '幼苗守望者', '部落祭司', '森林守卫者']);
const KW_BONUS = {
  预制: 500, 守护: 700, 敏捷: 500, 先攻: 650, 践踏: 700, 超冲击: 1100,
  威慑: 400, 自愈: 350, 灵气: 250, 终曲: 250, 序曲: 300, 质密: 120,
  碾压: 600, 启动: 120, 富集: 120, 回响: 200,
};

const pick = (moves, type) => moves.find((m) => m.type === type);
const KW = (c, k) => !!(c && c.keywords && c.keywords.includes(k));
const num = (x) => (typeof x === 'number' ? x : 0);
const value = (c) => num(c.atk) + num(c.imp) * 1200 + num(c.hp) * 0.4;

function findCard(view, uid) {
  const lists = [
    [view.me.field, true], [view.opp.field, false],
    [view.me.grave, true], [view.opp.grave, false],
    [view.me.essence, true], [view.me.armor, true],
  ];
  for (const [list, mine] of lists) {
    if (!list) continue;
    const c = list.find((x) => x.uid === uid);
    if (c) return { card: c, mine };
  }
  return { card: null, mine: false };
}

function countGreenEssence(view) {
  return (view.me.essence || []).filter((e) => e.color === '绿').length;
}

/** 与引擎 legalMoves 的阻挡资格判定保持一致。 */
function canBlockUnit(attacker, blocker) {
  if (!blocker || blocker.type !== '灵像') return false;
  if (blocker.tapped && !KW(blocker, '守护')) return false;
  if (KW(attacker, '敏捷') && !KW(blocker, '敏捷') && !(blocker.tapped && KW(blocker, '守护'))) return false;
  return true;
}

/** 对方「大概率会派来阻挡」的单位：挡住有价值、能击杀攻击者或能存活时才会挡。 */
function likelyBlockers(view, att) {
  const cands = (view.opp.field || []).filter((u) => canBlockUnit(att, u));
  const prevents = num(att.imp) * 1500;
  return cands.filter((u) => {
    const kills = num(u.atk) >= num(att.hp) - num(att.damage);
    const survives = num(u.hp) - num(u.damage) > num(att.atk);
    return value(u) <= prevents || kills || survives;
  });
}

/** 攻击方视角：优先分配致命伤害给「杀得掉的最有价值阻挡者」。 */
function greedyKillOrder(att, blockers) {
  const rest = [...blockers];
  const picked = [];
  let rem = num(att.atk);
  for (;;) {
    let bi = -1, bv = -1;
    for (let i = 0; i < rest.length; i++) {
      const b = rest[i];
      const remain = Math.max(0, num(b.hp) - num(b.damage));
      if (remain <= rem) {
        const v = value(b);
        if (v > bv) { bv = v; bi = i; }
      }
    }
    if (bi < 0) break;
    const b = rest.splice(bi, 1)[0];
    picked.push(b);
    rem -= Math.max(0, num(b.hp) - num(b.damage));
  }
  return picked.concat(rest);
}

/**
 * 战斗模拟（复刻 strikeBlocked 的关键因果）：
 * 先攻先结算、恰好致命分配、践踏溢出打到防守方其他单位、超冲击全致命时打脸。
 * attackerChooses=true 时按攻击方最优顺序（我在进攻），false 时按防守方最悲观顺序（我在防守）。
 */
function simCombat(att, blockers, defenderOthers, attackerChooses) {
  const res = { face: 0, attackerDies: false, defenderDeadValue: 0 };
  if (!blockers || !blockers.length) return res;
  const aAtk = num(att.atk), aImp = num(att.imp);
  const aHp0 = num(att.hp) - num(att.damage);
  const aFirst = KW(att, '先攻');
  const bFirst = blockers.some((b) => KW(b, '先攻'));
  const order = attackerChooses
    ? greedyKillOrder(att, blockers)
    : [...blockers].sort((x, y) => value(y) - value(x));
  const alloc = new Map();
  let rem = aAtk;
  for (const b of order) {
    const remain = Math.max(0, num(b.hp) - num(b.damage));
    let assigned = Math.min(remain, rem);
    if (KW(att, '碾压') && assigned < remain) assigned = 0; // 碾压：非致命伤害全部防止
    alloc.set(b.uid, assigned);
    rem -= assigned;
  }
  const alive0 = (b) => num(b.hp) - num(b.damage) > 0;
  const deadOf = (b) => num(b.hp) - num(b.damage) - num(alloc.get(b.uid)) <= 0;
  const bHitsAll = blockers.filter(alive0).reduce((n, b) => n + num(b.atk), 0);
  let aHp = aHp0;
  let allocApplies = true;
  if (aFirst && !bFirst) {
    const survivors = blockers.filter((b) => alive0(b) && !deadOf(b));
    aHp -= survivors.reduce((n, b) => n + num(b.atk), 0);
  } else if (bFirst && !aFirst) {
    aHp -= bHitsAll;
    if (aHp <= 0) allocApplies = false; // 先攻阻挡者打死攻击者，攻击者不再造成伤害
  } else {
    aHp -= bHitsAll;
  }
  res.attackerDies = aHp <= 0;
  const applyDeath = (b) => allocApplies && deadOf(b);
  if (allocApplies && KW(att, '超冲击') && blockers.length && blockers.every(applyDeath)) res.face += aImp;
  for (const b of blockers) if (applyDeath(b)) res.defenderDeadValue += value(b);
  if (allocApplies && rem > 0 && KW(att, '践踏') && defenderOthers && defenderOthers.length) {
    const t = [...defenderOthers].sort((x, y) => (num(x.hp) - num(x.damage)) - (num(y.hp) - num(y.damage)))[0];
    if (rem >= Math.max(0, num(t.hp) - num(t.damage))) res.defenderDeadValue += value(t);
  }
  return res;
}

// ─────────────────────────────────────────────────────────────
// 主决策入口
// ─────────────────────────────────────────────────────────────

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    const d = decide(view, moves);
    if (d && moves.includes(d)) return d;
    return pick(moves, 'pass') || moves[moves.length - 1];
  } catch (err) {
    return (moves && moves.length && (pick(moves, 'pass') || moves[moves.length - 1])) || { type: 'pass' };
  }
}

function decide(view, moves) {
  if (view.inspect) return decideInspect(view, moves);
  const cb = view.combat;
  if (cb) {
    if (cb.stage === 'attackers') return decideAttack(view, moves);
    if (cb.stage === 'support') return decideSupport(view, moves);
    if (cb.stage === 'blockers') return decideBlock(view, moves);
    if (cb.stage === 'order') return decideOrder(view, moves);
    return pick(moves, 'pass');
  }
  const myMain = view.active === view.me.idx
    && (view.phase === 'main1' || view.phase === 'main2')
    && (!view.chain || view.chain.length === 0);
  if (myMain) return decideMain(view, moves);
  if (view.priority === view.me.idx) return decideResponse(view, moves);
  return pick(moves, 'pass');
}

// ─────────────────────────────────────────────────────────────
// 灵体检视
// ─────────────────────────────────────────────────────────────

function decideInspect(view, moves) {
  const ins = view.inspect;
  const take = pick(moves, 'inspectTake');
  const reveal = pick(moves, 'inspectReveal');
  if (reveal && ins && ins.card) {
    const c = ins.card;
    const trig = c.trigger && c.trigger !== '—';
    const avail = num(view.me.mana[view.me.color])
      + (view.me.essence || []).filter((e) => e.color === view.me.color && !e.tapped).length;
    if (trig && num(c.cost && c.cost.total) >= 2 && avail >= 1) return reveal;
  }
  return take || reveal || pick(moves, 'pass') || moves[moves.length - 1];
}

// ─────────────────────────────────────────────────────────────
// 攻击阶段
// ─────────────────────────────────────────────────────────────

function decideAttack(view, moves) {
  const me = view.me, opp = view.opp;
  const canSup = num(me.spirit && me.spirit.crit) >= 1;
  let best = null, bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const att = (me.field || []).find((c) => c.uid === m.uid);
    if (!att) continue;
    let s;
    if (m.target === 'spirit') {
      s = scoreAttackFace(view, att, canSup);
    } else {
      const tgt = (opp.field || []).find((c) => c.uid === m.target);
      if (!tgt) continue;
      s = scoreAttackUnit(view, att, tgt, canSup);
    }
    if (s > bestScore + 1e-9) { bestScore = s; best = m; }
  }
  return best || pick(moves, 'pass');
}

function scoreAttackFace(view, att, canSup) {
  const opp = view.opp;
  const atk = num(att.atk) + (canSup ? 1000 : 0);
  const imp = num(att.imp) + (canSup ? 1 : 0);
  const boosted = { ...att, atk, imp };
  const blockers = likelyBlockers(view, boosted);
  let s;
  if (!blockers.length) {
    s = imp * 1500 + 800;
  } else {
    const others = (opp.field || []).filter((u) => !blockers.includes(u));
    const sim = simCombat(boosted, blockers, others, true);
    s = sim.face * 1500 + sim.defenderDeadValue - (sim.attackerDies ? value(att) : 0);
    if (sim.face === 0 && !sim.attackerDies && sim.defenderDeadValue < 1000) s -= 400; // 别用攻击换个杂鱼
  }
  if (opp.life <= imp) s += 100000; // 致死
  else if (opp.life <= imp + 2) s += 2000;
  s -= 150; // 攻击后横置，少一个阻挡者
  return s;
}

function scoreAttackUnit(view, att, tgt, canSup) {
  const atk = num(att.atk) + (canSup ? 1000 : 0);
  const aFirst = KW(att, '先攻'), tFirst = KW(tgt, '先攻');
  const iKill = atk >= num(tgt.hp) - num(tgt.damage);
  const iDie = num(tgt.atk) >= num(att.hp) - num(att.damage);
  let s = 0;
  if (iKill) s += value(tgt) * 1.15; else s -= 700;
  if (iKill && aFirst && !tFirst) s += 700;
  if (iKill && !iDie) s += 1000;
  if (iDie && !(aFirst && !tFirst)) s -= value(att) * 0.9;
  if (!iKill && iDie) s -= 600;
  if (num(tgt.imp) >= 2) s += 900; // 拆掉对方的冲击时钟
  if (tgt.type === '灵性') s += 1600; // 拆掉持续收益
  s -= 150;
  return s;
}

function decideSupport(view, moves) {
  const me = view.me, opp = view.opp;
  const cb = view.combat;
  const sup = pick(moves, 'supportSpirit');
  if (!sup || num(me.spirit && me.spirit.crit) < 1) return pick(moves, 'pass');
  const att = (me.field || []).find((c) => c.uid === cb.attackerUid);
  if (!att) return pick(moves, 'pass');
  const atk = num(att.atk), imp = num(att.imp);
  if (cb.target === 'spirit') {
    if (opp.life <= imp + 1) return sup; // 支援后致死
    const blockers = likelyBlockers(view, { ...att, imp: imp + 1 });
    if (!blockers.length) return sup; // 白送 +1 冲击
    if (num(me.spirit.crit) >= 2) return sup;
    if (blockers.some((b) => atk + 1000 >= num(b.hp) - num(b.damage) && atk < num(b.hp) - num(b.damage))) return sup;
    return pick(moves, 'pass');
  }
  const tgt = (opp.field || []).find((c) => c.uid === cb.target);
  if (tgt && atk + 1000 >= num(tgt.hp) - num(tgt.damage) && atk < num(tgt.hp) - num(tgt.damage)) return sup;
  return pick(moves, 'pass');
}

// ─────────────────────────────────────────────────────────────
// 阻挡阶段（block 是 toggle：必须过滤掉已宣告的单位）
// ─────────────────────────────────────────────────────────────

function decideBlock(view, moves) {
  const me = view.me, opp = view.opp;
  const cb = view.combat;
  const declared = cb.blockers || [];
  const att = (opp.field || []).find((c) => c.uid === cb.attackerUid);
  if (!att) return pick(moves, 'pass');
  const myField = me.field || [];
  const myById = {};
  for (const c of myField) myById[c.uid] = c;
  const cur = declared.map((u) => myById[u]).filter(Boolean);
  const fresh = moves.filter((m) => m.type !== 'block' || !declared.includes(m.uid));
  const targetIsSpirit = cb.target === 'spirit';
  const myTargeted = targetIsSpirit ? null : myById[cb.target];
  const others = myField.filter((c) => !declared.includes(c.uid));
  const base = outcomeNoBlock(view, att, myTargeted);
  let best = null, bestScore = base + 60; // 必须明显优于不再阻挡
  for (const m of fresh) {
    if (m.type !== 'block') continue;
    const b = myById[m.uid];
    if (!b) continue;
    const rest = others.filter((c) => c.uid !== m.uid);
    const sim = simCombat(att, [...cur, b], rest, false);
    let s = -sim.face * 1500 - sim.defenderDeadValue;
    if (me.life <= sim.face) s -= 100000;
    if (sim.attackerDies) s += value(att);
    if (s > bestScore + 1e-9) { bestScore = s; best = m; }
  }
  return best || pick(moves, 'pass');
}

function outcomeNoBlock(view, att, myTargeted) {
  const me = view.me;
  if (!myTargeted) {
    const imp = num(att.imp);
    if (me.life <= imp) return -100000; // 不挡就死
    return -imp * 1500;
  }
  const aFirst = KW(att, '先攻'), tFirst = KW(myTargeted, '先攻');
  const aAtk = num(att.atk), tAtk = num(myTargeted.atk);
  const aRem = num(att.hp) - num(att.damage), tRem = num(myTargeted.hp) - num(myTargeted.damage);
  const iKill = tAtk >= aRem;   // 我的单位能打死攻击者
  const iDie = aAtk >= tRem;    // 攻击者能打死我的单位
  let s = 0;
  if (aFirst && !tFirst) {
    if (iDie) s -= value(myTargeted);
    else if (iKill) s += value(att); else s -= 150;
  } else if (tFirst && !aFirst) {
    if (iKill) s += value(att);
    else s -= value(myTargeted);
  } else {
    if (iKill) s += value(att);
    if (iDie) s -= value(myTargeted);
    if (!iKill && !iDie) s -= 150;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// 阻挡顺序（我是攻击方）：优先多杀、杀有价值的
// ─────────────────────────────────────────────────────────────

function decideOrder(view, moves) {
  const cb = view.combat;
  const me = view.me, opp = view.opp;
  const orderMoves = moves.filter((m) => m.type === 'orderBlockers');
  if (!orderMoves.length) return pick(moves, 'pass') || moves[moves.length - 1];
  const myById = {}, oppById = {};
  for (const c of me.field || []) myById[c.uid] = c;
  for (const c of opp.field || []) oppById[c.uid] = c;
  const att = myById[cb.attackerUid] || oppById[cb.attackerUid];
  const blockers = (cb.blockers || []).map((u) => oppById[u] || myById[u]).filter(Boolean);
  if (!att || !blockers.length) return orderMoves[0];
  const desired = greedyKillOrder(att, blockers).map((b) => b.uid);
  const found = orderMoves.find((m) => m.order && m.order.length === desired.length
    && m.order.every((u, i) => u === desired[i]));
  return found || orderMoves[0];
}

// ─────────────────────────────────────────────────────────────
// 我的主要阶段
// ─────────────────────────────────────────────────────────────

function decideMain(view, moves) {
  const me = view.me;
  const handById = {};
  for (const c of me.hand || []) handById[c.uid] = c;
  let best = null, bestScore = 0; // 让过 = 0 分基准
  for (const m of moves) {
    let s = -1e9;
    if (m.type === 'play') s = scorePlay(view, handById[m.uid], m);
    else if (m.type === 'setEssence') s = scoreEssence(view, handById[m.uid]);
    else if (m.type === 'ability') s = scoreAbility(view, m);
    else if (m.type === 'spiritSpecial') s = scoreSpiritSpecial(view);
    else if (m.type === 'spiritDraw') s = 700 + (num(me.handCount) <= 3 ? 400 : 0);
    else if (m.type === 'pass') s = 0;
    if (s > bestScore + 1e-9) { bestScore = s; best = m; }
  }
  return best || pick(moves, 'pass');
}

function scorePlay(view, card, m) {
  if (!card) return -1e9;
  if (card.type === '灵像') return scoreUnitPlay(view, card);
  if (card.type === '灵性') return scoreCharmPlay(view, card);
  const t = m.targets || [];
  switch (card.name) {
    case '圣光打击': return scoreDirectDamage(view, t, 5000, 2, false);
    case '混沌打击': return scoreDirectDamage(view, t, 2000, 1, false);
    case '爆燃': return scoreDirectDamage(view, t, 1000, 1, true);
    case '荒原法则': return scoreDestroy(view, t, 4000, 400);
    case '净化仪式': return scoreDestroy(view, t, 2600, 0);
    case '回复灵光': return scoreHeal(view, t, 3000);
    case '圣疗': return scoreHeal(view, t, 5000);
    case '治愈灵光': return scoreDeckToLife(view);
    case '生命灌注': return scorePump(view, t, 0, 0, 1500);
    case '力量灌注': return scorePump(view, t, 1500, 0, 0);
    case '全面成长': return scorePump(view, t, 1000, 1, 1000);
    case '自然生长': return scoreRampEssence(view, 1);
    case '丰收': return scoreRampEssence(view, 2);
    case '根须缠绕': return scoreTapLock(view, t);
    default: return 200;
  }
}

function scoreDirectDamage(view, targets, dmg, cost, hurtBonus) {
  let s = 0;
  for (const uid of targets) {
    const f = findCard(view, uid);
    if (!f.card) continue;
    if (f.mine) { s -= value(f.card) * 0.6; continue; }
    const remain = num(f.card.hp) - num(f.card.damage);
    const d = hurtBonus && num(f.card.damage) > 0 ? 3000 : dmg;
    if (remain <= d) s += value(f.card) * 1.15; // 打得死才开
  }
  if (s <= 0) return -50;
  return s + (4 - cost) * 120;
}

function scoreDestroy(view, targets, minValue, oppDrawPenalty) {
  let s = 0;
  for (const uid of targets) {
    const f = findCard(view, uid);
    if (!f.card) continue;
    if (f.mine) { s -= value(f.card); continue; }
    s += value(f.card) * 1.2;
  }
  s -= oppDrawPenalty;
  if (s < minValue) return -50;
  return s;
}

function scoreHeal(view, targets, amount) {
  let s = 0;
  for (const uid of targets) {
    const f = findCard(view, uid);
    if (!f.card) continue;
    if (!f.mine) { s -= value(f.card) * 0.5; continue; }
    const dmg = num(f.card.damage);
    if (dmg <= 0) continue;
    s += Math.min(dmg, amount) * 1.1;
  }
  return s > 0 ? s + 200 : -50;
}

function scoreDeckToLife(view) {
  const me = view.me;
  const deficit = num(view.modeSpec && view.modeSpec.life) - num(me.life);
  let s = deficit * 550;
  if (num(me.deck) <= 10) s += 700; // 顺便防牌库枯竭
  if (deficit <= 0 && num(me.deck) > 14) s = -50;
  return s;
}

function scorePump(view, targets, atk, imp, hp) {
  const f = findCard(view, targets[0]);
  if (!f.card || !f.mine) return -50;
  const c = f.card;
  let s = 500 + num(c.atk) * 0.25 + num(c.imp) * 300;
  if (imp) s += 900; // 冲击直接换算成生命伤害
  if (num(c.hp) - num(c.damage) <= 1500) s += 400; // 保住它
  return s;
}

function scoreTapLock(view, targets) {
  const f = findCard(view, targets[0]);
  if (!f.card || f.mine) return -50;
  const c = f.card;
  if (num(c.atk) <= 1000) return -50; // 不浪费在杂鱼上
  let s = value(c) * 1.1;
  if (c.tapped) s *= 0.5;
  return s;
}

function scoreRampEssence(view, n) {
  const me = view.me;
  const turn = num(view.turn);
  let s = 1500 + n * 900;
  if (turn <= 3) s += 900;
  else if (turn <= 6) s += 400;
  else s -= 300;
  if (num(me.essence.length) < 5) s += 400;
  if (n === 2) s += Math.min(2, (me.essence || []).filter((e) => e.tapped).length) * 250;
  if (num(me.deck) <= 12) s -= 400; // grand 牌库管理
  return s;
}

function scoreUnitPlay(view, card) {
  const me = view.me, opp = view.opp;
  const name = card.name;
  let atk = num(card.atk), imp = num(card.imp), hp = num(card.hp);
  const g = countGreenEssence(view);
  if (name === '古树牧者') { atk += g * 250; hp += g * 250; }
  if (name === '森林狼王') { const n = Math.floor(g / 3); atk += n * 500; hp += n * 500; }
  let s = atk + imp * 1300 + hp * 0.45;
  for (const k of card.keywords || []) s += KW_BONUS[k] || 0;
  if (name === '圣光战将') {
    const threats = (opp.field || []).filter((u) => num(u.atk) + num(u.imp) * 2 >= 2000).length;
    s += Math.min(2, threats) * 1900;
  }
  if (name === '晨祷侍从') s += (me.field || []).some((u) => num(u.damage) > 0) ? 700 : 150;
  if (name === '幼苗守望者' || name === '部落祭司') s += 950; // 序曲即费用
  if (name === '森林守卫者') s += 500;
  const turn = num(view.turn);
  s += Math.max(0, 6 - num(card.cost.total)) * (turn <= 4 ? 160 : 50);
  if (num((me.field || []).length) >= 6) s -= 350;
  if (num((me.field || []).length) >= 8) s -= 350;
  return s;
}

function scoreCharmPlay(view, card) {
  const me = view.me;
  if (card.name === '根脉网络') {
    const g = countGreenEssence(view);
    const units = num((me.field || []).length);
    let s = 1100 + Math.floor(g / 3) * 260 + units * 180;
    if (num(view.turn) <= 3) s -= 500;
    return s;
  }
  if (card.name === '世界树苗') {
    return 1300 + (num(me.handCount) <= 3 ? 900 : 0) + (num(view.turn) >= 7 ? 300 : -300);
  }
  return 400;
}

function scoreEssence(view, card) {
  if (!card) return -1e9;
  const me = view.me;
  let s = 1300 + num(card.cost.total) * 130;
  if (PREMIUM.has(card.name)) s -= 2500; // 终板不设灵质
  if (RAMP_CARDS.has(card.name)) s -= 800; // ramp 要着打
  if (card.color === '绿') s += 250;
  if (card.color === '白') {
    const nWhite = (me.essence || []).filter((e) => e.color === '白').length;
    const handWhite = (me.hand || []).filter((c) => c.color === '白').length;
    if (handWhite >= 2 && nWhite <= 1) s += 400;
  }
  if (card.type === '灵感' && num(card.cost.total) <= 2) s += 150;
  if (num(me.hand.length) <= 2) s *= 0.5; // 手牌枯竭时克制
  return s;
}

function scoreAbility(view, m) {
  const me = view.me;
  const field = me.field || [];
  const name = m.name;
  if (name === '森林守卫者') {
    return enablesPlay(view, '绿') ? 1900 : 250;
  }
  if (name === '藤蔓编织者') {
    const f = findCard(view, (m.targets || [])[0]);
    if (!f.card || !f.mine) return -100;
    let s = 650 + num(f.card.hp) * 0.12;
    if (num(f.card.hp) - num(f.card.damage) <= 2000) s += 500;
    return s;
  }
  if (name === '世界树苗') {
    const h = num(me.handCount);
    return h >= 3 ? 1600 : h === 2 ? 800 : -100;
  }
  return 300;
}

/** 这张灵质横置是否正好补上某张手牌的色费用缺口。 */
function enablesPlay(view, color) {
  const me = view.me;
  const availColor = num(me.mana[color]) + (me.essence || []).filter((e) => e.color === color && !e.tapped).length;
  let availAny = 0;
  for (const k of Object.keys(me.mana || {})) availAny += num(me.mana[k]);
  availAny += (me.essence || []).filter((e) => !e.tapped).length;
  for (const c of me.hand || []) {
    const colored = num(c.cost && c.cost.colored);
    const grey = num(c.cost && c.cost.grey);
    const needColor = c.color === color ? colored : 0;
    if (needColor > availColor && needColor <= availColor + 1 && colored + grey <= availAny + 1) return true;
  }
  return false;
}

function scoreSpiritSpecial(view) {
  const me = view.me;
  if (!me.spirit || me.spirit.tapped) return -1e9;
  const hand = num(me.handCount);
  if (hand >= 4) return 2500;
  if (hand === 3) return 2100;
  if (hand === 2) {
    const minCost = Math.min(...((me.hand || []).map((c) => num(c.cost && c.cost.total)).concat([99])));
    return minCost >= 5 ? 100 : 1000;
  }
  return 200;
}

// ─────────────────────────────────────────────────────────────
// 响应对方（连锁中／对方回合）：只出灵感卡
// ─────────────────────────────────────────────────────────────

function decideResponse(view, moves) {
  const me = view.me;
  const handById = {};
  for (const c of me.hand || []) handById[c.uid] = c;
  let best = null, bestScore = 1400; // 阈值：不值得就不跟
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const card = handById[m.uid];
    if (!card) continue;
    let s = scorePlay(view, card, m);
    if (card.type === '灵感') {
      if (card.name === '根须缠绕') s *= 1.25; // 对方回合锁住，直接废掉这次攻击
      else if (card.name === '生命灌注' || card.name === '力量灌注' || card.name === '全面成长') s *= 0.85;
      else if (card.name === '治愈灵光') s *= 0.9;
      else if (card.name === '自然生长' || card.name === '丰收') s *= 0.95;
    }
    if (s > bestScore + 1e-9) { bestScore = s; best = m; }
  }
  return best || pick(moves, 'pass');
}
