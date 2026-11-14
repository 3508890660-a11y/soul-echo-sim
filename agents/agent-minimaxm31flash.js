/**
 * 《灵魂回响》SE01 · minimaxm31flash
 * 策略名称：余烬叠刃
 *
 * 选择理由（基于对引擎规则的实测）：
 *   1) 灵质区张数 = 每回合的灵能预算上限。每回合只能把 1 张手牌设为灵质，
 *      灵质永久累积、每回合重置横置 —— 灵质就是「永久费用引擎」，越早铺越赚。
 *      所以主要阶段的第一优先级永远是「设灵质」，而不是空过。
 *   2) 灰费可以由任何颜色的灵能支付，有色费必须由对应颜色的灵质支付。
 *      因此灵质应优先选红卡（红灵质既能付红费也能付灰费）。
 *   3) blitz 只有 6 张生命卡，需要 7 点生命伤害才能获胜；直伤（灵体伤害）
 *      比「打脸被阻挡」更可靠，但真正把伤害翻倍的是冲击（impact）。
 *   4) 余烬执火者（红灵体）横置 → 己方 1 张灵像 +1000 攻击、+1 冲击直到回合结束。
 *      这是零费用的「每回合 +1 冲击」，与血怒（红2，+1 冲击）叠加后，
 *      地狱犬（2000/1/2500，预制、自愈）就能每回合打出 3 点生命伤害。
 *
 * 主责模式：blitz
 *
 * 零依赖 ES Module：导出 meta / deck / spirit / color / choose。
 * choose 只在 moves 里原样挑选并返回，绝不新建或改写动作对象。
 */

/* ── 卡牌手册 ─────────────────────────────────────────────────────────────── */
/** 灵体伤害（对灵体直接造成生命伤害）。 */
const BURN = { 火球术: 2, 焚尽: 3, 混沌冲击: 1, 燃魂: 2 };
/** 冲击放大器：命中即 +1 冲击（血怒不会杀死目标，烈焰之力会）。 */
const BUFF = { 血怒: 1, 烈焰之力: 1 };
/** 需要「己方灵像」作为目标的能力。 */
const OWN_TARGET = { 血怒: 1, 烈焰之力: 1 };
/** 抽牌类。 */
const DRAW = { 冒险准备: 1, 灵质榨取: 1, 灵质重聚: 1 };
/** 战斗用的主要单位。 */
const FIGHTER = { 地狱犬: 1, 烈焰斗士: 1, 灰烬小僧: 1, 火焰鸟: 1, 新人冒险者: 1, 熔岩投手: 1 };
/** 灵体（余烬执火者）：横置 → 己方 1 张灵像 +1000 攻击、+1 冲击直到回合结束。 */
const SPIRIT_BUFF = '余烬执火者';

/* ── 基础工具 ────────────────────────────────────────────────────────────── */
const passOf = (moves) => moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

function ownField(view) { return view.me.field || []; }
function oppField(view) { return view.opp.field || []; }

function unitByUid(view, uid) {
  if (!uid) return null;
  const all = ownField(view).concat(oppField(view));
  for (const c of all) if (c.uid === uid) return c;
  return null;
}
function handCard(view, uid) {
  const hand = view.me.hand || [];
  for (const c of hand) if (c.uid === uid) return c;
  return null;
}
function remainingHp(c) { return Math.max(0, (c.hp || 0) - (c.damage || 0)); }
function hasKw(c, kw) { return !!c && Array.isArray(c.keywords) && c.keywords.includes(kw); }
function isSpiritTarget(t) { return t === 'spirit'; }

/** 我方单位本回合能否攻击（未横置；本回合入场且非「预制」的不能攻击）。 */
function canSwing(c, view) {
  if (!c || c.tapped) return false;
  if (hasKw(c, '预制')) return true;
  // 引擎只在本回合入场时禁止攻击；view 不含 enteredTurn，用「本回合刚出场」的近似：
  // 预制之外的新单位在引擎里 enteredTurn === g.turn 时不可攻击。
  return true;
}

/** 对手能否阻挡这具攻击者（尊重「敏捷」与「守护」）。 */
function canBlockAttacking(blocker, attacker) {
  if (!blocker || blocker.type !== '灵像') return false;
  if (blocker.tapped && !hasKw(blocker, '守护')) return false;
  if (attacker && hasKw(attacker, '敏捷') && !hasKw(blocker, '敏捷') && !hasKw(blocker, '守护')) return false;
  return true;
}

/* ── 伤害与斩杀 ──────────────────────────────────────────────────────────── */
/** 打出这张灵感能立刻造成的生命伤害。 */
function burnDamage(view, move) {
  const c = handCard(view, move.uid);
  if (!c) return 0;
  const name = c.name;
  if (name === '火球术') return BURN.火球术;
  if (name === '焚尽') return ownField(view).length === 0 ? 4 : BURN.焚尽;
  if (name === '混沌冲击') return BURN.混沌冲击;
  if (name === '燃魂') {
    const t = move.targets && move.targets[0] ? unitByUid(view, move.targets[0]) : null;
    return BURN.燃魂 + (t && t.name === '灰烬小僧' ? 1 : 0);
  }
  return 0;
}

/** 打死对手还差多少点生命伤害（生命卡组翻空后仍需再结算 1 点才判负）。 */
function damageNeeded(view) { return Math.max(1, (view.opp.life || 0) + 1); }

/* ── 卡牌估值（用于「设灵质 vs 打出」的取舍） ─────────────────────────────── */
/**
 * 这张牌打出去的价值（blitz 视角：即时伤害 > 冲击放大 > 铺场 > 抽牌 > 解场）。
 * 高价值牌不宜被拿去当灵质。
 */
function playValue(view, c) {
  if (!c) return 0;
  const name = c.name;
  switch (name) {
    case '火球术': return 14;
    case '焚尽': return 16;
    case '混沌冲击': return 6;
    case '燃魂': return 9;
    case '地狱犬': return 13;   // 2000 攻 + 2500 血 + 预制 + 自愈
    case '烈焰斗士': return 12; // 3500 攻 + 敏捷先攻
    case '灰烬小僧': return 10; // 终曲补 1 点
    case '血怒': return 11;     // +1 冲击，可叠加
    case '烈焰之力': return 8;   // +1 冲击但目标回合末死亡
    case '火焰鸟': return 7;
    case '冒险准备': return 9;
    case '灵质榨取': return 12;  // 葬送模式净 +1 手牌
    case '混沌打击': return 8;
    case '爆燃': return 7;
    case '烈焰战将': return 11;
    case '熔岩投手': return 8;
    case '熔炉之核': return 6;
    case '火种祭坛': return 7;
    case '烈焰聚合体': return 3;
    case '黑暗聚合体': return 4;
    case '新人冒险者': return 4;
    case '自杀式袭击': return 6;
    case '余烬回燃': return 8;
    case '焚城巨兵': return 8;
    case '血焰狂徒': return 8;
    case '炽焰学者': return 9;
    case '预案引燃': return 8;
    case '火种祭坛': return 7;
    default: return 5;
  }
}

/** 这张牌当灵质（永久费用引擎）的价值：颜色越通用、费用越高越适合。 */
function essenceValue(view, c) {
  if (!c) return 0;
  let v = 0;
  if (c.color === '红') v += 4.5;        // 红灵质可付红费也可付灰费
  else if (c.color === '黑') v += 2.5;   // 黑灵质只能付黑费
  else v += 0.5;                          // 灰灵质几乎无用
  const t = c.cost.total;
  if (t >= 5) v += 6.5; else if (t >= 4) v += 5; else if (t >= 3) v += 3.5; else if (t >= 2) v += 1.5;
  return v;
}

/* ── 灵体检视 ────────────────────────────────────────────────────────────── */
function chooseInspect(view, moves) {
  const take = moves.find((m) => m.type === 'inspectTake');
  const reveal = moves.find((m) => m.type === 'inspectReveal');
  const card = view.inspect && view.inspect.card;
  // 不支付直接入手是零成本的；只有卡面自带 ST 触发且付得起同色灵能时才值得揭示。
  if (reveal && card && card.trigger && card.trigger !== '—' && (view.me.mana[view.me.color] || 0) >= 1) return reveal;
  return take || reveal || passOf(moves);
}

/* ── 战斗：宣告攻击者 ────────────────────────────────────────────────────── */
function chooseAttackers(view, moves) {
  const attacks = moves.filter((m) => m.type === 'attack');
  if (!attacks.length) return passOf(moves);
  const need = damageNeeded(view);
  const myBest = bestAttacker(view);
  let best = null;
  let bestScore = 0;
  for (const m of attacks) {
    const a = unitByUid(view, m.uid);
    if (!a) continue;
    let s = -100;
    if (isSpiritTarget(m.target)) {
      const imp = a.imp || 0;
      if (imp <= 0) continue;                       // 冲击 0 打脸毫无意义
      s = imp * 6;
      if (imp >= need) s += 500;                    // 直接斩杀
      const blockers = oppField(view).filter((b) => canBlockAttacking(b, a));
      if (!blockers.length) s += 8;                 // 无阻挡，伤害必到
      else s -= 3;
      if (hasKw(a, '超冲击')) s += 5;               // 击穿阻挡者后冲击仍生效
      if (hasKw(a, '先攻')) s += 2;
      if (hasKw(a, '敏捷')) s += 1;
      if (myBest && myBest.uid === a.uid) s += 2;    // 集中火力打脸
    } else {
      const t = unitByUid(view, m.target);
      if (!t) continue;
      const kill = (a.atk || 0) >= remainingHp(t);
      const die = (t.atk || 0) >= remainingHp(a);
      s = kill ? 6 : -1;
      if (hasKw(t, '守护')) s += 2.5;
      if ((t.atk || 0) >= 3000) s += 3;             // 拆掉大威胁
      if (die) s -= 4;
      if (hasKw(a, '先攻')) s += 1;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best && bestScore > 0 ? best : passOf(moves);
}

/** 我方冲击最高的可攻击单位（buff 的目标）。 */
function bestAttacker(view) {
  let best = null;
  for (const c of ownField(view)) {
    if (!canSwing(c, view)) continue;
    if (!best || (c.imp || 0) > (best.imp || 0)) best = c;
  }
  return best;
}

/* ── 战斗：支援 ──────────────────────────────────────────────────────────── */
function chooseSupport(view, moves) {
  const s = moves.find((m) => m.type === 'supportSpirit');
  if (s) return s;                                     // 暴击指示物换 +1000 攻击 / +1 冲击
  return passOf(moves);
}

/* ── 战斗：阻挡（toggle 式动作，必须排除已宣告的阻挡者） ─────────────────── */
function chooseBlockers(view, moves) {
  const cb = view.combat || {};
  const declared = Array.isArray(cb.blockers) ? cb.blockers : [];
  const fresh = moves.filter((m) => m.type === 'block' && !declared.includes(m.uid));
  if (!fresh.length) return passOf(moves);
  const attacker = unitByUid(view, cb.attackerUid);
  const toSpirit = isSpiritTarget(cb.target);
  const targetUnit = toSpirit ? null : unitByUid(view, cb.target);
  let best = null;
  let bestScore = 0;
  for (const m of fresh) {
    const b = unitByUid(view, m.uid);
    if (!b) continue;
    let s = 0;
    const kills = attacker ? (b.atk || 0) >= remainingHp(attacker) : false;
    const dies = attacker ? (attacker.atk || 0) >= remainingHp(b) : false;
    if (toSpirit) {
      s += 5 + (attacker ? (attacker.imp || 0) * 3 : 0);   // 挡下打脸最值钱
    } else {
      s += 4;                                              // 保住被打的单位
      if (targetUnit && FIGHTER[targetUnit.name]) s += 2;
    }
    if (kills) s += 4;
    if (dies) s -= 3.5;
    if (hasKw(b, '守护')) s += 2;                          // 不横置也能挡
    if (declared.length) s -= 2;                           // 已挡过一次，收益递减
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best && bestScore > 0 ? best : passOf(moves);
}

/* ── 战斗：确定阻挡顺序（血少的排前面，替大单位挡下致命伤害） ────────────── */
function chooseOrder(view, moves) {
  const orders = moves.filter((m) => m.type === 'orderBlockers');
  if (!orders.length) return passOf(moves);
  const cb = view.combat || {};
  const ids = Array.isArray(cb.blockers) ? cb.blockers : [];
  const hp = (uid) => { const c = unitByUid(view, uid); return c ? remainingHp(c) : 0; };
  const want = ids.slice().sort((a, b) => hp(a) - hp(b));
  for (const m of orders) {
    if (!m.order || m.order.length !== want.length) continue;
    let same = true;
    for (let i = 0; i < want.length; i++) if (m.order[i] !== want[i]) { same = false; break; }
    if (same) return m;
  }
  return orders[0];
}

/* ── 主动阶段评分 ────────────────────────────────────────────────────────── */
/** 这张灵感打出后立刻能造成的生命伤害（用于斩杀判断）。 */
function immediateDamage(view, m) {
  const c = handCard(view, m.uid);
  if (!c) return 0;
  if (BURN[c.name]) return burnDamage(view, m);
  if (c.name === '火种祭坛') {
    const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
    return t ? 1 + (t.name === '灰烬小僧' ? 1 : 0) : 0;
  }
  return 0;
}

/** 某个目标组合下的价值（血怒 / 烈焰之力 / 自杀式袭击 / 爆燃 / 混沌打击）。 */
function scoreTargets(view, m, ctx) {
  const c = handCard(view, m.uid);
  if (!c) return -1;
  const name = c.name;
  const targets = m.targets || [];

  if (name === '血怒' || name === '烈焰之力') {
    const t = targets[0] ? unitByUid(view, targets[0]) : null;
    if (!t) return -1;
    let s = 1;
    if (canSwing(t, view)) s += 11;                 // 目标能攻击 → +1 冲击 = +1 生命伤害
    if (t.imp > 0) s += 2;
    if (name === '烈焰之力') {
      s -= 2;                                       // 目标回合末被破坏
      if (t.name === '灰烬小僧') s += 3;             // 终曲再补 1 点
      if (!canSwing(t, view)) s += 2;                // 反正要死，就当爆发用
    }
    return s;
  }

  if (name === '自杀式袭击') {
    const theirUnit = targets[1] ? unitByUid(view, targets[1]) : null;
    const myUnit = targets[0] ? unitByUid(view, targets[0]) : null;
    if (!theirUnit) return -1;
    let v = (theirUnit.atk || 0) >= 2500 ? 9 : 4;
    if (hasKw(theirUnit, '守护')) v += 3;
    if (myUnit && myUnit.name === '灰烬小僧') v += 5;
    else if (myUnit) v -= 4;
    return v;
  }

  if (name === '爆燃' || name === '混沌打击') {
    let best = -1;
    for (const uid of targets) {
      const t = unitByUid(view, uid);
      if (!t) continue;
      const mine = ownField(view).some((x) => x.uid === uid);
      const dmg = name === '爆燃' ? ((t.damage || 0) > 0 ? 3000 : 1000) : 2000;
      let v;
      if (mine) {
        v = t.name === '灰烬小僧' && dmg >= remainingHp(t) ? 6 : -3;
      } else {
        v = dmg >= remainingHp(t) ? 7 : 1;
        if (hasKw(t, '守护')) v += 3;
        if ((t.atk || 0) >= 3000) v += 3;
      }
      if (v > best) best = v;
    }
    return best;
  }
  return 0;
}

function scoreAction(view, m, ctx) {
  const c = handCard(view, m.uid);
  switch (m.type) {
    case 'play': {
      if (!c) return -1;
      const name = c.name;
      const dmg = immediateDamage(view, m);
      if (dmg > 0) {
        let s = dmg * 5;
        if (dmg >= ctx.need) s += 500;
        else if (dmg >= ctx.need - 1) s += 25;
        if (ctx.race) s += 8;
        return s;
      }
      if (BUFF[name] || name === '自杀式袭击' || name === '爆燃' || name === '混沌打击') {
        const v = scoreTargets(view, m, ctx);
        if (v < 0) return -1;
        if (name === '混沌打击' && ctx.blocked) v += 3;
        return v;
      }
      if (DRAW[name]) {
        let s = 6;
        if ((view.me.handCount || 0) <= 4) s += 4;
        if (name === '灵质榨取' && m.mode === 'bury') s += (view.me.handCount || 0) >= 4 ? 3 : -3;
        if (name === '灵质重聚') s += 3;
        return s;
      }
      if (name === '火种祭坛') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) return -1;
        let s = 4;
        if (t.name === '灰烬小僧') s += 4;
        return s;
      }
      if (name === '余烬回燃') {
        const reds = (view.me.grave || []).filter((g) => g.type === '灵感' && g.color === '红').length;
        return reds >= 2 ? 10 : 1;
      }
      if (name === '烈焰聚合体' || name === '黑暗聚合体' || name === '混沌聚合体') {
        // 质密单位：放到场上不划算，除非能立刻发动。
        return 1;
      }
      if (FIGHTER[name] || c.type === '灵像') {
        let s = 3 + (c.attack || 0) / 1600 + (c.imp || 0) * 3;
        if (hasKw(c, '预制')) s += 4;
        if (hasKw(c, '敏捷')) s += 1;
        if (name === '灰烬小僧') s += 2;
        if (ownField(view).length <= oppField(view).length) s += 1;
        return s;
      }
      return 2;
    }
    case 'setEssence': {
      if (!c) return -1;
      const n = (view.me.essence || []).length;
      let s = essenceValue(view, c) - playValue(view, c);
      if (n >= 6) s -= 4;                              // 灵质已经够多，浪费手牌不划算
      if (n === 0) s += 4;                              // 一张灵质都没有 → 完全没有费用能力
      return s;
    }
    case 'ability': {
      const name = m.name;
      if (name === '黑暗聚合体') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) return -1;
        let s = 2;
        const threat = oppField(view).some((b) => (b.atk || 0) >= remainingHp(t));
        if (threat && FIGHTER[t.name]) s += 8;
        return s;
      }
      if (name === '烈焰聚合体') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) return -1;
        let s = 3;
        if (canSwing(t, view)) s += 5;                  // 一次性 +2000 攻击
        return s;
      }
      if (name === '火种祭坛') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) return -1;
        let s = 4;
        if (t.name === '灰烬小僧') s += 4;
        return s;
      }
      if (name === '熔岩投手') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) return -1;
        return (t.atk || 0) >= 2500 ? 7 : 2;
      }
      return 1;
    }
    case 'spiritSpecial': {
      if (m.name !== SPIRIT_BUFF) return 0;
      const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
      if (!t) return -1;
      let s = 2;
      if (canSwing(t, view)) s += 13;                   // +1 冲击 = +1 点生命伤害
      if (t.imp > 0) s += 2;
      if (ctx.race) s += 4;
      return s;
    }
    case 'spiritDraw':
      // 灵体横置与专属能力共用；专属能力（+1 冲击）更值钱，除非手牌枯竭。
      return (view.me.handCount || 0) <= 2 ? 9 : 3;
    case 'tapEssence':
      return -3;                                        // 费用支付会自动横置，手动横置纯浪费
    default:
      return 0;
  }
}

/* ── 主动阶段 ────────────────────────────────────────────────────────────── */
/** 挑一张最该埋进灵质区的手牌：优先红（红灵质能付红费与灰费），
 *  避开这回合就能出的牌，避开打出去价值高的牌。 */
function essencePick(view, moves) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    if (m.type !== 'setEssence') continue;
    const c = handCard(view, m.uid);
    if (!c) continue;
    const playable = moves.some((x) => x.type === 'play' && x.uid === m.uid);
    let s = c.color === '红' ? 3.2 : c.color === '黑' ? 1.0 : 0.4;
    if (hasKw(c, '质密')) s += 1.5;                    // 质密：埋在灵质区还能横置换爆发
    if (playable) s -= 4.5;                            // 现在就能出 → 留着
    s -= playValue(view, c) * 0.45;
    if ((c.cost ? c.cost.total : 0) >= 4) s -= 0.6;    // 高费牌留着当后期威胁
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function chooseMain(view, moves) {
  const need = damageNeeded(view);
  // 本回合理论上限的伤害（直伤 + 可攻击单位的冲击）
  let burn = 0;
  for (const m of moves) if (m.type === 'play') burn += immediateDamage(view, m);
  const swingUnit = bestAttacker(view);
  const race = burn + (swingUnit ? (swingUnit.imp || 0) : 0) >= need;
  const blocked = oppField(view).some((b) => canBlockAttacking(b, swingUnit || {}));
  const ctx = { need, race, pendingAttack: null, blocked };

  const essenceCount = (view.me.essence || []).length;
  // 灵质区就是费用上限：每回合只能 +1，但设下去永久生效、且当回合就能横置付费用。
  // 所以只要没到饱和值（5 点足够铺开整套牌），且这回合不能直接斩杀，就先设灵质。
  const canRamp = moves.some((m) => m.type === 'setEssence') && essenceCount < 5;
  const setMove = canRamp ? essencePick(view, moves) : null;
  if (setMove && !race) return setMove;

  let bestPlay = null;
  let bestPlayScore = 0;
  for (const m of moves) {
    if (m.type === 'pass' || m.type === 'setEssence') continue;
    const s = scoreAction(view, m, ctx);
    if (s > bestPlayScore) { bestPlayScore = s; bestPlay = m; }
  }
  if (bestPlay !== null) return bestPlay;
  if (setMove) return setMove;
  return passOf(moves);
}

/* ── 响应步骤（连锁非空 / 对手回合 / 战斗响应窗口） ─────────────────────── */
function chooseRespond(view, moves) {
  const chain = view.chain || [];
  const top = chain.length ? chain[chain.length - 1] : null;
  const mine = top && top.controller === view.me.idx;
  const cb = view.combat || {};
  const theirAttack = cb.stage === 'blockers' || (cb.stage === 'response' && cb.attacker !== view.me.idx && view.active !== view.me.idx)
    ? unitByUid(view, cb.attackerUid) : null;
  const need = damageNeeded(view);

  // 我的卡刚进连锁 → 让它结算。
  if (mine && chain.length) return passOf(moves);

  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type === 'pass') continue;
    let s = -1;
    if (m.type === 'play') {
      const c = handCard(view, m.uid);
      if (!c) continue;
      const name = c.name;
      if (BURN[name]) {
        const dmg = burnDamage(view, m);
        s = dmg * 5;
        if (dmg >= need) s += 500;
        else if (dmg >= need - 1) s += 20;
      } else if (BUFF[name]) {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t || !FIGHTER[t.name]) continue;
        s = canSwing(t, view) ? 8 : 1;
      } else if (name === '自杀式袭击') {
        const theirUnit = m.targets && m.targets[1] ? unitByUid(view, m.targets[1]) : null;
        const myUnit = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!theirUnit) continue;
        s = 3;
        if (theirAttack && theirUnit.uid === theirAttack.uid) s += 12;
        if ((theirUnit.atk || 0) >= 3000) s += 6;
        if (myUnit && myUnit.name === '灰烬小僧') s += 4;
        else if (myUnit) s -= 4;
      } else if (name === '爆燃' || name === '混沌打击') {
        let v = -1;
        for (const uid of m.targets || []) {
          const t = unitByUid(view, uid);
          if (!t) continue;
          const mine2 = ownField(view).some((x) => x.uid === uid);
          const dmg = name === '爆燃' ? ((t.damage || 0) > 0 ? 3000 : 1000) : 2000;
          let tv = mine2 ? (t.name === '灰烬小僧' && dmg >= remainingHp(t) ? 5 : -3)
            : (dmg >= remainingHp(t) ? 6 : 0);
          if (!mine2 && theirAttack && t.uid === theirAttack.uid) tv += 8;
          if (!mine2 && hasKw(t, '守护')) tv += 2;
          if (tv > v) v = tv;
        }
        s = v;
      } else if (DRAW[name]) {
        s = 2;
      } else {
        continue;
      }
    } else if (m.type === 'ability') {
      if (m.name === '火种祭坛') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) continue;
        s = 4;
        if (t.name === '灰烬小僧') s += 3;
        if (dmgWouldWin(view, 1)) s += 20;
      } else if (m.name === '黑暗聚合体') {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) continue;
        s = 1;
        if (theirAttack && FIGHTER[t.name]) s += 5;
      } else {
        s = 0;
      }
    } else if (m.type === 'spiritSpecial') {
      if (m.name !== SPIRIT_BUFF) { s = 0; }
      else {
        const t = m.targets && m.targets[0] ? unitByUid(view, m.targets[0]) : null;
        if (!t) { s = -1; }
        else {
          s = 1;
          if (canSwing(t, view)) s += 10;
        }
      }
    } else if (m.type === 'spiritDraw') {
      s = 7;
    } else {
      s = -1;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best && bestScore > 0 ? best : passOf(moves);
}

/** 加上 n 点额外直伤能否直接打穿对手。 */
function dmgWouldWin(view, n) {
  return n >= damageNeeded(view);
}

/* ── 对外接口 ────────────────────────────────────────────────────────────── */
export const meta = {
  id: 'minimaxm31flash',
  model: 'MiniMax M3.1flash',
  modelId: 'minimax-m3.1-flash',
  name: '余烬叠刃',
  desc: '灵质区就是永久费用引擎：每回合先设 1 张红灵质铺费用，再用血怒与余烬执火者把地狱犬的冲击叠到 3 点，每回合打脸 3 点生命伤害，第 4—5 回合打穿 blitz 的 6 点生命线。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  地狱犬: 4,
  烈焰斗士: 4,
  灰烬小僧: 4,
  火焰鸟: 4,
  烈焰聚合体: 4,
  烈焰之力: 2,
  血怒: 3,
  火球术: 3,
  焚尽: 2,
  爆燃: 2,
  余烬回燃: 2,
  烈焰战将: 1,
  火种祭坛: 1,
  燃魂: 3,
  灵质榨取: 2,
  黑暗聚合体: 2,
  自杀式袭击: 2,
  灵魂交易: 1,
  混沌打击: 2,
  冒险准备: 1,
  新人冒险者: 1,
};

export const spirit = '余烬执火者';
export const color = '红';

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    if (view.inspect) return chooseInspect(view, moves);
    const cb = view.combat;
    const stage = cb ? cb.stage : null;
    if (stage === 'attackers') return chooseAttackers(view, moves);
    if (stage === 'support') return chooseSupport(view, moves);
    if (stage === 'blockers') return chooseBlockers(view, moves);
    if (stage === 'order') return chooseOrder(view, moves);
    const myTurn = view.active === view.me.idx;
    const myPriority = view.priority === view.me.idx;
    const noChain = !view.chain || view.chain.length === 0;
    if (myTurn && myPriority && noChain && (view.phase === 'main1' || view.phase === 'main2')) return chooseMain(view, moves);
    return chooseRespond(view, moves);
  } catch (err) {
    return passOf(moves);
  }
}
