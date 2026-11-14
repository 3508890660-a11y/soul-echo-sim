/**
 * 策略名称：深根制压（Deep Root Press）
 * 选择理由：grand 长局生命 15、主卡组 50+，胜负不取决于前几回合的爆发，而取决于
 *   「费用引擎 + 冲击 2 终端」的后期制压。全局最硬的限制是每回合只能设 1 张灵质，
 *   而绿色是唯一能绕开它的颜色（自然生长/丰收把牌库顶直接转灵质，世界树苗/幼苗守望者
 *   把手牌转灵质），灵体再选根脉育苗者补一次「手牌→灵质＋过牌」；白色混色（生命之泉/
 *   守林圣骑士）与圣光打击补上绿色最缺的解场与回复；灰色终端（巨石守卫/山岭巨人）
 *   不卡色、任意灵质都能付。第 6 回合起四个冲击 2 终端陆续登场，靠质与量压穿 15 血。
 * 主责模式：grand
 */

export const meta = {
  id: 'step5preview',
  model: 'step5preview',
  modelId: 'step-5-preview',
  name: '深根制压',
  desc: 'grand 长局用绿色灵质引擎撕开每回合 1 张的灵质上限，中后期以冲击 2 巨物连续打脸制压。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // 1 费（8）
  '混沌打击': 2, '力量灌注': 2, '回复灵光': 2, '新人冒险者': 2,
  // 2 费（19）
  '自然生长': 4, '圣光打击': 3, '幼苗守望者': 3, '混沌冲击': 2,
  '根须缠绕': 2, '治愈灵光': 2, '誓约之环': 2, '冒险准备': 1,
  // 3 费（12）
  '黑市商人': 3, '森林守卫者': 2, '藤蔓编织者': 2, '根脉网络': 2,
  '生命之泉': 2, '荒原狼': 1,
  // 4 费（3）
  '丰收': 3,
  // 5 费（9）
  '巨石守卫': 3, '古树牧者': 2, '世界树苗': 2, '守林圣骑士': 2,
  // 6 费（2）
  '森林战将': 2,
  // 7 费（4）
  '王牌巨象': 2, '山岭巨人': 2,
};

export const spirit = '根脉育苗者';
export const color = '绿';

/* ──────────────────────────────────────────────────────────── */

const BIG_THREAT_ATK = 3500;

function pickPass(moves) {
  for (const m of moves) if (m && m.type === 'pass') return m;
  return moves[moves.length - 1];
}

function kw(c, k) {
  return !!c && Array.isArray(c.keywords) && c.keywords.indexOf(k) >= 0;
}

function unitVal(c) {
  if (!c) return 0;
  const a = c.atk || 0, i = c.imp || 0, h = c.hp || 0;
  let s = (a + h) / 1000 + i * 3;
  for (const k of (c.keywords || [])) {
    if (k === '践踏' || k === '超冲击' || k === '碾压') s += 1.5;
    else if (k === '守护' || k === '灵气' || k === '敏捷') s += 1;
    else if (k === '先攻' || k === '自愈' || k === '威慑' || k === '预制') s += 0.6;
  }
  return s;
}

function manaTotal(view) {
  let n = 0;
  const m = view.me.mana || {};
  for (const k in m) n += m[k] || 0;
  const es = view.me.essence || [];
  for (const e of es) if (e && !e.tapped) n++;
  return n;
}

function manaColor(view, color) {
  let n = (view.me.mana || {})[color] || 0;
  const es = view.me.essence || [];
  for (const e of es) if (e && !e.tapped && e.color === color) n++;
  return n;
}

function greenEssence(view) {
  let n = 0;
  for (const e of (view.me.essence || [])) if (e && e.color === '绿') n++;
  return n;
}

/** 近似判断费用颜色是否够（引擎 canPay 才是最终裁决，这里只用于打分参考）。 */
function costOk(view, c) {
  const cs = c && c.cost;
  if (!cs) return false;
  if (cs.colors) {
    for (const k in cs.colors) if (manaColor(view, k) < cs.colors[k]) return false;
    return true;
  }
  if (cs.colored > 0) return manaColor(view, c.color) >= cs.colored;
  return true;
}

/** 在场上找一张卡；mine 表示是否在自己场上。 */
function findCard(view, uid) {
  if (!uid) return { card: null, mine: false };
  let c = (view.opp.field || []).find((x) => x.uid === uid);
  if (c) return { card: c, mine: false };
  c = (view.me.field || []).find((x) => x.uid === uid);
  if (c) return { card: c, mine: true };
  return { card: null, mine: false };
}

/** 战斗结果模拟：先攻先结算，先攻方打死对方则对方不反击。 */
function combatResult(aAtk, aFirst, bAtk, bFirst, bHp, bDmg, aHp, aDmg) {
  const aKills = aAtk >= bHp - bDmg;
  const bKills = bAtk >= aHp - aDmg;
  if (aFirst && !bFirst) return { aDies: aKills ? false : bKills, bDies: aKills };
  if (bFirst && !aFirst) return { aDies: bKills, bDies: bKills ? false : aKills };
  return { aDies: bKills, bDies: aKills };
}

/** b 能否阻挡 a。 */
function canBlock(b, a) {
  if (!b || b.type !== '灵像') return false;
  if (b.tapped && !kw(b, '守护')) return false;
  if (kw(a, '敏捷') && !kw(b, '敏捷') && !(b.tapped && kw(b, '守护'))) return false;
  return true;
}

/* ─────────────── 灵体检视 ─────────────── */

function decideInspect(view, moves) {
  let take = null, reveal = null;
  for (const m of moves) {
    if (m.type === 'inspectTake') take = m;
    else if (m.type === 'inspectReveal') reveal = m;
  }
  if (!take) return reveal || pickPass(moves);
  if (!reveal) return take;
  const card = view.inspect && view.inspect.card ? view.inspect.card : null;
  const trig = card && typeof card.trigger === 'string' ? card.trigger : '';
  const hasTrig = trig.indexOf('CT') >= 0 || trig.indexOf('MT') >= 0 || trig.indexOf('ST') >= 0;
  if (!hasTrig) return take;
  // 本回合若有 5 费以上关键卡恰好差这 1 点绿，保留费用
  const g = manaColor(view, '绿');
  for (const c of (view.me.hand || [])) {
    const cs = c.cost || {};
    const need = cs.colors ? (cs.colors['绿'] || 0) : (c.color === '绿' ? (cs.colored || 0) : 0);
    if ((cs.total || 0) >= 5 && need === g && manaTotal(view) + 1 >= (cs.total || 0)) return take;
  }
  return reveal;
}

/* ─────────────── 攻击阶段 ─────────────── */

function decideAttack(view, moves) {
  const me = view.me, opp = view.opp;
  const oppUnits = (opp.field || []).filter((c) => c.type === '灵像');
  const oppThreat = oppUnits.filter((c) => !c.tapped).reduce((s, c) => s + (c.atk || 0), 0);
  let best = null, bestScore = 0.8;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const a = (me.field || []).find((c) => c.uid === m.uid);
    if (!a) continue;
    const aAtk = a.atk || 0, aHp = a.hp || 0, aDmg = a.damage || 0;
    let score;
    if (m.target === 'spirit') {
      if ((a.imp || 0) <= 0) continue;
      score = (a.imp || 0) * 3;
      const blockers = oppUnits.filter((b) => canBlock(b, a));
      if (blockers.length) {
        const safe = blockers.every((b) => aAtk >= (b.hp || 0) - (b.damage || 0));
        const freeBlock = blockers.some((b) => (b.atk || 0) >= aHp - aDmg && aAtk < (b.hp || 0) - (b.damage || 0));
        if (freeBlock) score = (a.imp || 0) * 1.1 - 0.6;
        else if (!safe) score = (a.imp || 0) * 2.2 - 0.4;
        else score = (a.imp || 0) * 3 - 0.3;
      }
      if ((opp.life || 9) <= 4) score += 1.5;
      // 对手有反打潜力时，冲击 1 的小怪适度留场
      if ((a.imp || 0) === 1 && oppThreat >= 5000 && !kw(a, '守护')) score *= 0.55;
      if (kw(a, '守护') && oppThreat >= 5000) score *= 0.7;
    } else {
      const t = (opp.field || []).find((c) => c.uid === m.target);
      if (!t) continue;
      const kill = aAtk >= (t.hp || 0) - (t.damage || 0);
      const die = (t.atk || 0) >= aHp - aDmg;
      score = kill ? unitVal(t) * 1.25 : unitVal(t) * 0.4 - 0.5;
      if (die) score -= unitVal(a) * 0.85;
      if (kill && !die) score += 0.5;
      if ((t.imp || 0) >= 2) score += 1;
      const others = oppUnits.filter((b) => canBlock(b, a) && b.uid !== t.uid);
      if (others.length) score -= 0.8;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || pickPass(moves);
}

/* ─────────────── 阻挡阶段 ─────────────── */

function decideBlock(view, moves) {
  const cb = view.combat;
  const a = (view.opp.field || []).find((c) => c.uid === cb.attackerUid);
  if (!a) return pickPass(moves);
  const targetIsSpirit = cb.target === 'spirit';
  const aVal = unitVal(a);
  const aAtk = a.atk || 0, aDmg = a.damage || 0, aHp = a.hp || 0;
  const aFirst = kw(a, '先攻');
  const already = (cb.blockers || []).length;
  const prevAtk = (cb.blockers || [])
    .map((uid) => (view.me.field || []).find((c) => c.uid === uid))
    .filter(Boolean)
    .reduce((s, c) => s + (c.atk || 0), 0);
  const killsA = prevAtk >= aHp - aDmg;
  const lowLife = (view.me.life || 99) <= 4;
  let best = null, bestScore = 0.2;
  for (const m of moves) {
    if (m.type !== 'block') continue;
    if ((cb.blockers || []).indexOf(m.uid) >= 0) continue; // 已挡单位再选=取消阻挡，绝不主动做
    const b = (view.me.field || []).find((c) => c.uid === m.uid);
    if (!b) continue;
    const bAtk = b.atk || 0, bDmg = b.damage || 0, bHp = b.hp || 0;
    const res = combatResult(aAtk, aFirst, bAtk, kw(b, '先攻'), bHp, bDmg, aHp, aDmg);
    const bVal = unitVal(b);
    let score;
    if (already > 0) {
      // 已有阻挡者时的边际收益：主要是补刀与封顶
      if (killsA) score = -0.3;
      else score = aVal * 0.9 - (res.bDies ? bVal * 0.95 : 0) + 0.5;
    } else if (targetIsSpirit) {
      const imp = a.imp || 0;
      if (imp <= 0) continue;
      score = imp * 3.2 * (lowLife ? 1.35 : 1);
      if (res.bDies) score -= bVal;
      if (res.aDies) score += aVal * 1.25;
      if (!res.bDies) score += 0.4;
    } else {
      const t = (view.me.field || []).find((c) => c.uid === cb.target);
      const tWillDie = t ? aAtk >= (t.hp || 0) - (t.damage || 0) : false;
      if (!tWillDie) {
        score = res.aDies && !res.bDies ? aVal * 1.2 : (res.aDies ? aVal * 0.5 - bVal * 0.5 : -0.5);
      } else {
        score = (t ? unitVal(t) : 0) * 1.0;
        if (res.bDies) score -= bVal * 0.9;
        if (res.aDies) score += aVal * 1.2;
      }
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || pickPass(moves);
}

/* ─────────────── 阻挡顺序 ─────────────── */

function decideOrder(view, moves) {
  const cb = view.combat;
  const list = (cb.blockers || [])
    .map((uid) => (view.opp.field || []).find((c) => c.uid === uid))
    .filter(Boolean);
  // 价值高的阻挡者排前面：攻击力按顺序恰好致命分配，先分的先死
  const want = list.slice().sort((x, y) => unitVal(y) - unitVal(x));
  let best = null, bestSim = -1;
  for (const m of moves) {
    if (m.type !== 'orderBlockers') continue;
    let sim = 0;
    for (let i = 0; i < want.length && i < m.order.length; i++) {
      if (m.order[i] === want[i]) sim += 2 - i * 0.01;
    }
    if (sim > bestSim) { bestSim = sim; best = m; }
  }
  return best || pickPass(moves);
}

/* ─────────────── 出牌评分 ─────────────── */

function playScore(c, view, m, isMain1) {
  const name = c.name;
  const targets = m.targets || [];
  let s = 0;
  if (c.type === '灵像') {
    s = ((c.atk || 0) + (c.hp || 0)) / 2000 + (c.imp || 0) * 3;
    for (const k of (c.keywords || [])) {
      if (k === '践踏' || k === '超冲击' || k === '碾压') s += 1.5;
      else if (k === '守护' || k === '灵气') s += 1.2;
      else if (k === '敏捷') s += 1;
      else if (k === '预制') s += isMain1 ? 3 : 0.4;
      else if (k === '先攻' || k === '自愈' || k === '威慑') s += 0.6;
    }
    if (name === '黑市商人') s += 3;        // 序曲抽 2（对手抽 1）
    if (name === '幼苗守望者') s += 2;      // 序曲手牌置灵质
    if (name === '守林圣骑士') {
      const hurt = (view.me.field || []).filter((x) => (x.damage || 0) > 0).length;
      s += 0.5 + hurt * 0.4;
    }
    if (name === '古树牧者') s += 0.5;
    const fieldN = (view.me.field || []).length;
    if (fieldN >= 7 && (c.imp || 0) < 2) s -= (fieldN - 6) * 0.3;
    return s;
  }
  switch (name) {
    case '圣光打击': {
      const f = findCard(view, targets[0]);
      if (!f.card) return 0.4;
      const kill = 5000 >= (f.card.hp || 0) - (f.card.damage || 0);
      if (!f.mine) return kill ? unitVal(f.card) * 1.1 + 0.6 : (f.card.imp || 0) * 1.5;
      return 0.1;
    }
    case '混沌打击': {
      const f = findCard(view, targets[0]);
      if (!f.card) return 0.4;
      const kill = 2000 >= (f.card.hp || 0) - (f.card.damage || 0);
      if (!f.mine) return kill ? unitVal(f.card) * 1.0 + 0.4 : ((f.card.damage || 0) > 0 ? 0.9 : 0.35);
      return 0.1;
    }
    case '混沌冲击':
      return (view.opp.life || 9) <= 5 ? 4.2 : 2.9;
    case '回复灵光': {
      const f = findCard(view, targets[0]);
      if (!f.card || !f.mine) return 0.3;
      const heal = Math.min(3000, f.card.damage || 0);
      const key = (f.card.imp || 0) >= 1 || (f.card.hp || 0) >= 4000;
      return key ? heal / 1000 * 1.6 + 0.4 : heal / 1000 * 0.5;
    }
    case '力量灌注': {
      const f = findCard(view, targets[0]);
      if (!f.card || !f.mine) return 0.2;
      let v = 0.9;
      if ((f.card.imp || 0) >= 1 && !f.card.tapped) v += 0.5;
      if ((f.card.atk || 0) >= 4000) v += 0.4;
      return v;
    }
    case '治愈灵光':
      return (view.turn || 1) > 6 ? 2.0 : 1.5;
    case '誓约之环':
      return (view.turn || 1) > 6 ? 2.0 : 1.6;
    case '根须缠绕': {
      const f = findCard(view, targets[0]);
      if (!f.card || f.mine) return 0.4;
      const v = (f.card.atk || 0) >= BIG_THREAT_ATK || (f.card.imp || 0) >= 2;
      return v ? 3.4 : 0.7;
    }
    case '冒险准备':
      return 2.0;
    case '生命之泉': {
      let v = 2.0; // 牌库顶置灵质
      const hurt = (view.me.field || []).filter((x) => (x.damage || 0) >= 1200);
      if (hurt.length) {
        const t = hurt.sort((x, y) => (y.damage || 0) - (x.damage || 0))[0];
        const key = (t.imp || 0) >= 1 || (t.hp || 0) >= 4000;
        v += key ? 1.8 : 0.6;
      }
      return v;
    }
    case '自然生长':
      return (view.turn || 1) <= 5 ? 3.4 : 2.6;
    case '丰收':
      return (view.turn || 1) <= 8 ? 3.6 : 2.8;
    case '根脉网络': {
      const g = greenEssence(view);
      return g >= 6 ? 3.2 : g >= 3 ? 2.6 : 1.6;
    }
    case '世界树苗':
      return (view.turn || 1) <= 8 ? 3.0 : 2.5;
    default:
      return 0.5;
  }
}

/* ─────────────── 启动能力评分 ─────────────── */

function canUseMore(view, extra) {
  const avail = manaTotal(view);
  for (const c of (view.me.hand || [])) {
    const tot = (c.cost && c.cost.total) || 0;
    if (tot > avail && tot <= avail + extra && costOk(view, c)) return true;
  }
  return false;
}

function abilityScore(m, view) {
  const name = m.name;
  const handN = (view.me.hand || []).length;
  if (m.type === 'spiritSpecial') {
    if (name === '根脉育苗者') return handN >= 3 ? 3.1 : 1.9;
    return 1.0;
  }
  switch (name) {
    case '森林守卫者': {
      // 横置产 1 绿：仅当本回合还用得掉，且不牺牲关键防守
      const oppThreat = (view.opp.field || []).filter((c) => !c.tapped && (c.atk || 0) >= 3000).length;
      const myReady = (view.me.field || []).filter((c) => !c.tapped && c.type === '灵像').length;
      if (oppThreat >= 1 && myReady <= 2) return 0.4;
      return canUseMore(view, 1) ? 3.0 : 0.4;
    }
    case '藤蔓编织者': {
      const f = m.targets && m.targets[0] ? findCard(view, m.targets[0]) : { card: null, mine: false };
      if (!f.card || !f.mine) return 0.4;
      let v = 0.9;
      if ((f.card.atk || 0) >= 4000) v += 0.5;
      if ((f.card.damage || 0) >= 1000) v += 0.3;
      if ((f.card.hp || 0) - (f.card.damage || 0) <= 1000) v += 0.5;
      return v;
    }
    case '世界树苗':
      return handN >= 3 ? 2.9 : 1.7;
    default:
      return 0.5;
  }
}

/* ─────────────── 主要阶段 ─────────────── */

function decideMain(view, moves) {
  const hand = view.me.hand || [];
  const handN = hand.length;
  const isMain1 = view.phase === 'main1';
  let best = null, bestScore = 1.15;

  for (const m of moves) {
    if (m.type !== 'play') continue;
    const c = hand.find((x) => x.uid === m.uid);
    if (!c) continue;
    let s = playScore(c, view, m, isMain1);
    if (s <= 0) continue;
    if (handN >= 7) s += 0.7; // 爆牌压力，优先消化
    if ((view.opp.life || 9) <= 4) {
      if (c.name === '混沌冲击' || (c.type === '灵像' && (c.imp || 0) >= 2)) s += 1;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }

  if (handN >= 3 || (view.turn || 1) <= 6) {
    for (const m of moves) {
      if (m.type !== 'setEssence') continue;
      const c = hand.find((x) => x.uid === m.uid);
      if (!c) continue;
      let s = 2.3;
      if (c.color === '绿') s += 1.5;
      else if (c.color === '灰') s += 1.0;
      else if (c.color === '白') s += 0.5;
      else s += 0.2;
      s += Math.max(0, 4 - ((c.cost && c.cost.total) || 0)) * 0.2;
      if (c.type === '灵像' && ((c.cost && c.cost.total) || 0) >= 5) s -= 4;
      if (c.type === '灵像' && (c.imp || 0) >= 2) s -= 2;
      if (c.name === '自然生长' || c.name === '丰收') s -= 2.5;
      if (c.name === '黑市商人' || c.name === '圣光打击' || c.name === '生命之泉') s -= 1.0;
      if (handN <= 3) s -= 0.5;
      if (handN >= 7) s += 0.8;
      if (s > bestScore) { bestScore = s; best = m; }
    }
  }

  for (const m of moves) {
    if (m.type !== 'ability' && m.type !== 'spiritSpecial') continue;
    const s = abilityScore(m, view);
    if (s > bestScore) { bestScore = s; best = m; }
  }

  for (const m of moves) {
    if (m.type === 'spiritDraw') {
      let s = 2.1;
      if (handN >= 6) s = 1.2;
      if ((view.me.deck || 0) <= 8) s += 0.6;
      if (s > bestScore) { bestScore = s; best = m; }
      break;
    }
  }

  return best || pickPass(moves);
}

/* ─────────────── 响应阶段 ─────────────── */

function decideResponse(view, moves) {
  const isMain1 = view.phase === 'main1';
  let best = null, bestScore = 2.6;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const c = (view.me.hand || []).find((x) => x.uid === m.uid);
    if (!c || c.type !== '灵感') continue;
    const s = playScore(c, view, m, isMain1);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pickPass(moves);
}

/* ─────────────── 入口 ─────────────── */

export function choose(view, moves) {
  try {
    if (view && Array.isArray(moves) && moves.length) {
      let r = null;
      if (view.inspect) {
        r = decideInspect(view, moves);
      } else {
        const cb = view.combat;
        if (cb && cb.stage === 'blockers') r = decideBlock(view, moves);
        else if (cb && cb.stage === 'order') r = decideOrder(view, moves);
        else if (cb && cb.stage === 'attackers') r = decideAttack(view, moves);
        else if (cb && cb.stage === 'support') r = moves.find((m) => m.type === 'supportSpirit') || pickPass(moves);
        else if (view.active === view.me.idx && (view.phase === 'main1' || view.phase === 'main2') && (!view.chain || view.chain.length === 0)) r = decideMain(view, moves);
        else r = decideResponse(view, moves);
      }
      if (r) return r;
    }
  } catch (e) {
    // 任何异常都退回让过
  }
  return pickPass(moves);
}
