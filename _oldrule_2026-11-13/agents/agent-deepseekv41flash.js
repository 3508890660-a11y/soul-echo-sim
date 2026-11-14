// 策略名称：不落圣所
// 选择理由：SE01 里「守护」可以让横置的单位继续阻挡、「自愈」在每次结束步骤把伤害全部抹掉，
//   两者叠在同一张卡上就等于「打脸的单位同时是永远杀不掉的墙」。长局 15 点生命靠一次性爆发打不完，
//   而这种结构每回合都在免费产出 1—2 点冲击伤害、同时把对方的攻击全部吃掉，是资源效率最高的形态。
// 主责模式：grand

export const meta = {
  id: 'deepseekv41flash',
  model: 'deepseek v4.1flash',
  modelId: 'deepseek-v4.1-flash',
  name: '不落圣所',
  desc: '守护＋自愈的白墙边挡边打脸，用高效单体解牌逐张拔掉对方唯一能挡路的单位，把 15 点生命一点点磨穿。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  圣光聚合体: 4,
  圣光打击: 4,
  回复灵光: 2,
  晨祷侍从: 2,
  治愈灵光: 3,
  誓约之环: 2,
  光能守护者: 4,
  圣所守卫: 4,
  净化仪式: 4,
  圣所钟塔: 2,
  圣光祷告者: 4,
  赎罪骑士: 4,
  圣光战将: 3,
  白塔裁决者: 3,
  雷霆打击: 4,
  雷铸天兵: 4,
  力量共鸣: 2,
  巨石守卫: 3,
  混沌冲击: 2,
};

export const spirit = '根脉育苗者';
export const color = '白';

/* ───────────── 静态知识表（只读，不含跨局状态） ───────────── */

const DMG_CARDS = {
  圣光打击: 5000, 雷霆打击: 2000, 混沌打击: 2000, 爆燃: 1000,
  奥术飞弹: 2000, 连锁雷鸣: 3000, 雷鸣余波: 2000,
};
const DESTROY_CARDS = ['净化仪式', '荒原法则', '分解射线', '自杀式袭击', '腐朽王座'];
const DIRECT_CARDS = { 火球术: 2, 焚尽: 3, 混沌冲击: 1 };

// 这张牌「不该被当成灵质烧掉」的程度（0—70）
const KEEP = {
  圣光聚合体: 4, 晨祷侍从: 14, 回复灵光: 12, 治愈灵光: 12, 誓约之环: 16,
  光能守护者: 42, 圣所守卫: 44, 净化仪式: 46, 圣所钟塔: 30,
  圣光祷告者: 48, 赎罪骑士: 44, 圣光战将: 68, 白塔裁决者: 66,
  圣光打击: 58, 雷霆打击: 40, 雷铸天兵: 34, 力量共鸣: 20,
  共鸣武士: 30, 巨石守卫: 54, 混沌冲击: 8, 混沌打击: 28,
};

function kw(c, k) { return !!c && Array.isArray(c.keywords) && c.keywords.indexOf(k) >= 0; }
function remHp(c) { return !c ? 0 : Math.max(0, (c.hp || 0) - (c.damage || 0)); }
function byUid(list, uid) {
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].uid === uid) return list[i];
  return null;
}
function pickPass(moves) {
  for (let i = 0; i < moves.length; i++) if (moves[i] && moves[i].type === 'pass') return moves[i];
  return moves[moves.length - 1];
}
function isUnit(c) { return !!c && (c.type === '灵像' || c.token); }

/** 单位在场上的价值（用于「杀谁」与「死谁」的换算）。 */
function unitValue(c) {
  if (!c) return 0;
  let v = 18 + (c.atk || 0) / 260 + (c.imp || 0) * 26 + (c.hp || 0) / 620;
  if (kw(c, '守护')) v += 12;
  if (kw(c, '自愈')) v += 16;
  if (kw(c, '灵气')) v += 6;
  if (kw(c, '威慑')) v += 6;
  if (kw(c, '敏捷')) v += 8;
  if (kw(c, '预制')) v += 8;
  if (kw(c, '超冲击')) v += 10;
  if (kw(c, '践踏')) v += 6;
  if (c.token) v *= 0.45;
  if (c.type === '灵性') v *= 0.7;
  return v;
}

function boardValue(list) {
  let s = 0;
  if (!Array.isArray(list)) return 0;
  for (let i = 0; i < list.length; i++) s += unitValue(list[i]);
  return s;
}

/** 单挑交换预测：a 攻击 b。返回 b 是否死、a 是否死。 */
function exchange(a, b) {
  const aHp = remHp(a), bHp = remHp(b);
  let bDies = (a.atk || 0) >= bHp;
  let aDies = (b.atk || 0) >= aHp;
  const aFirst = kw(a, '先攻'), bFirst = kw(b, '先攻');
  if (aFirst && !bFirst && bDies) aDies = false;
  if (bFirst && !aFirst && aDies) bDies = false;
  return { defDies: bDies, atkDies: aDies };
}

/** 对方能合法阻挡该攻击者的单位。 */
function eligibleBlockers(view, attacker) {
  const out = [];
  const list = view.opp.field || [];
  const agile = kw(attacker, '敏捷');
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c || c.type !== '灵像') continue;
    const guard = kw(c, '守护');
    if (c.tapped && !guard) continue;
    if (agile && !kw(c, '敏捷') && !(c.tapped && guard)) continue;
    out.push(c);
  }
  return out;
}

/* ───────────── 主阶段：出牌打分 ───────────── */

function scoreUnitPlay(view, card) {
  const cost = (card.cost && card.cost.total) || 0;
  let s = 118 + (card.impact || 0) * 38 + (card.attack || 0) / 230 + (card.vitality || 0) / 520;
  if (kw(card, '守护')) s += 22;
  if (kw(card, '自愈')) s += 26;
  if (kw(card, '灵气')) s += 10;
  if (kw(card, '威慑')) s += 8;
  if (kw(card, '敏捷')) s += 10;
  if (kw(card, '预制')) s += 12;
  if (kw(card, '超冲击')) s += 10;
  if (kw(card, '质密')) s -= 8;
  s += Math.max(0, 6 - cost) * 5;
  // 场上已经有墙时，继续堆墙的价值略降，优先补「能打脸的东西」
  if (view.me.field.length >= 4) s -= 12;
  return s;
}

function scorePillarPlay(view, card) {
  let s = 128;
  if (view.me.field.length >= 2) s += 28;
  if (view.me.field.length === 0) s -= 30;
  if (card.name === '圣所钟塔') s += 14;
  return s;
}

function scoreDamagePlay(view, m, amount) {
  const targets = m.targets || [];
  let best = -99;
  const myBoard = boardValue(view.me.field);
  const oppBoard = boardValue(view.opp.field);
  const pressure = oppBoard > myBoard * 1.15 ? 42 : 0;
  const atkUid = view.combat ? view.combat.attackerUid : null;
  for (let i = 0; i < targets.length; i++) {
    const uid = targets[i];
    const t = byUid(view.opp.field, uid);
    if (!t) continue;
    const rem = remHp(t);
    let v;
    if (amount >= rem) {
      v = 52 + unitValue(t) * 0.78 + pressure;
      if ((t.imp || 0) >= 2) v += 26;
      if (uid === atkUid) v += 40;
      if (isUnit(t) && t.type === '灵性') v += 10;
    } else {
      v = 6 + Math.min(amount, rem) / 380;
      if (uid === atkUid) v += 12;
    }
    if (v > best) best = v;
  }
  return best;
}

function scoreDestroyPlay(view, m) {
  const targets = m.targets || [];
  let best = -99;
  const myBoard = boardValue(view.me.field);
  const oppBoard = boardValue(view.opp.field);
  const pressure = oppBoard > myBoard * 1.15 ? 40 : 0;
  for (let i = 0; i < targets.length; i++) {
    const uid = targets[i];
    const t = byUid(view.opp.field, uid);
    if (!t) continue;
    let v = 62 + unitValue(t) * 0.82 + pressure;
    if ((t.imp || 0) >= 2) v += 26;
    if (kw(t, '自愈')) v += 12;
    if (v > best) best = v;
  }
  return best;
}

function scoreDirectPlay(view, m, amount) {
  const life = view.opp.life || 0;
  if (amount > life) return 9000;
  let s = 26 + amount * 20;
  if (life <= amount + 3) s += 18;
  if (!view.opp.field.length) s += 14;
  return s;
}

function scorePumpPlay(view, m) {
  const targets = m.targets || [];
  let best = -99;
  for (let i = 0; i < targets.length; i++) {
    const t = byUid(view.me.field, targets[i]);
    if (!t) continue;
    const surv = remHp(t);
    let s = 34 + Math.min(surv, 7000) / 220;
    if (kw(t, '自愈')) s += 38;
    if (kw(t, '守护')) s += 14;
    if ((t.imp || 0) >= 1) s += 8;
    if (s > best) best = s;
  }
  return best;
}

function scoreBuffAllPlay(view) {
  const n = view.me.field.length;
  if (n < 2) return 22;
  return 46 + n * 17;
}

function scoreHealPlay(view, m, amount) {
  const targets = m.targets || [];
  let best = -99;
  for (let i = 0; i < targets.length; i++) {
    const t = byUid(view.me.field, targets[i]);
    if (!t) continue;
    const dmg = t.damage || 0;
    if (dmg <= 0) continue;
    const heal = Math.min(dmg, amount);
    let s = 18 + heal / 420;
    if (remHp(t) <= 1500) s += 34;
    if (kw(t, '守护') || kw(t, '自愈')) s += 10;
    if (s > best) best = s;
  }
  return best;
}

function scorePlay(view, m, isResp) {
  const card = byUid(view.me.hand, m.uid);
  if (!card) return -99;
  const name = card.name;
  if (card.type === '灵像') return isResp ? -99 : scoreUnitPlay(view, card);
  if (card.type === '灵性') return isResp ? -99 : scorePillarPlay(view, card);
  if (DMG_CARDS[name] != null) return scoreDamagePlay(view, m, DMG_CARDS[name]);
  if (DESTROY_CARDS.indexOf(name) >= 0) return scoreDestroyPlay(view, m);
  if (DIRECT_CARDS[name] != null) return scoreDirectPlay(view, m, DIRECT_CARDS[name]);
  if (name === '雷铸天兵') return scorePumpPlay(view, m);
  if (name === '力量共鸣' || name === '生命共鸣') return scoreBuffAllPlay(view);
  if (name === '回复灵光') return scoreHealPlay(view, m, 3000);
  if (name === '圣疗') return scoreHealPlay(view, m, 5000);
  if (name === '治愈灵光') return 34;
  if (name === '智慧之光') return 46;
  return 8;
}

/* ───────────── 设灵质 ───────────── */

function pipsOf(card) {
  const c = (card && card.cost) || {};
  if (c.colors && !c.colors.__single) return c.colors;
  return c.colored > 0 ? { [card.color]: c.colored } : {};
}

function neededColors(view, skipUid) {
  const need = {};
  const hand = view.me.hand || [];
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.uid === skipUid) continue;
    const p = pipsOf(c);
    for (const k in p) need[k] = (need[k] || 0) + p[k];
  }
  return need;
}

function scoreSetEssence(view, m) {
  if ((view.me.handCount || 0) <= 2) return -1;
  const card = byUid(view.me.hand, m.uid);
  if (!card) return -1;
  const essence = (view.me.essence || []).length;
  if (essence >= 10) return -1;
  let s = 142;
  if (essence <= 3) s += 58;
  else if (essence <= 5) s += 32;
  else if (essence >= 8) s -= 46;
  const keep = KEEP[card.name] != null ? KEEP[card.name] : 25;
  s -= keep * 0.55;
  const need = neededColors(view, m.uid);
  if (card.color && need[card.color]) s += 18;
  // 造出一块自己用不上的颜色，比少一块地更伤：白色 3 点色费全靠灵质凑
  else if (card.color !== '灰') s -= 34;
  if (card.color === '灰') s -= 22;
  return s;
}

function scoreAbility(view, m) {
  // 本卡组只有圣光聚合体的质密（横置把自身放到生命卡组顶 = 换 1 点生命）
  const essence = (view.me.essence || []).length;
  if (essence >= 8 && (view.me.life || 0) <= 8) return 30;
  return -1;
}

function scoreSpiritSpecial(view, m) {
  // 根脉育苗者：横置 → 把「手牌中最便宜的一张」置入灵质区并抽 1 张。
  // 引擎替我们挑最便宜的那张，所以先算清它到底是弃材还是关键牌。
  if (m.name !== '根脉育苗者') return -1;
  const hand = view.me.hand || [];
  if (hand.length < 3) return -1;
  const essence = (view.me.essence || []).length;
  if (essence >= 10) return -1;
  if ((view.me.deck || 0) <= 5 && hand.length >= 3) return -1; // 见底时别再把牌库往墓里送
  let cheap = null;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (!cheap || ((c.cost && c.cost.total) || 0) < ((cheap.cost && cheap.cost.total) || 0)) cheap = c;
  }
  if (!cheap) return -1;
  const keep = KEEP[cheap.name] != null ? KEEP[cheap.name] : 25;
  if (hand.length >= 3 && keep <= 20) return 174;
  if (hand.length >= 5 && keep <= 40) return 148;
  if (hand.length >= 7 && keep <= 55) return 132;
  return -1;
}

function scoreSpiritDraw(view, m) {
  const hand = view.me.handCount || 0;
  if ((view.me.deck || 0) <= 5 && hand >= 3) return -1;
  if (hand <= 3) return 130;
  if (hand <= 5) return 82;
  return 34;
}

/* ───────────── 检视（灵体找牌） ───────────── */

function chooseInspect(view, moves) {
  const info = view.inspect;
  const card = info && info.card;
  if (!card) return null;
  let take = null, reveal = null;
  for (let i = 0; i < moves.length; i++) {
    if (moves[i].type === 'inspectTake') take = moves[i];
    if (moves[i].type === 'inspectReveal') reveal = moves[i];
  }
  if (!take) return null;
  if (reveal && card.trigger && card.trigger !== '—') {
    // 揭示只多付 1 点白色灵能换来一次触发；有剩费才做
    let spare = 0;
    const ess = view.me.essence || [];
    for (let i = 0; i < ess.length; i++) if (!ess[i].tapped) spare++;
    const mana = view.me.mana || {};
    for (const k in mana) spare += mana[k] || 0;
    if (spare >= 1) return reveal;
  }
  return take;
}

/* ───────────── 战斗 ───────────── */

function scoreBlock(view, m) {
  const cb = view.combat;
  if (!cb) return -99;
  if (cb.blockers && cb.blockers.indexOf(m.uid) >= 0) return -99; // 不取消已有阻挡
  if (cb.blockers && cb.blockers.length >= 1) return -99;         // 只用一个阻挡者
  const my = byUid(view.me.field, m.uid);
  const atk = byUid(view.opp.field, cb.attackerUid);
  if (!my || !atk) return -99;
  const ex = exchange(atk, my);
  const iKill = ex.defDies;
  const iDie = ex.atkDies;
  let s = 0;
  if (cb.target === 'spirit') s += (atk.imp || 0) * 45;
  else s += 16;
  if (iKill) s += unitValue(atk) * 0.9;
  if (iDie) s -= unitValue(my) * 1.0;
  if (kw(my, '自愈')) s += 20;
  if (kw(my, '守护')) s += 6;
  if (cb.target === 'spirit' && (atk.imp || 0) >= (view.me.life || 0)) s += 5000;
  return s;
}

function chooseOrder(view, moves) {
  // 引擎按给定顺序把攻击力逐点灌给阻挡者（每个最多灌到致命），
  // 所以直接逐种顺序模拟一遍，取「杀掉的价值最高」的那一种。
  const cb = view.combat;
  const atk = cb ? byUid(view.me.field, cb.attackerUid) : null;
  const atkPower = atk ? (atk.atk || 0) : 0;
  let best = null, bestScore = -1e9;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'orderBlockers' || !Array.isArray(m.order)) continue;
    let remaining = atkPower;
    let score = 0;
    for (let j = 0; j < m.order.length; j++) {
      const b = byUid(view.opp.field, m.order[j]);
      if (!b) continue;
      const hp = remHp(b);
      const dealt = Math.min(hp, remaining);
      remaining -= dealt;
      if (dealt >= hp) score += unitValue(b) + 10;
      else if (dealt > 0) score += dealt / 200;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

function scoreAttack(view, m) {
  const me = byUid(view.me.field, m.uid);
  if (!me) return -99;
  const imp = me.imp || 0;
  const atk = me.atk || 0;
  const oppLife = view.opp.life || 0;

  if (m.target === 'spirit') {
    if (imp > oppLife) return 9000;
    if (imp <= 0) return -1;
    let s = 34 + imp * 40;
    const blockers = eligibleBlockers(view, me);
    if (!blockers.length) s += 52;
    else {
      let worst = 0;
      for (let i = 0; i < blockers.length; i++) {
        const ex = exchange(me, blockers[i]);
        if (ex.atkDies && !ex.defDies) worst = Math.max(worst, unitValue(me));
        else if (ex.atkDies && ex.defDies) worst = Math.max(worst, unitValue(me) - unitValue(blockers[i]) * 0.8);
      }
      s -= worst * 0.75;
      if (kw(me, '超冲击')) s += 26;
      if (kw(me, '践踏')) s += 12;
    }
    if (kw(me, '自愈')) s += 16;
    if (kw(me, '守护')) s += 10;
    if (!kw(me, '守护') && !kw(me, '自愈') && blockers.length) s -= 14;
    return s;
  }

  const t = byUid(view.opp.field, m.target);
  if (!t) return -99;
  const rem = remHp(t);
  if (rem <= 0) return -99;
  const ex = exchange(me, t);
  let s = 8;
  if (atk >= rem) {
    s += 36 + unitValue(t) * 0.85;
    if (t.type === '灵性') s += 12;
    if ((t.imp || 0) >= 2) s += 18;
  } else {
    s += Math.min(atk, rem) / 320;
  }
  if (ex.atkDies) s -= unitValue(me) * 0.85;
  if (kw(me, '自愈')) s += 12;
  if (kw(me, '先攻') && atk >= rem) s += 14;
  return s;
}

function scoreSupport(view) {
  const cb = view.combat;
  if (!cb) return -1;
  const me = byUid(view.me.field, cb.attackerUid);
  if (!me) return -1;
  const imp = (me.imp || 0) + 1;
  if (cb.target === 'spirit') {
    if (imp > (view.opp.life || 0)) return 900;
    return 34;
  }
  const t = byUid(view.opp.field, cb.target);
  if (t && (me.atk || 0) + 1000 >= remHp(t) && (me.atk || 0) < remHp(t)) return 40;
  return -1;
}

/* ───────────── 入口 ───────────── */

function bestScored(view, moves, scorer, threshold) {
  let best = null, bs = threshold;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type === 'pass') continue;
    let s;
    try { s = scorer(view, m); } catch (e) { s = -99; }
    if (typeof s === 'number' && s > bs) { bs = s; best = m; }
  }
  return best;
}

export function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return { type: 'pass' };
    const pass = pickPass(moves);
    if (!view || !view.me) return pass;

    if (view.inspect) {
      const m = chooseInspect(view, moves);
      return m || pass;
    }

    const cb = view.combat;
    if (cb) {
      if (cb.stage === 'blockers') {
        return bestScored(view, moves, scoreBlock, 24) || pass;
      }
      if (cb.stage === 'order') {
        return chooseOrder(view, moves) || pass;
      }
      if (cb.stage === 'attackers') {
        if (view.active !== view.me.idx) return pass;
        return bestScored(view, moves, scoreAttack, 30) || pass;
      }
      if (cb.stage === 'support') {
        if (view.active !== view.me.idx) return pass;
        const s = scoreSupport(view);
        if (s > 0) {
          for (let i = 0; i < moves.length; i++) if (moves[i].type === 'supportSpirit') return moves[i];
        }
        return pass;
      }
    }

    const myTurn = view.active === view.me.idx;
    const inMain = myTurn && (view.phase === 'main1' || view.phase === 'main2')
      && (!view.chain || view.chain.length === 0);

    if (inMain) {
      let best = null, bs = 0;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (!m || m.type === 'pass' || m.type === 'tapEssence') continue;
        let s = -99;
        try {
          if (m.type === 'play') s = scorePlay(view, m, false);
          else if (m.type === 'setEssence') s = scoreSetEssence(view, m);
          else if (m.type === 'ability') s = scoreAbility(view, m);
          else if (m.type === 'spiritSpecial') s = scoreSpiritSpecial(view, m);
          else if (m.type === 'spiritDraw') s = scoreSpiritDraw(view, m);
        } catch (e) { s = -99; }
        if (typeof s === 'number' && s > bs) { bs = s; best = m; }
      }
      return best || pass;
    }

    // 响应（对方回合，或连锁中）：只用灵感卡，门槛抬高
    let best = null, bs = 32;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!m || m.type !== 'play') continue;
      let s = -99;
      try { s = scorePlay(view, m, true); } catch (e) { s = -99; }
      if (typeof s === 'number' && s > bs) { bs = s; best = m; }
    }
    return best || pass;
  } catch (e) {
    return pickPass(moves);
  }
}
