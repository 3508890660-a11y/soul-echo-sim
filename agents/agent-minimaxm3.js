/**
 * 策略名称：余烬共鸣（Ember Resonance）
 * 选择理由：红黑双色的「自燃—回响」引擎——用红色灵能点燃自己的单位，把每一次牺牲（灰烬小僧终曲、火种祭坛启动、燃魂献祭）都换成对手生命卡组上的伤口；黑色只用来支付混色牌的另一半费用并补一块廉价阻挡，灰色则塞进只吃灰费的通用件里。
 * 主责模式：duo（灵体：余烬执火者；主色：红；卡组 50 张——同色红 41 张＝82%，费用覆盖红 41／黑 11，灰 5 张不计色）
 */

export const meta = {
  id: 'minimaxm3',
  model: 'MiniMax M3',
  modelId: 'minimax-m3-pay',
  name: '余烬共鸣',
  desc: '红黑双色的自燃引擎：让单位替我挨刀，把每次献祭都换成对手生命卡组上的伤口。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  '灰烬小僧': 4,
  '火种祭坛': 3,
  '燃魂': 4,
  '火球术': 4,
  '焚尽': 2,
  '混沌冲击': 2,
  '地狱犬': 4,
  '烈焰斗士': 4,
  '烈焰聚合体': 2,
  '烈焰之力': 3,
  '血怒': 3,
  '血焰狂徒': 3,
  '烈焰战将': 3,
  '骨墙': 2,
  '自杀式袭击': 2,
  '余烬回燃': 1,
  '熔炉之核': 1,
  '混沌打击': 1,
  '巨石守卫': 1,
  '冒险准备': 1,
};

export const spirit = '余烬执火者';
export const color = '红';

// ── 常量表（纯函数使用，无可变模块级状态） ──────────────────────────

/** 手牌保留价值：越高越舍不得设成灵质。 */
const KEEP = {
  '燃魂': 30, '焚尽': 27, '火球术': 26, '火种祭坛': 22, '灰烬小僧': 20, '血焰狂徒': 20,
  '烈焰之力': 16, '烈焰战将': 16, '烈焰斗士': 14, '地狱犬': 14, '余烬回燃': 13,
  '混沌冲击': 12, '巨石守卫': 12, '自杀式袭击': 12, '烈焰聚合体': 12, '血怒': 12,
  '骨墙': 11, '冒险准备': 10, '熔炉之核': 10, '混沌打击': 9, '篝火营地': 8,
};

/** 牺牲一张卡换来的灵能只算一点边际收益：真正值钱的是它留在手里能做什么。 */
const MANA_VALUE = { '红': 2, '黑': 1, '灰': 0 };

/** 这些卡需要黑色灵能，用于判断要不要先设一张黑色灵质。 */
const BLACK_COST = { '燃魂': 1, '血焰狂徒': 2, '骨墙': 2, '自杀式袭击': 1 };

const ABILITY_MIN = 18;
const PLAY_MIN = 9;
const RESPONSE_MIN = 16;

/** 直伤牌：模式生命越短越该抢先打出去。 */
const BURN_CARDS = { '火球术': 1, '焚尽': 1, '燃魂': 1, '混沌冲击': 1 };

/** 能当身板的单位。 */
const BODY_CARDS = { '地狱犬': 1, '烈焰斗士': 1, '骨墙': 1, '巨石守卫': 1, '烈焰聚合体': 1 };

/** 节奏系数：短局更贪伤害，长局更舍得搭引擎。 */
function aggroFactor(v) {
  const life = (v.modeSpec && v.modeSpec.life) || 10;
  if (life <= 6) return 1.25;
  if (life <= 10) return 1;
  return 0.7;
}

// ── 纯工具 ────────────────────────────────────────────────────────

const byUid = (list, uid) => (list || []).find((c) => c && c.uid === uid);
const units = (list) => (list || []).filter((c) => c && c.type === '灵像');
const hasKw = (c, kw) => !!c && Array.isArray(c.keywords) && c.keywords.includes(kw);
const remHp = (c) => Math.max(0, (c.hp || 0) - (c.damage || 0));
const unitValue = (c) => (c.atk || 0) / 1000 + (c.imp || 0) * 1.6 + remHp(c) / 1400;
const targetOf = (m, idx) => (m.targets && m.targets[idx] != null ? m.targets[idx] : null);

/** 引擎的阻挡合法性：横置者需守护；攻击者敏捷时需敏捷或（横置＋守护）。 */
function canBlock(attacker, blocker) {
  if (!blocker || blocker.type !== '灵像') return false;
  if (blocker.tapped && !hasKw(blocker, '守护')) return false;
  if (hasKw(attacker, '敏捷') && !hasKw(blocker, '敏捷') && !(blocker.tapped && hasKw(blocker, '守护'))) return false;
  return true;
}

function myUnits(v) { return units(v.me.field); }
function oppUnits(v) { return units(v.opp.field); }

/** 我方场上可立刻攻击的单位（含预制）。 */
function attackersOf(v) {
  return myUnits(v).filter((u) => !u.tapped);
}

// ── 战斗：宣告攻击 ───────────────────────────────────────────────

function attackScore(v, m) {
  const A = byUid(myUnits(v), m.uid);
  if (!A) return -999;
  const imp = A.imp || 0;
  if (m.target === 'spirit') {
    const blockers = oppUnits(v).filter((b) => canBlock(A, b));
    if (!blockers.length) return 60 + imp * 10;
    let need = 0;
    let allDie = true;
    for (const b of blockers) {
      const h = remHp(b);
      need += h;
      if ((A.atk || 0) < h) allDie = false;
    }
    let s;
    if (allDie && hasKw(A, '超冲击')) s = 52 + imp * 10;
    else if (allDie) s = 8 + imp * 2;
    else s = -8;
    let counter = 0;
    for (const b of blockers) counter += b.atk || 0;
    if (counter >= remHp(A)) s -= unitValue(A);
    return s;
  }
  const T = byUid(oppUnits(v), m.target);
  if (!T) return -999;
  const kill = (A.atk || 0) >= remHp(T);
  const dies = (T.atk || 0) >= remHp(A);
  let s = kill ? 12 + unitValue(T) * 1.4 : -5;
  if (dies) s -= unitValue(A) * 0.9;
  return s;
}

function chooseAttack(v, moves) {
  const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const s = attackScore(v, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pass;
}

// ── 战斗：支援阶段 ───────────────────────────────────────────────

function chooseSupport(v, moves) {
  const sp = moves.find((m) => m.type === 'supportSpirit');
  if (sp) return sp;
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}

// ── 战斗：阻挡阶段（block 是 toggle，必须过滤已宣告者） ──────────

function chooseBlock(v, moves) {
  const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  const combat = v.combat || {};
  const declared = combat.blockers || [];
  const attacker = byUid(v.opp.field, combat.attackerUid);
  if (!attacker) return pass;
  for (const uid of declared) {
    const b = byUid(myUnits(v), uid);
    if (b && (b.atk || 0) >= remHp(attacker)) return pass;
  }
  const imp = attacker.imp || 0;
  if (imp <= 0) return pass;
  const fresh = moves.filter((m) => m.type !== 'block' || !declared.includes(m.uid));
  let best = null;
  let bestScore = 0;
  for (const m of fresh) {
    if (m.type !== 'block') continue;
    const b = byUid(myUnits(v), m.uid);
    if (!b) continue;
    const kills = (b.atk || 0) >= remHp(attacker);
    const survives = remHp(attacker) > (attacker.atk || 0);
    let s = imp * 6;
    if (kills) s += 20;
    if (survives) s += 6;
    else s -= unitValue(b) * 0.8;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pass;
}

// ── 战斗：伤害分配顺序 ───────────────────────────────────────────

function chooseOrder(v, moves) {
  const combat = v.combat || {};
  const mine = (combat.blockers || [])
    .map((uid) => byUid(myUnits(v), uid))
    .filter(Boolean)
    .sort((a, b) => (b.atk || 0) - (a.atk || 0))
    .map((c) => c.uid);
  let best = null;
  let bestDiff = Infinity;
  for (const m of moves) {
    if (m.type !== 'orderBlockers') continue;
    let diff = 0;
    for (let i = 0; i < m.order.length; i++) if (m.order[i] !== mine[i]) diff++;
    if (diff < bestDiff) { bestDiff = diff; best = m; }
    if (diff === 0) return m;
  }
  return best || moves.find((m) => m.type === 'orderBlockers') || moves[moves.length - 1];
}

// ── 出牌评估 ─────────────────────────────────────────────────────

function fuelOnField(v) {
  return myUnits(v).find((u) => u.name === '灰烬小僧') || null;
}

function altarOnField(v) {
  return myUnits(v).find((u) => u.name === '火种祭坛') || null;
}

/** 对手场上能打到我脸上的总冲击力，用来判断要不要留身板。 */
function incomingThreat(v) {
  let n = 0;
  for (const u of oppUnits(v)) n += u.imp || 0;
  return n;
}

function scorePlay(v, m) {
  const c = byUid(v.me.hand, m.uid);
  if (!c) return -999;
  const name = c.name;
  const mine = myUnits(v);
  const theirs = oppUnits(v);
  const attackers = attackersOf(v);
  const monk = fuelOnField(v);
  const altar = altarOnField(v);
  const aggro = aggroFactor(v);
  let s = 0;

  switch (name) {
    case '火球术':
      s = 30; break;
    case '焚尽':
      s = mine.length === 0 ? 34 : 30; break;
    case '燃魂': {
      s = 22;
      const t = byUid(mine, targetOf(m, 0));
      if (t) {
        if (t.name === '灰烬小僧') s = 34;
        else if (t.name === '烈焰聚合体') s = 30;
        else if (t.name === '地狱犬') s = 25;
        else s = 14;
      }
      break;
    }
    case '混沌冲击':
      s = 18; break;
    case '混沌打击': {
      const t = byUid([...mine, ...theirs], targetOf(m, 0));
      if (!t) { s = 6; break; }
      if (theirs.includes(t)) s = remHp(t) <= 2000 ? 20 + unitValue(t) : 9;
      else s = t.name === '灰烬小僧' ? 20 : 3;
      break;
    }
    case '灰烬小僧': {
      const converter = !!altar || v.me.hand.some((x) => x.name === '燃魂')
        || v.me.hand.some((x) => x.name === '自杀式袭击');
      const monks = mine.filter((u) => u.name === '灰烬小僧').length;
      if (!converter) s = 7;
      else if (altar && monks >= 2) s = 12;
      else s = 19;
      break;
    }
    case '火种祭坛':
      s = altar ? 6 : (mine.some((u) => u.name === '灰烬小僧')
        || v.me.hand.some((x) => x.name === '灰烬小僧') ? 24 : 14);
      break;
    case '烈焰之力': {
      const t = byUid([...mine, ...theirs], targetOf(m, 0));
      s = attackers.length ? 16 : 4;
      if (t) {
        if (mine.includes(t)) {
          s += 4;
          if (t.name === '灰烬小僧') s += 7;
          if (!t.tapped && t.name !== '灰烬小僧') s += 5;
        } else {
          s = 13 + unitValue(t) * 0.8;
        }
      }
      break;
    }
    case '血怒': {
      const t = byUid([...mine, ...theirs], targetOf(m, 0));
      s = attackers.length ? 13 : 3;
      if (t && mine.includes(t)) s += 3;
      break;
    }
    case '血焰狂徒':
      s = 20; break;
    case '地狱犬':
      s = mine.length < 3 ? 15 : 10; break;
    case '烈焰斗士':
      s = 15; break;
    case '烈焰聚合体':
      s = 9; break;
    case '余烬回燃': {
      const reds = (v.me.grave || []).filter((g) => g.color === '红' && g.type === '灵感').length;
      s = reds >= 2 ? 19 : 3;
      break;
    }
    case '烈焰战将':
      s = 17; break;
    case '熔炉之核':
      s = attackers.length >= 2 ? 12 : 5; break;
    case '骨墙':
      s = mine.length < 4 ? 12 : 9; break;
    case '自杀式袭击': {
      const my = byUid(mine, targetOf(m, 0));
      const op = byUid(v.opp.field, targetOf(m, 1));
      s = 12;
      if (my && my.name === '灰烬小僧') s += 8;
      if (op) s += unitValue(op) * 1.2;
      break;
    }
    case '巨石守卫':
      s = 14; break;
    case '冒险准备':
      s = v.me.handCount <= 3 ? 14 : 6; break;
    case '篝火营地':
      s = v.me.life <= 4 ? 18 : 5; break;
    default:
      s = 5;
  }
  if (BURN_CARDS[name]) s *= aggro;
  else if (name === '火种祭坛' || name === '灰烬小僧' || name === '篝火营地' || name === '熔炉之核') s /= aggro;
  if (BODY_CARDS[name] && mine.length < 3 && (incomingThreat(v) > 0 || v.me.life <= 5)) s += 6;
  if (name === '熔炉之核' || name === '巨石守卫') s -= Math.max(0, (c.cost.total || 0) - 3) * 1.2;
  return s;
}

function bestPlay(v, moves) {
  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const s = scorePlay(v, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best ? { move: best, score: bestScore } : null;
}

// ── 启动能力评估 ─────────────────────────────────────────────────

function bestAbility(v, moves, latePhase) {
  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'ability') continue;
    const c = byUid(v.me.field, m.uid) || byUid(v.me.essence, m.uid);
    if (!c) continue;
    let s = 0;
    if (c.name === '火种祭坛') {
      const t = byUid(myUnits(v), targetOf(m, 0));
      const monks = myUnits(v).filter((u) => u.name === '灰烬小僧').length;
      const others = attackersOf(v).filter((u) => u.name !== '灰烬小僧').length;
      s = 22;
      if (t) {
        if (t.name === '灰烬小僧') s = monks >= 2 || others === 0 ? 46 : 34;
        else if (t.name === '烈焰聚合体') s = 38;
        else s = v.opp.life <= 2 ? 24 : 14;
      }
      if (!latePhase && monks === 1 && others > 0) s -= 8;
    } else if (c.name === '血焰狂徒') {
      const t = byUid(myUnits(v), targetOf(m, 0));
      s = 26;
      if (t && t.name === '灰烬小僧') s = 34;
      else if (t) s = 20;
    } else if (c.name === '烈焰聚合体') {
      const t = byUid(myUnits(v), targetOf(m, 0));
      s = 18;
      if (t && t.name === '灰烬小僧') s = 30;
      else if (t) s = 24;
    } else if (c.name === '熔岩投手') {
      s = 15;
    } else {
      s = 8;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best ? { move: best, score: bestScore } : null;
}

// ── 灵质（每回合只能设 1 张）与黑色灵能规划 ───────────────────────

function pickEssence(v, moves, protectUid) {
  const cands = moves.filter((m) => m.type === 'setEssence');
  if (!cands.length) return null;
  const blackHave = (v.me.mana && v.me.mana['黑']) || 0;
  const blackEssence = (v.me.essence || []).filter((c) => c.color === '黑' && !c.tapped).length;
  let blackNeed = 0;
  for (const c of v.me.hand || []) {
    const need = BLACK_COST[c.name] || 0;
    if (need > blackNeed) blackNeed = need;
  }
  // 只有手上确实握着要用到的黑牌时，才值得牺牲一张卡去换黑灵能。
  const hand = v.me.hand || [];
  const hasBurn = hand.some((c) => c.name === '燃魂' && myUnits(v).length > 0);
  const hasMad = hand.some((c) => c.name === '血焰狂徒');
  const hasSui = hand.some((c) => c.name === '自杀式袭击' && oppUnits(v).length > 0);
  const hasWall = hand.some((c) => c.name === '骨墙' && myUnits(v).length < 3);
  const wantBlack = (hasBurn || hasMad || hasSui || hasWall) && blackNeed > blackHave + blackEssence;
  let best = null;
  let bestCost = Infinity;
  for (const m of cands) {
    const c = byUid(v.me.hand, m.uid);
    if (!c) continue;
    if (protectUid && c.uid === protectUid) continue;
    let cost = (KEEP[c.name] != null ? KEEP[c.name] : 8) - (MANA_VALUE[c.color] != null ? MANA_VALUE[c.color] : 2);
    if (wantBlack && c.color === '黑') cost -= 14;
    else if (c.color === '灰') cost += 6;
    if (cost < bestCost) { bestCost = cost; best = m; }
  }
  return best;
}

// ── 灵体专属能力 ─────────────────────────────────────────────────

function chooseSpiritSpecial(v, moves) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    if (m.type !== 'spiritSpecial') continue;
    const t = byUid(myUnits(v), targetOf(m, 0));
    if (!t) continue;
    let s = (t.imp || 0) * 3 + (t.atk || 0) / 1000;
    if (hasKw(t, '预制')) s += 4;
    if (t.tapped) s -= 5;
    if (t.name === '灰烬小僧') s -= 8;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// ── 响应（连锁非空、或轮到自己响应对方） ─────────────────────────

function scoreResponse(v, m) {
  const c = byUid(v.me.hand, m.uid);
  if (!c) return -999;
  const name = c.name;
  if (name === '焚尽') return 34;
  if (name === '火球术') return 30;
  if (name === '燃魂') {
    const t = byUid(myUnits(v), targetOf(m, 0));
    if (t && t.name === '灰烬小僧') return 36;
    return 26;
  }
  if (name === '混沌冲击') return 18;
  if (name === '余烬回燃') {
    const reds = (v.me.grave || []).filter((g) => g.color === '红' && g.type === '灵感').length;
    return reds >= 2 ? 20 : 3;
  }
  if (name === '自杀式袭击') {
    const op = byUid(v.opp.field, targetOf(m, 1));
    return op ? 12 + unitValue(op) * 1.2 : 10;
  }
  if (name === '混沌打击') return 12;
  if (name === '冒险准备') return 9;
  return 2;
}

function bestResponse(v, moves) {
  let best = null;
  let bestScore = RESPONSE_MIN;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const s = scoreResponse(v, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// ── 主要阶段 ─────────────────────────────────────────────────────

function chooseMain(v, moves) {
  const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  const latePhase = v.phase === 'main2';

  const ab = bestAbility(v, moves, latePhase);
  if (ab && ab.score >= ABILITY_MIN) return ab.move;

  const pl = bestPlay(v, moves);
  const es = pickEssence(v, moves, pl ? pl.move.uid : null);
  const handSize = (v.me.hand || []).length;
  if (es && handSize >= 2) return es;
  if (pl && pl.score >= PLAY_MIN) return pl.move;

  const sp = chooseSpiritSpecial(v, moves);
  const realAttackers = attackersOf(v).filter((u) => u.name !== '灰烬小僧');
  if (sp && realAttackers.length) return sp;
  const sd = moves.find((m) => m.type === 'spiritDraw');
  if (sd && v.me.handCount <= 6 && v.me.deck > 0) return sd;
  return pass;
}

// ── 入口 ─────────────────────────────────────────────────────────

export function choose(view, moves) {
  try {
    if (!view || !Array.isArray(moves) || !moves.length) return { type: 'pass' };
    const v = view;

    if (v.inspect && moves.some((m) => m.type === 'inspectTake')) {
      return moves.find((m) => m.type === 'inspectTake');
    }

    const stage = v.combat ? v.combat.stage : null;
    if (stage === 'attackers') return chooseAttack(v, moves);
    if (stage === 'support') return chooseSupport(v, moves);
    if (stage === 'blockers') return chooseBlock(v, moves);
    if (stage === 'order') return chooseOrder(v, moves);

    const myTurn = v.priority === v.me.idx && v.active === v.me.idx;
    const inMain = myTurn && (v.phase === 'main1' || v.phase === 'main2') && (!v.chain || !v.chain.length);

    if (inMain) return chooseMain(v, moves);

    // 响应窗口：连锁未结或正在响应对手。
    const ab = bestAbility(v, moves, v.phase === 'main2');
    if (ab && ab.score >= ABILITY_MIN) return ab.move;
    const resp = bestResponse(v, moves);
    if (resp) return resp;
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  } catch (err) {
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
}
