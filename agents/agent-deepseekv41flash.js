/**
 * 策略名称：圣所铁壁·二阶冲击
 * 选择理由：白色灵像的「守护＋自愈＋灵气」让它既能每回合打点、又能在被横置后继续阻挡；
 *          再用雷铸天兵把每面墙永久抬到冲击 2，长局里免费治疗与生命补充把对手拖垮。
 * 主责模式：grand
 */

export const meta = {
  id: 'deepseekv41flash',
  model: 'deepseek v4.1flash',
  modelId: 'deepseek-v4.1-flash',
  name: '圣所铁壁·二阶冲击',
  desc: '守护自愈的白色墙群同时承担打点与阻挡，雷铸天兵把墙抬成冲击 2，靠免费治疗与生命补充赢下长局。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

/** 卡组：白 45 ＋ 黄 11 ＝ 56 张，白占 80.4%。 */
export const deck = {
  // ── 白 · 灵像 ──
  光能守护者: 4,
  圣光战将: 4,
  圣光祷告者: 4,
  圣所守卫: 4,
  晨祷侍从: 4,
  圣光聚合体: 4,
  赎罪骑士: 2,
  白塔裁决者: 2,
  // ── 白 · 灵感 ──
  圣光打击: 4,
  净化仪式: 4,
  回复灵光: 3,
  治愈灵光: 2,
  圣疗: 2,
  // ── 白 · 灵性 ──
  圣所钟塔: 2,
  // ── 黄 · 支援 ──
  雷铸天兵: 4,
  雷霆打击: 4,
  力量共鸣: 3,
};

export const spirit = '圣所守夜人';
export const color = '白';

/* ───────────────────────────── 打分基础件（全部为纯函数） ───────────────────────────── */

const KW_SCORE = {
  守护: 2.2, 自愈: 1.5, 灵气: 1.0, 威慑: 1.2, 敏捷: 0.6, 预制: 0.7,
  质密: 0.2, 诱饵: 0.3, 先攻: 0.9, 践踏: 0.4, 超冲击: 1.4, 碾压: 0.4, 回响: 0.3,
};

/** 卡面价值：攻击/生命/冲击 + 关键词权重。 */
function val(c) {
  if (!c) return 0;
  let k = 0;
  for (const w of c.keywords || []) k += KW_SCORE[w] || 0;
  return (c.atk || 0) / 1000 + (c.hp || 0) / 2000 + (c.imp || 0) * 2.5 + k;
}

function remainHp(c) { return c ? Math.max(0, (c.hp || 0) - (c.damage || 0)) : 0; }

function byUid(list, uid) {
  if (!Array.isArray(list)) return undefined;
  for (const c of list) if (c && c.uid === uid) return c;
  return undefined;
}

function untappedEssence(view) {
  let n = 0;
  for (const c of view.me.essence || []) if (!c.tapped) n++;
  return n;
}

function availMana(view) {
  let n = untappedEssence(view);
  const m = view.me.mana || {};
  for (const k of Object.keys(m)) n += Number(m[k]) || 0;
  return n;
}

function myUnits(view) {
  return (view.me.field || []).filter((c) => c && c.type === '灵像');
}

function oppUnits(view) {
  return (view.opp.field || []).filter((c) => c && c.type === '灵像');
}

/** 一对一战斗结果（考虑先攻）。 */
function duel(a, b) {
  const aAtk = a.atk || 0, bAtk = b.atk || 0;
  const aHp = remainHp(a), bHp = remainHp(b);
  const aFirst = (a.keywords || []).includes('先攻');
  const bFirst = (b.keywords || []).includes('先攻');
  let aDies = false, bDies = false;
  if (aFirst && !bFirst) { bDies = aAtk >= bHp; if (!bDies) aDies = bAtk >= aHp; }
  else if (bFirst && !aFirst) { aDies = bAtk >= aHp; if (!aDies) bDies = aAtk >= bHp; }
  else { bDies = aAtk >= bHp; aDies = bAtk >= aHp; }
  return { aDies, bDies, aAtk, bAtk, aHp, bHp };
}

/** 单位能否作为阻挡者（与引擎 legalMoves 的过滤器一致）。 */
function blockable(b, attacker) {
  if (!b || b.type !== '灵像') return false;
  const k = b.keywords || [];
  const guard = k.includes('守护');
  if (b.tapped && !guard) return false;
  if ((attacker.keywords || []).includes('敏捷') && !k.includes('敏捷')) {
    if (!(b.tapped && guard)) return false;
  }
  return true;
}

/** 对手当前可能的阻挡者。 */
function possibleBlockers(view, attacker) {
  return oppUnits(view).filter((b) => blockable(b, attacker));
}

/** 对手用 b 阻挡我 a 是否划算（他们的视角）。 */
function theirBlockGain(view, a, b, prevented) {
  const r = duel(a, b);
  return prevented + (r.aDies ? val(a) * 0.85 : 0) - (r.bDies ? val(b) : 0);
}

/* ───────────────────────────── 灵体检视 ───────────────────────────── */

function chooseInspect(view, moves, pass) {
  const take = moves.find((m) => m.type === 'inspectTake');
  // 两种选择都把卡放进手牌；揭示只是「付 1 点同色灵能换一次 ST/CT 触发」，
  // 只有在余费充裕、触发确实有用时才付。
  const reveal = moves.find((m) => m.type === 'inspectReveal');
  if (!reveal) return take || pass;
  const card = view.inspect.card || {};
  const trig = String(card.trigger || '');
  const useful = trig.includes('CT') || trig.includes('MT') || trig.includes('ST');
  if (useful && availMana(view) >= 4) return reveal;
  return take || pass;
}

/* ───────────────────────────── 宣告攻击 ───────────────────────────── */

function chooseAttack(view, moves, pass) {
  const atks = moves.filter((m) => m.type === 'attack');
  if (!atks.length) return pass;
  const lifeWeight = (4.5 + Math.max(0, 12 - (view.opp.life || 0)) * 0.55)
    * (view.mode === 'blitz' ? 1.35 : view.mode === 'grand' ? 1 : 1.1);
  let best = null, bestScore = 0.8;
  for (const m of atks) {
    const a = byUid(view.me.field, m.uid);
    if (!a) continue;
    const cands = possibleBlockers(view, a);
    let score = 0;
    if (m.target === 'spirit') {
      score = attackFaceScore(view, a, cands, lifeWeight);
    } else {
      const t = byUid(view.opp.field, m.target);
      if (!t) continue;
      score = attackUnitScore(view, a, t, cands, lifeWeight);
    }
    if ((a.keywords || []).includes('守护')) score += 0.8; // 守护打完还能挡，代价更低
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || pass;
}

function attackFaceScore(view, a, cands, lifeWeight) {
  const imp = a.imp || 0;
  if (imp <= 0) return 0;
  const lethal = imp >= (view.opp.life || 0) ? 80 : 0;
  let bestGain = -1e9, bestB = null;
  for (const b of cands) {
    const g = theirBlockGain(view, a, b, imp * lifeWeight * 0.9);
    if (g > bestGain) { bestGain = g; bestB = b; }
  }
  if (bestB && bestGain > 0) {
    const r = duel(a, bestB);
    const chip = Math.min(r.aAtk, r.bHp) / 1000 * 0.8;
    return chip + (r.bDies ? val(bestB) * 0.85 : 0) - (r.aDies ? val(a) : 0) - 0.6;
  }
  return imp * lifeWeight + lethal;
}

function attackUnitScore(view, a, t, cands, lifeWeight) {
  const tHp = remainHp(t);
  const chip = Math.min(a.atk || 0, tHp);
  const prevented = chip / 1000 * 1.1 + ((a.atk || 0) >= tHp ? val(t) : 0);
  let bestGain = -1e9, bestB = null;
  for (const b of cands) {
    const g = theirBlockGain(view, a, b, prevented * 0.95);
    if (g > bestGain) { bestGain = g; bestB = b; }
  }
  if (bestB && bestGain > 0) {
    const r = duel(a, bestB);
    const spill = Math.min(r.aAtk, r.bHp) / 1000 * 0.5;
    return spill + (r.bDies ? val(bestB) * 0.85 : 0) - (r.aDies ? val(a) : 0) - 0.7;
  }
  // 打对方灵性：拆掉持续收益同样值钱
  const bonus = t.type === '灵性' ? 3 : 0;
  return prevented + bonus;
}

/* ───────────────────────────── 支援与阻挡 ───────────────────────────── */

function chooseSupport(view, moves, pass) {
  const sup = moves.find((m) => m.type === 'supportSpirit');
  if (!sup) return pass;
  const a = byUid(view.me.field, view.combat ? view.combat.attackerUid : null);
  if (!a) return pass;
  if (view.combat && view.combat.target === 'spirit') return sup;
  // 打单位时，只有 +1000 能换来击杀才值得
  const t = byUid(view.opp.field, view.combat ? view.combat.target : null);
  if (t && (a.atk || 0) + 1000 >= remainHp(t) && (a.atk || 0) < remainHp(t)) return sup;
  return pass;
}

function chooseBlocker(view, moves, pass) {
  const chosen = (view.combat && view.combat.blockers) || [];
  // 阻挡是切换式动作：已宣告的单位必须从候选里剔除，否则会宣告—取消死循环。
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const blocks = fresh.filter((m) => m.type === 'block');
  if (!blocks.length) return pass;
  const attacker = byUid(view.opp.field, view.combat ? view.combat.attackerUid : null);
  if (!attacker) return pass;
  const target = view.combat ? view.combat.target : null;
  const lifeWeight = 4.5 + Math.max(0, 12 - (view.me.life || 0)) * 0.9;

  let best = null, bestScore = 0;
  for (const m of blocks) {
    const b = byUid(view.me.field, m.uid);
    if (!b) continue;
    const r = duel(attacker, b);
    let score;
    if (!chosen.length) {
      let prevented = 0;
      if (target === 'spirit') prevented = (attacker.imp || 0) * lifeWeight;
      else {
        const tt = byUid(view.me.field, target);
        if (tt) prevented = Math.min(attacker.atk || 0, remainHp(tt)) / 1000 * 1.2 + ((attacker.atk || 0) >= remainHp(tt) ? val(tt) : 0);
      }
      score = prevented + (r.aDies ? val(attacker) * 0.9 : 0) - (r.bDies ? val(b) : 0) - 0.4;
    } else {
      // 第二个阻挡者只在「能补掉攻击者且自己不死」时才加
      score = (r.aDies ? 3 : 0) - (r.bDies ? val(b) : 0) - 1.2;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best) return best;
  return pass;
}

function chooseOrder(view, moves, pass) {
  const orders = moves.filter((m) => m.type === 'orderBlockers');
  if (!orders.length) return pass;
  const blockers = (view.combat && view.combat.blockers) || [];
  const hpOf = (uid) => {
    const c = byUid(view.me.field, uid);
    return c ? remainHp(c) : 0;
  };
  const want = [...blockers].sort((x, y) => hpOf(y) - hpOf(x));
  const key = want.join(',');
  for (const m of orders) if (m.order.join(',') === key) return m;
  return orders[0];
}

/* ───────────────────────────── 主要阶段 ───────────────────────────── */

const HAND_VALUE = {
  光能守护者: 8.5, 圣光战将: 12, 圣光祷告者: 9.5, 圣所守卫: 8.5, 晨祷侍从: 6,
  圣光聚合体: 3.5, 赎罪骑士: 8, 白塔裁决者: 8,
  圣光打击: 7, 净化仪式: 8, 回复灵光: 4, 治愈灵光: 4, 圣疗: 4.5, 圣所钟塔: 5,
  雷铸天兵: 8, 雷霆打击: 6.5, 力量共鸣: 5,
};

function handValue(c) {
  if (!c) return 0;
  let v = HAND_VALUE[c.name];
  if (v === undefined) v = 4;
  // 高费卡早期是死牌，做灵质的代价更低
  if (c.cost && c.cost.total >= 6) v -= 1.5;
  return v;
}

function chooseMain(view, moves, pass) {
  const myTurn = view.active === view.me.idx;
  const isMain = view.phase === 'main1' || view.phase === 'main2';
  const chained = (view.chain || []).length > 0;
  if (!myTurn || !isMain || chained) return pass;

  const avail = availMana(view);
  const plays = moves.filter((m) => m.type === 'play');
  const sets = moves.filter((m) => m.type === 'setEssence');
  const abilities = moves.filter((m) => m.type === 'ability');
  const specials = moves.filter((m) => m.type === 'spiritSpecial');
  const draw = moves.find((m) => m.type === 'spiritDraw');

  let bestPlay = null, bestScore = 0;
  for (const m of plays) {
    const s = scorePlay(view, m, avail);
    if (s > bestScore) { bestScore = s; bestPlay = m; }
  }

  // 1) 有明确高价值动作先做
  if (bestPlay && bestScore >= 7.5) return bestPlay;

  // 2) 灵体检视是白拿一张牌，先拿；牌库见底时改留灵体给治疗
  if (draw && (view.me.hand || []).length < 6 && (view.me.deck || 0) > 6) return draw;
  if (specials.length && needHeal(view) && (view.me.hand || []).length >= 5) return specials[0];

  // 3) 铺灵质：费用是全局最硬的限制，能铺就铺
  if (sets.length && rampWanted(view)) {
    const pick = pickEssenceCard(view);
    const m = pick ? sets.find((x) => x.uid === pick.uid) : sets[0];
    if (m) return m;
  }

  // 4) 其余动作
  if (bestPlay) return bestPlay;
  if (draw && (view.me.deck || 0) > 4) return draw;
  if (specials.length && needHeal(view)) return specials[0];

  // 5) 质密启动（把灵质换成生命），只在快死时才做
  if (abilities.length) {
    const life = view.me.life || 0;
    if (life <= 2) return abilities[0];
  }
  return pass;
}

function needHeal(view) {
  const units = myUnits(view);
  let need = false;
  for (const u of units) {
    if ((u.damage || 0) >= 2000 && val(u) >= 7) need = true;
  }
  return need;
}

function rampWanted(view) {
  const essence = (view.me.essence || []).length;
  const hand = (view.me.hand || []).length;
  if (essence >= 7) return false;
  if (hand <= 2) return false;
  // 费用是硬限制：前 6 点灵质优先铺满，之后按手牌厚度决定
  if (essence <= 5) return hand >= 3;
  const avail = availMana(view);
  for (const c of view.me.hand || []) {
    if (c.cost && c.cost.total === avail + 1 && handValue(c) >= 7) return true;
  }
  return hand >= 5;
}

function pickEssenceCard(view) {
  const hand = (view.me.hand || []).slice();
  if (!hand.length) return null;
  const yellow = (view.me.essence || []).filter((c) => c && c.color === '黄').length;
  const eCount = (view.me.essence || []).length;
  // 中局补 1—2 张黄色灵质以解锁黄牌；其余优先铺白色，保证 4—5 点白费能付。
  let prefer = '白';
  if (yellow < 1 && eCount >= 4) prefer = '黄';
  else if (yellow < 2 && eCount >= 6) prefer = '黄';
  let pool = prefer === '黄'
    ? hand.filter((c) => c.color === '黄' && handValue(c) <= 6.5)
    : hand.filter((c) => c.color === '白');
  if (!pool.length) pool = hand.filter((c) => handValue(c) < 7.5);
  if (!pool.length) pool = hand;
  pool.sort((a, b) => handValue(a) - handValue(b));
  return pool[0];
}

function scorePlay(view, m, avail) {
  const c = byUid(view.me.hand, m.uid);
  if (!c) return 0;
  const name = c.name;
  const t0 = (m.targets || [])[0];
  const mine = byUid(view.me.field, t0);
  const foe = byUid(view.opp.field, t0);
  const units = myUnits(view).length;
  const cost = c.cost ? c.cost.total : 1;
  let s = 0;

  switch (name) {
    // ── 黄：把墙永久抬成冲击 2 ──
    case '雷铸天兵': {
      if (!mine) return 0;
      s = 4.5 + ((mine.imp || 0) < 2 ? 5 : 0) + ((mine.keywords || []).includes('守护') ? 1.5 : 0)
        + (remainHp(mine) >= 4000 ? 1 : 0) + (mine.atk || 0) / 4000;
      break;
    }
    case '力量共鸣': {
      s = 2 + 1.15 * units;
      break;
    }
    case '雷霆打击': {
      if (!foe) return 0;
      const rem = remainHp(foe);
      s = 2000 >= rem ? val(foe) * 1.25 : Math.min(2000, rem) / 1000 * 0.75;
      break;
    }
    // ── 白 ──
    case '圣光打击': {
      if (!foe) return 0;
      const rem = remainHp(foe);
      s = 5000 >= rem ? val(foe) * 1.4 : Math.min(5000, rem) / 1000 * 0.85;
      break;
    }
    case '净化仪式': {
      const ts = (m.targets || []).map((u) => byUid(view.opp.field, u)).filter(Boolean);
      if (!ts.length) return 0;
      for (const t of ts) s += val(t) * 1.25;
      break;
    }
    case '回复灵光': {
      if (!mine || !(mine.damage > 0)) return 0;
      s = Math.min(3000, mine.damage) / 1000 * 0.9;
      break;
    }
    case '圣疗': {
      if (!mine || !(mine.damage > 0)) return 0;
      s = Math.min(5000, mine.damage) / 1000 * 0.8;
      break;
    }
    case '治愈灵光': {
      s = 3 + ((view.me.life || 0) <= 8 ? 2.5 : 0);
      break;
    }
    case '圣所钟塔': {
      s = 2.2 + 0.55 * units + (view.me.life <= 8 ? 1.5 : 0);
      break;
    }
    case '圣光聚合体': {
      s = val(c) + 0.5;
      break;
    }
    default: {
      // 其余灵像
      if (c.type !== '灵像') { s = 1.5; break; }
      s = val(c) * 0.95;
      if ((c.keywords || []).includes('守护')) s += 1.2;
      if (name === '圣光战将' && oppUnits(view).length >= 2) s += 4;   // 序曲拆 2 张
      if (name === '白塔裁决者') {
        const tapped = oppUnits(view).filter((u) => u.tapped).length;
        s += tapped ? 3 : -1.5;
      }
      if (units >= 4) s -= 2.5;   // 场上已满，别再无脑铺
      if (cost >= 5) s += 1;
      break;
    }
  }

  // 尽量把当期费用花干净
  if (s > 0) s += Math.min(cost, 4) * 0.35;
  return s;
}

/* ───────────────────────────── 入口 ───────────────────────────── */

export function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || !moves.length) return { type: 'pass' };
    const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
    if (!view) return pass;
    if (view.inspect) return chooseInspect(view, moves, pass);
    const stage = view.combat ? view.combat.stage : null;
    if (stage === 'blockers') return chooseBlocker(view, moves, pass);
    if (stage === 'order') return chooseOrder(view, moves, pass);
    if (stage === 'attackers') return chooseAttack(view, moves, pass);
    if (stage === 'support') return chooseSupport(view, moves, pass);
    return chooseMain(view, moves, pass);
  } catch (err) {
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
}
