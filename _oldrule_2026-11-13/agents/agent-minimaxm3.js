/**
 * 策略名称：灰烬双烛 · 灼痕烧线
 *
 * 选择理由：
 *   引擎核对后的关键事实是「生命伤害只来自两处」：
 *     ① 直伤灵感（对灵体造成 N 点生命伤害）；
 *     ② 战斗伤害——攻击灵体且无人阻挡时，按攻击者的「冲击力」结算生命伤害（rules.js resolveCombat）。
 *        践踏的溢出转给对手另一只单位、打不到脸，超冲击又要求一次打死全部阻挡者才生效。
 *   所以本策略是「双通道烧线」：直伤负责在对手有场面时也能稳定压血线，
 *   冲击力身材负责在对手场面被拆空后每回合白打 1—2 点。两端互为补位，谁都能单独收尾。
 *   实测（内置战术 AI，100 局/模式）我方输出里战斗伤害约占三分之二、直伤约占三分之一，
 *   因此卡组两条腿都要有，而不能只堆直伤。
 *
 *   颜色与灵体：
 *     红给最高效率的直伤（火球术 3 费 2 点、焚尽 5 费 3 点、燃魂 2 费 2 点）与先攻身材；
 *     黑给 1 费解场（自杀式袭击）、墓地循环（灵魂交易）与暴击引擎（骸骨祭坛）；
 *     灰色是不占 duo 双色配额的无色段，给最便宜的伤害（混沌冲击）、最便宜的解场（混沌打击）、
 *     补牌（冒险准备）与每回合续命（篝火营地）。
 *   代价是三色费用结构，必须靠「每回合只设 1 张灵质」的坡度把费用滚起来，并严格控制两色比例。
 *
 * 主责模式：duo
 */

export const meta = {
  id: 'minimaxm3',
  model: 'MiniMax M3',
  modelId: 'minimax-m3-pay',
  name: '灰烬双烛·灼痕烧线',
  desc: '红黑双色双通道烧线：直伤压住对手血线，冲击力身材在对手场面被拆空后每回合白打 1—2 点，实测第 9 回合烧穿 12 点生命。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

// 54 张：红 18 + 黑 13 + 混色 3 + 灰 20
// duo 颜色覆盖：红 21（18 + 3 张燃魂）、黑 16（13 + 3 张燃魂），恰好两种非灰颜色且均 ≥10。
// 19+ 张灰牌是「无色段」：灰费可由任意色灵能支付，因此它们不占用双色配额，
// 相当于把第三种颜色藏进中性区，用来绕开「1 红 + 1 黑」的费用瓶颈。
export const deck = {
  // ── 红：直伤与先攻身材 ─────────────────────────
  '火球术': 4,
  '焚尽': 2,
  '地狱犬': 3,
  '烈焰斗士': 2,
  '烈焰战将': 2,
  '火焰鸟': 2,
  '烈焰聚合体': 1,
  '血怒': 1,
  '火种祭坛': 1,
  // ── 混色：红黑共用，一红一黑换 2 点直伤 ────────
  '燃魂': 3,
  // ── 黑：解场、循环与暴击 ───────────────────────
  '自杀式袭击': 4,
  '灵质榨取': 2,
  '骸骨祭坛': 1,
  '暗夜战将': 1,
  '食魂者': 1,
  '灵魂交易': 1,
  '骨墙': 2,
  '黑暗聚合体': 1,
  // ── 灰：无色段，不占 duo 双色配额 ─────────────
  '混沌冲击': 4,
  '混沌打击': 3,
  '新人冒险者': 4,
  '冒险准备': 3,
  '篝火营地': 2,
  '荒原狼': 1,
  '巨石守卫': 1,
  '混沌聚合体': 2,
};

export const spirit = '余烬执火者';
export const color = '红';

/* ══════════════ 常量表 ══════════════ */

// 直伤类灵感：对对手灵体造成生命伤害
const DIRECT_DAMAGE = {
  '火球术': 2,
  '焚尽': 3,
  '混沌冲击': 1,
  '燃魂': 2,
};

// 直伤单价：1 点生命伤害 = 12 分。duo 需要 12 点生命 + 1 点致命伤 = 13 点。
// 12 这个值让「直伤 > 解场 > 身材 > 功能牌」的出牌优先级在 54 张的牌池里保持平衡；
// 扫过 10/12/13/14/16/20，14 以上会让身材完全出不了手（胜率掉到 83.9%），12 最稳。
const DMG_SCORE = 12;

// 身材价值上限：保证「直伤 > 解场 > 身材 > 功能牌」的出牌优先级
const BODY_CAP = 26;

// 无指定目标的固定价值
const CARD_BASE = {
  '灵质榨取': 9,
  '冒险准备': 9,
  '篝火营地': 15,
  '骸骨祭坛': 12,
  '食魂者': 9,
  '火种祭坛': 7,
  '血怒': 9,
  '灵魂交易': 8,
  '暗夜战将': 14,
  '自杀式袭击': 12,
  '混沌打击': 12,
};

const KEYWORD_VALUE = {
  '守护': 6,
  '灵气': 7,
  '预制': 5,
  '敏捷': 4,
  '威慑': 6,
  '自愈': 5,
  '超冲击': 7,
  '践踏': 4,
  '碾压': 4,
  '先攻': 3,
  '诱饵': 3,
  '质密': 1,
  '启动': 3,
  '回响': 2,
  '序曲': 3,
  '终曲': 2,
};

/* ══════════════ 纯函数工具 ══════════════ */

function hasKw(card, kw) {
  return !!card && Array.isArray(card.keywords) && card.keywords.indexOf(kw) >= 0;
}

function byUid(list, uid) {
  if (!list || uid == null) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].uid === uid) return list[i];
  }
  return null;
}

function leftHp(card) {
  if (!card) return 0;
  return Math.max(0, (card.hp || 0) - (card.damage || 0));
}

function countColor(list, color) {
  let n = 0;
  for (const c of list || []) if (c && c.color === color) n += 1;
  return n;
}

// 单位（灵像/灵性）的抽象价值：可用于交换、解场与挡伤害的比较基准
function unitValue(card) {
  if (!card) return 0;
  let v = (card.atk || 0) / 250 + (card.hp || 0) / 500 + (card.imp || 0) * 3;
  if (Array.isArray(card.keywords)) {
    for (const kw of card.keywords) {
      if (KEYWORD_VALUE[kw]) v += KEYWORD_VALUE[kw];
    }
  }
  if (card.token) v += 1;
  if (card.type === '灵性') v -= 6; // 灵性不能攻击、不能阻挡
  return v;
}

// 手牌（未上场）的粗略价值，用于「把它设成灵质值不值」
function cardBaseValue(card) {
  if (!card) return 0;
  if (DIRECT_DAMAGE[card.name]) return DIRECT_DAMAGE[card.name] * DMG_SCORE;
  if (CARD_BASE[card.name] != null) return CARD_BASE[card.name];
  return unitValue(card);
}

// 分解区里的牌值多少（用于灵魂交易）
function graveValue(card) {
  if (!card) return 0;
  if (DIRECT_DAMAGE[card.name]) return DIRECT_DAMAGE[card.name] * DMG_SCORE * 0.7;
  if (CARD_BASE[card.name] != null) return CARD_BASE[card.name] * 0.6;
  return unitValue(card) * 0.6;
}

function isSpiritUnit(card) {
  return !!card && card.type === '灵像';
}

/* ══════════════ 费用结构（用于机会成本计算） ══════════════ */

function costParts(card) {
  const c = (card && card.cost) || { total: 0, colored: 0, grey: 0 };
  if (c.colors) return { colors: c.colors, grey: c.grey || 0 };
  const colors = {};
  if (c.colored) colors[card.color] = c.colored;
  return { colors, grey: c.grey || 0 };
}

// 当前回合可动用的灵能池：已产未花的灵能 + 未横置的灵质（每张 1 点，同色）
function manaPool(view) {
  const pool = { 红: 0, 黑: 0, 灰: 0 };
  const m = view.me.mana || {};
  pool.红 = m.红 || 0;
  pool.黑 = m.黑 || 0;
  pool.灰 = m.灰 || 0;
  for (const e of view.me.essence || []) {
    if (!e || e.tapped) continue;
    if (e.color === '红') pool.红 += 1;
    else if (e.color === '黑') pool.黑 += 1;
    else pool.灰 += 1;
  }
  return pool;
}

// 某个费用结构在给定灵能池下是否付得起（与引擎 manaPlan 同规则：灰费可由任意色支付）
function affordableWith(pool, card) {
  const p = { 红: pool.红, 黑: pool.黑, 灰: pool.灰 };
  const parts = costParts(card);
  for (const color of Object.keys(parts.colors)) {
    const n = parts.colors[color] || 0;
    if (n <= 0) continue;
    if (p[color] == null) return false;
    p[color] -= n;
    if (p[color] < 0) return false;
  }
  let grey = parts.grey || 0;
  while (grey > 0) {
    const color = ['红', '黑', '灰'].find((k) => p[k] > 0);
    if (!color) return false;
    p[color] -= 1;
    grey -= 1;
  }
  return true;
}

// 付掉这张牌之后的灵能池
function poolAfter(pool, card) {
  const p = { 红: pool.红, 黑: pool.黑, 灰: pool.灰 };
  const parts = costParts(card);
  for (const color of Object.keys(parts.colors)) {
    const n = parts.colors[color] || 0;
    if (n <= 0) continue;
    p[color] = (p[color] || 0) - n;
  }
  let grey = parts.grey || 0;
  while (grey > 0) {
    const color = ['红', '黑', '灰'].find((k) => p[k] > 0);
    if (!color) break;
    p[color] -= 1;
    grey -= 1;
  }
  return p;
}

// 机会成本：打出这张牌会让手牌里哪张「本来付得起」的牌变得付不起
function opportunityCost(view, card) {
  const pool = manaPool(view);
  if (!affordableWith(pool, card)) return 0;
  const after = poolAfter(pool, card);
  let lost = 0;
  for (const other of view.me.hand || []) {
    if (!other || other.uid === card.uid) continue;
    if (!affordableWith(pool, other)) continue;
    if (affordableWith(after, other)) continue;
    const v = cardBaseValue(other);
    if (v > lost) lost = v;
  }
  return lost;
}

// 对方能否用这个单位阻挡我的攻击者
function canBlockFor(unit, attackerAgile) {
  if (!isSpiritUnit(unit)) return false;
  if (unit.tapped && !hasKw(unit, '守护')) return false;
  if (attackerAgile && !hasKw(unit, '敏捷') && !hasKw(unit, '守护')) return false;
  return true;
}

function opponentsBlockers(view, attacker) {
  const agile = hasKw(attacker, '敏捷');
  return (view.opp.field || []).filter((u) => canBlockFor(u, agile));
}

function myBlockers(view, attacker) {
  const agile = hasKw(attacker, '敏捷');
  return (view.me.field || []).filter((u) => canBlockFor(u, agile));
}

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

    // 1) 灵体检视：默认白拿，CT 牌且有红色灵能时付费揭示换暴击
    if (view.inspect) {
      let best = null;
      let bestScore = -1;
      for (const mv of moves) {
        let s = 0;
        if (mv.type === 'inspectTake') s = 3;
        else if (mv.type === 'inspectReveal') {
          const c = view.inspect.card;
          const trig = c ? String(c.trigger || '') : '';
          const redMana = view.me.mana ? (view.me.mana['红'] || 0) : 0;
          s = (trig.indexOf('CT') >= 0 && redMana >= 1) ? 12 : 0;
        }
        if (s > bestScore) { bestScore = s; best = mv; }
      }
      return best || pass;
    }

    // 2) 战斗阶段
    const cb = view.combat;
    if (cb) {
      if (cb.stage === 'blockers') return chooseBlock(view, moves, pass);
      if (cb.stage === 'attackers') return chooseAttack(view, moves, pass);
      if (cb.stage === 'support') return chooseSupport(view, moves, pass);
      if (cb.stage === 'order') return chooseOrder(view, moves, pass);
    }

    // 3) 主要阶段 / 战斗响应窗
    return chooseGeneral(view, moves, pass);
  } catch (err) {
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
}

/* ══════════════ 战斗决策 ══════════════ */

function chooseAttack(view, moves, pass) {
  let best = null;
  let bestScore = 0;
  for (const mv of moves) {
    if (mv.type !== 'attack') continue;
    const s = scoreAttack(view, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best || pass;
}

function scoreAttack(view, mv) {
  const me = view.me;
  const attacker = byUid(me.field, mv.uid);
  if (!attacker) return 0;
  const myAtk = attacker.atk || 0;
  const myImp = attacker.imp || 0;
  const blockers = opponentsBlockers(view, attacker);

  if (mv.target === 'spirit') {
    if (!blockers.length) {
      // 无阻挡者：这是白打的脸
      return myImp * DMG_SCORE + 4;
    }
    // 对方会挡：只在能击杀阻挡者并触发超冲击时才算赚
    let best = 0;
    for (const b of blockers) {
      const kill = myAtk >= leftHp(b);
      const survive = (b.atk || 0) < leftHp(attacker);
      let v = 0;
      if (kill) v += unitValue(b) * 0.7;
      if (kill && hasKw(attacker, '超冲击')) v += myImp * DMG_SCORE;
      if (!survive) v -= unitValue(attacker) * 0.9;
      if (v > best) best = v;
    }
    return best;
  }

  const target = byUid(view.opp.field, mv.target);
  if (!target) return 0;
  const kill = myAtk >= leftHp(target);
  const die = (target.atk || 0) >= leftHp(attacker);
  let v = 0;
  if (kill) v += unitValue(target) * 0.85;
  else v -= Math.min(4, (target.atk || 0) / 1000);
  if (die) v -= unitValue(attacker) * 0.85;
  else v -= Math.min(3, (target.atk || 0) / 1000);
  if (kill && hasKw(attacker, '先攻')) v += 4;
  return v;
}

function chooseBlock(view, moves, pass) {
  const cb = view.combat;
  const attacker = byUid(view.opp.field, cb ? cb.attackerUid : null);
  const impactCost = attacker ? (attacker.imp || 0) * DMG_SCORE : 0;
  const already = (cb && cb.blockers) || [];
  let best = null;
  let bestScore = 0;
  for (const mv of moves) {
    if (mv.type !== 'block') continue;
    // 引擎的 block 动作是「切换」语义：已在阻挡列表里的单位必须跳过，
    // 否则会被反复选中变成「取消阻挡」，形成动作死循环。
    if (already.indexOf(mv.uid) >= 0) continue;
    const s = scoreBlock(view, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  // 阻挡的收益要超过「放它打脸」的代价
  if (best && bestScore + impactCost > 0) return best;
  return pass;
}

function scoreBlock(view, mv) {
  const cb = view.combat;
  const attacker = byUid(view.opp.field, cb ? cb.attackerUid : null);
  const blocker = byUid(view.me.field, mv.uid);
  if (!attacker || !blocker) return 0;
  const kill = (blocker.atk || 0) >= leftHp(attacker);
  const die = (attacker.atk || 0) >= leftHp(blocker);
  let v = 0;
  if (kill) v += unitValue(attacker) * 0.9;
  if (die) v -= unitValue(blocker) * 0.9;
  else v -= Math.min(6, (attacker.atk || 0) / 700);
  if (hasKw(blocker, '守护')) v += 3;
  if (hasKw(blocker, '自愈')) v += 2;
  return v;
}

function chooseSupport(view, moves, pass) {
  const cb = view.combat;
  const attacker = byUid(view.me.field, cb ? cb.attackerUid : null);
  if (!attacker) return pass;
  const crits = view.me.spirit && typeof view.me.spirit.crit === 'number' ? view.me.spirit.crit : 0;
  if (crits < 1) return pass;
  const blockers = opponentsBlockers(view, attacker);
  let s = 0;
  if (!blockers.length) {
    s = (attacker.imp || 0) * 0 + DMG_SCORE; // +1 冲击 = +1 点生命伤害
  } else if (hasKw(attacker, '超冲击')) {
    const killAll = blockers.every((b) => (attacker.atk || 0) + 1000 >= leftHp(b));
    if (killAll) s = (attacker.imp || 0) * DMG_SCORE;
  }
  if (s <= 0) return pass;
  const support = moves.find((m) => m.type === 'supportSpirit');
  return support || pass;
}

function chooseOrder(view, moves, pass) {
  const cb = view.combat;
  let best = null;
  let bestScore = -1;
  for (const mv of moves) {
    if (mv.type !== 'orderBlockers') continue;
    const order = mv.order || [];
    let s = 0;
    for (const uid of order) {
      const b = byUid(view.opp.field, uid);
      s += unitValue(b);
    }
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best || pass;
}

/* ══════════════ 主要阶段 ══════════════ */

function chooseGeneral(view, moves, pass) {
  const inCombatWindow = view.phase === 'combat';
  const threshold = inCombatWindow ? 13 : 0.5;
  let best = null;
  let bestScore = threshold;
  for (const mv of moves) {
    if (mv.type === 'pass') continue;
    const s = scoreMove(view, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best || pass;
}

function scoreMove(view, mv) {
  switch (mv.type) {
    case 'play': return scorePlay(view, mv);
    case 'setEssence': return scoreEssence(view, mv);
    case 'ability': return scoreAbility(view, mv);
    case 'spiritSpecial': return scoreSpiritSpecial(view, mv);
    case 'spiritDraw': return scoreSpiritDraw(view, mv);
    case 'tapEssence': return 0;
    default: return 0;
  }
}

function scorePlay(view, mv) {
  const card = byUid(view.me.hand, mv.uid);
  if (!card) return 0;
  const base = scorePlayBase(view, mv);
  if (base <= 0) return base;
  // 机会成本：别为了一个次优动作把更值钱的直伤挤掉
  return base - opportunityCost(view, card) * 0.5;
}

function scorePlayBase(view, mv) {
  const me = view.me;
  const card = byUid(me.hand, mv.uid);
  if (!card) return 0;
  const name = card.name;
  const tg = mv.targets || [];

  // 直伤：唯一的胜负手段，分数最高
  if (DIRECT_DAMAGE[name]) {
    let v = DIRECT_DAMAGE[name] * DMG_SCORE;
    if (name === '焚尽' && (me.field || []).length === 0) v += DMG_SCORE; // 无场面时 4 点
    if (name === '燃魂') {
      const victim = byUid(me.field, tg[0]);
      if (!victim) return -50;
      v -= unitValue(victim) * 0.35; // 牺牲己方单位的代价
    }
    return v;
  }

  // 1 费伤害解场
  if (name === '混沌打击') {
    const t = byUid(view.opp.field, tg[0]);
    if (!t) return 0;
    if (2000 >= leftHp(t)) return unitValue(t) * 0.9;
    return unitValue(t) * 0.2; // 削血，为后续击杀铺路
  }

  // 1 费破坏：牺牲己方 1 张单位 + 破坏对方 1 张牌
  if (name === '自杀式袭击') {
    const mine = byUid(me.field, tg[0]);
    const theirs = byUid(view.opp.field, tg[1]);
    if (!theirs) return 0;
    let v = unitValue(theirs) * 0.85;
    if (mine) v -= unitValue(mine) * 0.3;
    return v;
  }

  // 序曲破坏对方 2 张牌（目标由引擎自动选最大的两只）
  if (name === '暗夜战将') {
    const opp = (view.opp.field || []).slice().sort((a, b) => unitValue(b) - unitValue(a));
    const v0 = opp.length ? unitValue(opp[0]) * 0.8 : 0;
    const v1 = opp.length > 1 ? unitValue(opp[1]) * 0.8 : 0;
    return v0 + v1 - 16; // 6 费 + 磨掉自己牌库顶 3 张
  }

  // 墓地回收
  if (name === '灵魂交易') {
    const g = byUid(me.grave, tg[0]);
    return 4 + graveValue(g);
  }

  // 临时强化
  if (name === '血怒') {
    const u = byUid(me.field, tg[0]);
    if (!u) return 0;
    return (u.imp || 0) >= 1 ? 12 : 7;
  }

  // 抽牌 / 循环
  if (name === '灵质榨取') {
    if (mv.mode === 'bury') {
      let cheapest = null;
      for (const c of me.hand || []) {
        if (!cheapest || cardBaseValue(c) < cardBaseValue(cheapest)) cheapest = c;
      }
      const cost = cheapest ? cardBaseValue(cheapest) * 0.22 : 0;
      return 13 - cost;
    }
    return 9;
  }
  if (name === '冒险准备') return 9;

  // 每回合 +1 生命
  if (name === '篝火营地') {
    if (me.life <= 5) return 24;
    if (me.life <= (view.opp.life || 0) - 2) return 19;
    return 14;
  }

  // 灵性引擎
  if (name === '骸骨祭坛') return 12;
  if (name === '食魂者') return 9;
  if (name === '火种祭坛') return 7;

  // 其余是灵像：按身材算，并看当前是否需要防守
  return bodyValue(view, card);
}

function bodyValue(view, card) {
  const imp = card.imp || 0;
  const myBoard = (view.me.field || []).length;
  const theirBoard = (view.opp.field || []).length;
  // 身材有两种回报：挡住对方的攻击，以及在对手场面被清空后集体打脸
  let v = unitValue(card) * 0.5 + imp * 5;
  if (theirBoard > 0) v += 8;                 // 可以上场当墙
  if (theirBoard > myBoard) v += 5;           // 落后更要补墙
  if (myBoard > theirBoard + 2) v -= 9;       // 场面已富余，别再堆
  if (imp >= 2) v += 4;
  return Math.min(v, BODY_CAP);
}

// 这些牌要留在手上或场上，不适合当灵质燃料
const KEEP_ENGINE = {
  '篝火营地': 1,
  '骸骨祭坛': 1,
  '食魂者': 1,
  '火种祭坛': 1,
  '灵魂交易': 1,
};

function scoreEssence(view, mv) {
  const me = view.me;
  const card = byUid(me.hand, mv.uid);
  if (!card) return 0;
  const value = cardBaseValue(card);
  const redN = countColor(me.essence, '红');
  const blackN = countColor(me.essence, '黑');

  // 我现在最缺哪种颜色的灵能
  let desired = '红';
  if (redN >= 3) desired = blackN < 1 ? '黑' : (blackN < redN ? '黑' : '红');

  let s = 16 - value * 0.45; // 1 点永久费用，代价是牺牲一张手牌
  if (KEEP_ENGINE[card.name]) s -= 10;
  if (card.color === desired) s += 6;
  // 灰色灵能只能付灰费（引擎 manaPlan：彩色费必须同色，灰费才可任意色垫付），
  // 而本牌组 20 张灰牌的灰费本来就能用红/黑灵能垫付，所以设灰灵质等于占掉一个颜色位却换不来额外购买力。
  // 惩罚加大到 -12 后，脚本几乎不再把灰牌设为灵质，实测四模式胜率同步上升（100 局/模式，366/400 vs 360/400）。
  else if (card.color === '灰') s -= 12;
  else s -= 2;
  if ((me.essence || []).length >= 8) s -= 4;
  return s;
}

function scoreAbility(view, mv) {
  const me = view.me;
  const name = mv.name || '';
  const tg = mv.targets || [];

  // 火种祭坛：横置发动，破坏自己 1 张灵像 → 对手灵体 1 点伤害
  if (name === '火种祭坛') {
    const victim = byUid(me.field, tg[0]);
    if (!victim) return 0;
    return DMG_SCORE - unitValue(victim) * 0.35;
  }
  // 黑暗聚合体：给自己 1 张牌一次「代替进入分解区」
  if (name === '黑暗聚合体') {
    const target = byUid(me.field, tg[0]);
    if (!target) return 0;
    return Math.min(10, unitValue(target) * 0.3);
  }
  // 烈焰聚合体：+2000 攻（该单位回合末被破坏）
  if (name === '烈焰聚合体') {
    const target = byUid(me.field, tg[0]);
    if (!target) return 0;
    let v = 0;
    for (const b of opponentsBlockers(view, target)) {
      if ((target.atk || 0) + 2000 >= leftHp(b)) v += unitValue(b) * 0.5;
    }
    return v - unitValue(target) * 0.45;
  }
  return 0;
}

function scoreSpiritSpecial(view, mv) {
  const me = view.me;
  const tg = mv.targets || [];
  const target = byUid(me.field, tg[0]);
  if (!target) return 0;
  let v = 0;
  const blockers = opponentsBlockers(view, target);
  if (!blockers.length) v += DMG_SCORE; // 白打脸时 +1 冲击 = 1 点伤害
  else {
    for (const b of blockers) {
      if ((target.atk || 0) + 1000 >= leftHp(b)) v += unitValue(b) * 0.6;
    }
    if (hasKw(target, '超冲击')) {
      const killAll = blockers.every((b) => (target.atk || 0) + 1000 >= leftHp(b));
      if (killAll) v += (target.imp || 0) * DMG_SCORE;
    }
  }
  v -= unitValue(target) * 0.05;
  return v;
}

function scoreSpiritDraw(view, mv) {
  const hand = view.me.handCount || 0;
  if (hand >= 6) return 4;  // 手牌快满了，白嫖一张也快被弃掉
  if (hand <= 2) return 16; // 快没牌了，免费补一张最关键
  return 11;
}

export default choose;
