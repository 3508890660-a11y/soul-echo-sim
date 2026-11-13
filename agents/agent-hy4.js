// 策略名称：根脉过载
// 选择理由：SE01 的胜负不取决于单卡强度，而取决于「每回合能打出几点生命伤害」；而所有展开
//   都被「每回合只能设 1 张灵质」锁死。绿色是唯一能在该配额之外继续堆灵质的颜色（自然生长、
//   幼苗守望者、根脉育苗者灵体），红色是唯一同时具备 1—3 费敏捷/预制打手与直伤的颜色。
//   两者叠加：先用超额灵能铺出场面，再靠 +冲击 的永久强化在一个战斗阶段里让多个单位连续
//   打脸，把对方生命卡组逐点翻空。相比堆 6—8 费战将，这条曲线不怕起手调度、也不怕快攻。
// 主责模式：standard

export const meta = {
  id: 'hy4',
  model: 'hy4',
  modelId: 'hy4std',
  name: '根脉过载',
  desc: '用绿色置灵质突破每回合 1 张灵质的费用天花板，红色低费敏捷打手配 +冲击 连续打脸，直伤收尾。',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  '火焰鸟': 4,
  '地狱犬': 4,
  '烈焰斗士': 4,
  '灰烬小僧': 2,
  '爆燃': 3,
  '血怒': 3,
  '火球术': 3,
  '力量灌注': 4,
  '自然生长': 4,
  '全面成长': 3,
  '幼苗守望者': 2,
  '新人冒险者': 2,
  '流浪佣兵': 2,
  '荒原狼': 2,
  '巨石守卫': 4,
  '混沌冲击': 4,
  '山岭巨人': 2,
};

export const spirit = '根脉育苗者';
export const color = '红';

// ── 只读常量表（模块级不可变，不累积任何跨回合状态）──────────────────
const DIRECT_DMG = { '火球术': 2, '混沌冲击': 1, '焚尽': 3, '燃魂': 2 };
const RAMP = { '自然生长': 1, '丰收': 2, '根须入梦': 1, '梦藤巨像': 1 };
const IMP_BUFF = { '全面成长': 1, '血怒': 1, '烈焰之力': 1, '雷铸天兵': 1 };
const ATK_BUFF = { '力量灌注': 1500, '生命灌注': 0, '临阵磨枪': 1000 };
const REMOVAL = { '爆燃': 1, '混沌打击': 1, '雷霆打击': 1, '奥术飞弹': 1, '圣光打击': 1 };
const DRAW = { '冒险准备': 1, '智慧之光': 1, '灵质榨取': 1 };

function isUnit(c) { return !!c && c.type === '灵像'; }
function hasKw(c, k) { return !!c && (c.keywords || []).indexOf(k) >= 0; }
function findCard(list, uid) {
  if (!list) return null;
  for (const c of list) if (c && c.uid === uid) return c;
  return null;
}
function liveHp(c) {
  if (!c) return 0;
  return Math.max(0, (c.hp || 0) - (c.damage || 0));
}
// 打空对方生命卡组所需的伤害：翻空 N 张后还需再 1 点；护甲各抵 1 点。
function needDamage(view) {
  const opp = view.opp || {};
  const life = typeof opp.life === 'number' ? opp.life : 10;
  return life + 1 + (opp.armor || []).length;
}

// 一张手牌「此刻打出」的价值。只读取公开信息，不修改任何入参。
function cardValue(card, view) {
  const name = card.name;
  const type = card.type;
  const cost = card.cost ? card.cost.total : 0;
  const me = view.me || {};
  const opp = view.opp || {};
  const oppLife = typeof opp.life === 'number' ? opp.life : 10;
  const need = needDamage(view);
  const myField = me.field || [];
  const oppField = opp.field || [];
  const myUnits = myField.filter(isUnit).length;
  const essence = (me.essence || []).length;

  // 直伤：直接推进胜利，斩杀时压过一切。
  const dmg = DIRECT_DMG[name];
  if (dmg) {
    let s = 40 + dmg * 10;
    if (dmg >= need) s += 400;
    else if (dmg >= need - 2) s += 55;
    return s;
  }

  // 灵像：冲击 > 攻击 > 身材，预制/敏捷/超冲击/威慑显著加分，费用扣分。
  if (type === '灵像') {
    let s = 18 + (card.impact || 0) * 24
      + (card.attack || 0) / 250 + (card.vitality || 0) / 600 - cost * 3;
    if (hasKw(card, '预制')) s += 12;
    if (hasKw(card, '敏捷')) s += 14;
    if (hasKw(card, '先攻')) s += 8;
    if (hasKw(card, '超冲击')) s += 10;
    if (hasKw(card, '威慑')) s += 6;
    if (hasKw(card, '守护')) s += 4;
    if (hasKw(card, '自愈')) s += 4;
    if (name === '幼苗守望者') s += 10;
    if (myUnits === 0) s += 12;
    if (oppLife <= 4) s += (card.impact || 0) * 8;
    return s;
  }

  // 灵感：ramp / +冲击 / +攻击 / 解场 / 抽牌。
  if (type === '灵感') {
    if (RAMP[name]) {
      let s = 34 + RAMP[name] * 10;
      if (essence < 4) s += 18;
      if (view.turn <= 3) s += 8;
      return s;
    }
    if (IMP_BUFF[name]) {
      if (!myUnits) return 2;
      let s = 40 + IMP_BUFF[name] * 12;
      if (name === '全面成长') s += 10;
      if (oppLife <= 5) s += 18;
      return s;
    }
    if (ATK_BUFF[name] !== undefined) {
      if (!myUnits) return 2;
      return 22 + ATK_BUFF[name] / 220;
    }
    if (REMOVAL[name]) {
      const targets = oppField.filter(isUnit);
      if (!targets.length) return 2;
      let maxAtk = 0;
      for (const t of targets) if ((t.atk || 0) > maxAtk) maxAtk = t.atk || 0;
      let s = 20 + targets.length * 4 + maxAtk / 500;
      if (name === '爆燃' && targets.some((t) => (t.damage || 0) > 0)) s += 12;
      return s;
    }
    if (DRAW[name]) {
      const handN = (me.hand || []).length;
      return handN <= 3 ? 44 : 16;
    }
    return 18;
  }

  if (type === '灵性') return 24;
  return 14;
}

function scorePlay(m, view) {
  const c = findCard(view.me && view.me.hand, m.uid);
  return c ? cardValue(c, view) : 1;
}

// 设灵质：把「此刻打出价值最低」的手牌变成永久费用，并补足红/绿中较少的一色。
function scoreSetEssence(m, view) {
  const c = findCard(view.me && view.me.hand, m.uid);
  const pv = c ? cardValue(c, view) : 30;
  let s = 82 - pv * 0.32;
  const ess = (view.me && view.me.essence) || [];
  const col = c ? c.color : '灰';
  if (col === '红' || col === '绿') {
    let same = 0, other = 0;
    for (const e of ess) {
      if (e.color === col) same++;
      else if (e.color !== '灰') other++;
    }
    if (same <= other) s += 12;
  } else {
    s -= 4;
  }
  if (c && c.cost && c.cost.total >= 5) s -= 20;
  return s;
}

function scoreMain(view, moves, fallback) {
  let best = fallback, bestScore = 0;
  for (const m of moves) {
    let s;
    if (m.type === 'play') s = scorePlay(m, view);
    else if (m.type === 'setEssence') s = scoreSetEssence(m, view);
    else if (m.type === 'spiritSpecial') s = 92;
    else if (m.type === 'spiritDraw') s = 38;
    else if (m.type === 'ability') s = -1;
    else if (m.type === 'tapEssence') s = -5;
    else if (m.type === 'pass') s = 0;
    else s = -2;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// 响应窗口：这套牌没有瞬时需求，一律让过；仅当直伤能当场斩杀才丢出去。
function scoreResponse(view, moves, fallback) {
  const need = needDamage(view);
  let best = fallback, bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const c = findCard(view.me && view.me.hand, m.uid);
    if (!c) continue;
    const dmg = DIRECT_DMG[c.name] || 0;
    if (dmg >= need) {
      const s = 500 + dmg;
      if (s > bestScore) { bestScore = s; best = m; }
    }
  }
  return best;
}

function scoreInspect(view, moves, fallback) {
  if (view.inspect && view.inspect.hidden) return fallback;
  for (const m of moves) if (m.type === 'inspectTake') return m;   // 免费加入手牌
  for (const m of moves) if (m.type === 'inspectReveal') return m; // 需付 1 点同色灵能
  return fallback;
}

function scoreSupport(view, moves, fallback) {
  for (const m of moves) if (m.type === 'supportSpirit') return m; // +1 冲击必用
  return fallback;
}

// 攻击方排列阻挡顺序：让高攻阻挡者排前面、先吃到致命伤害。
function scoreOrder(view, moves, fallback) {
  const oppField = (view.opp && view.opp.field) || [];
  const atkOf = (uid) => {
    const c = findCard(oppField, uid);
    return c ? (c.atk || 0) : 0;
  };
  let best = fallback, bestScore = -1;
  for (const m of moves) {
    if (m.type !== 'orderBlockers') continue;
    const order = m.order || [];
    let s = 0;
    for (let i = 0; i < order.length; i++) s += atkOf(order[i]) / (i + 1) / 300;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// 防守：只在能反杀攻击者、或能挡下打脸时才阻挡；已在阻挡列表的单位不再点（会取消）。
function scoreBlockers(view, moves, fallback) {
  const cb = view.combat || {};
  const oppField = (view.opp && view.opp.field) || [];
  const myField = (view.me && view.me.field) || [];
  const attacker = findCard(oppField, cb.attackerUid);
  const aAtk = attacker ? (attacker.atk || 0) : 0;
  const aImp = attacker ? (attacker.imp || 0) : 0;
  const aHp = liveHp(attacker);
  const face = cb.target === 'spirit';
  const declared = cb.blockers || [];
  let best = fallback;
  let bestScore = face ? (15 - aImp * 10) : 30;
  for (const m of moves) {
    if (m.type !== 'block') continue;
    if (declared.indexOf(m.uid) >= 0) continue;
    const b = findCard(myField, m.uid);
    if (!b) continue;
    const bAtk = b.atk || 0;
    const bHp = liveHp(b);
    let s = 20;
    if (bAtk >= aHp && aHp > 0) s += 55;
    if (aAtk >= bHp && bHp > 0) s -= 25;
    else s += 15;
    if (face) s += 20 + aImp * 8;
    if (hasKw(b, '守护')) s += 5;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// 攻击：默认打脸；只有能无伤击杀对方单位、清出缺口时才改为攻击单位。
function scoreAttackers(view, moves, fallback) {
  const oppField = (view.opp && view.opp.field) || [];
  const myField = (view.me && view.me.field) || [];
  const need = needDamage(view);
  const blockers = oppField.filter((c) => isUnit(c) && (!c.tapped || hasKw(c, '守护'))).length;
  let best = fallback, bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const u = findCard(myField, m.uid);
    if (!u) continue;
    const imp = u.imp || 0;
    const uAtk = u.atk || 0;
    const uHp = liveHp(u);
    let s;
    if (m.target === 'spirit') {
      s = 46 + imp * 26;
      if (hasKw(u, '敏捷')) s += 22;
      if (hasKw(u, '超冲击')) s += 16;
      if (hasKw(u, '威慑')) s += 4;
      s -= Math.min(blockers, 4) * 5;
      if (imp >= need) s += 350;
    } else {
      const t = findCard(oppField, m.target);
      if (!t) continue;
      const tHp = liveHp(t);
      const tAtk = t.atk || 0;
      s = 8;
      if (uAtk >= tHp && tHp > 0) s += 40;
      if (tAtk >= uHp && uHp > 0) s -= 22;
      else s += 14;
      if (hasKw(u, '先攻')) s += 12;
      s += (t.imp || 0) * 6;
      if (blockers <= 1) s += 12;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function decide(view, moves) {
  const fallback = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  if (view.inspect) return scoreInspect(view, moves, fallback);
  const cb = view.combat;
  if (cb) {
    if (cb.stage === 'blockers') return scoreBlockers(view, moves, fallback);
    if (cb.stage === 'order') return scoreOrder(view, moves, fallback);
    if (cb.stage === 'attackers') return scoreAttackers(view, moves, fallback);
    if (cb.stage === 'support') return scoreSupport(view, moves, fallback);
    return fallback; // combat_start / response / damage 只需让过
  }
  if (view.phase === 'start' || view.phase === 'setup' || view.phase === 'end') return fallback;
  const responding = (view.chain && view.chain.length > 0) || view.active !== (view.me && view.me.idx);
  if (responding) return scoreResponse(view, moves, fallback);
  return scoreMain(view, moves, fallback);
}

export function choose(view, moves) {
  let chosen = null;
  try {
    chosen = decide(view, moves);
  } catch (e) {
    chosen = null;
  }
  if (chosen && moves.indexOf(chosen) >= 0) return chosen;
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
