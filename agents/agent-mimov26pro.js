// 策略名称：烬火速攻（Ember Rush）
// 选择理由：blitz 生命卡组仅 6 张，7 点生命伤害即胜，直伤与冲击是最快的路径；
//   红系拥有全卡池最密的直伤（火球术/焚尽/灰烬小僧/烈焰战将）与预制敏捷打手，
//   黑系提供祭品协同（燃魂/自杀式袭击 × 灰烬小僧）与补牌（灵质榨取），
//   直伤总量（火球术 8 + 燃魂 8 + 焚尽 6-8 + 小僧 4 + 战将 2）远超 7 点门槛。
// 主责模式：blitz

export const meta = {
  id: 'mimov26pro',
  model: 'MIMO-v2.6-pro',
  modelId: 'mimo-v2.6-pro',
  name: '烬火速攻',
  desc: '红黑直伤速攻：低费预制/敏捷打手每回合抢脸，燃魂·火球术·焚尽烧血，灰烬小僧献祭连打，余烬执火者把冲击泵到致命。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

// 50 张：与灵体同色（红）42 张 = 84% ≥ 60%；duo 双色覆盖 红 42 / 黑 12（燃魂混色双计入）。
// 同名均 ≤ 4；同时满足 grand 50—60 张下限与 duo 恰好 2 种非灰颜色各 ≥10。
export const deck = {
  '火焰鸟': 4,
  '地狱犬': 4,
  '灰烬小僧': 4,
  '烈焰斗士': 4,
  '爆燃': 4,
  '血怒': 4,
  '火球术': 4,
  '燃魂': 4,
  '自杀式袭击': 4,
  '灵质榨取': 4,
  '烈焰之力': 2,
  '火种祭坛': 2,
  '熔岩投手': 2,
  '焚尽': 2,
  '烈焰战将': 2,
};

export const spirit = '余烬执火者';
export const color = '红';

const PASS = (moves) => moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

// 各类卡的主阶段基准分（出手优先级）。
const UNIT_SCORE = {
  '烈焰斗士': 92, '火焰鸟': 86, '烈焰战将': 88, '地狱犬': 82,
  '熔岩投手': 78, '灰烬小僧': 68,
};

const kwOf = (c) => (c && c.keywords) || [];
const hasKw = (c, k) => kwOf(c).includes(k);
const hpLeft = (c) => ((c && c.hp) || 0) - ((c && c.damage) || 0);
const atkOf = (c) => (c && c.atk) || 0;
const impOf = (c) => (c && c.imp) || 0;

// 献祭代价：越小越该拿去献祭。灰烬小僧被献祭时终曲再烧 1，视为倒贴。
function sacCost(c) {
  if (!c) return 0;
  if (c.name === '灰烬小僧') return -26;
  if (c.token) return -6;
  if (c.type === '灵性') return 2;
  if (c.type !== '灵像') return 0;
  const a = atkOf(c);
  if (c.tapped) return a >= 3000 ? 18 : 4;
  return a >= 3000 ? 46 : a >= 2000 ? 24 : 10;
}

// 破坏对方一张卡的价值。
function destroyValue(c) {
  if (!c) return 0;
  if (c.type === '灵性') return 44 + atkOf(c) * 0.01;
  if (c.type !== '灵像') return 30;
  let v = 32 + atkOf(c) * 0.012 + impOf(c) * 20 + (c.hp || 0) * 0.003;
  if (hasKw(c, '先攻') || hasKw(c, '超冲击')) v += 12;
  return v;
}

function buildCtx(view) {
  const me = view.me, opp = view.opp;
  const handById = new Map();
  for (const c of me.hand || []) handById.set(c.uid, c);
  const fieldById = new Map();
  for (const c of [...me.field, ...opp.field]) fieldById.set(c.uid, c);
  const isMine = (uid) => me.field.some((c) => c.uid === uid);
  const modeLife = (view.modeSpec && view.modeSpec.life) || 10;
  const oppLife = opp.life, myLife = me.life;
  const race = oppLife <= 2 ? 2.4 : oppLife <= 3 ? 1.7 : oppLife <= 5 ? 1.15 : 0.75;
  const myReady = me.field.filter((c) => c.type === '灵像' && !c.tapped);
  const myEssenceBlack = (me.essence || []).filter((c) => c.color === '黑').length;
  return {
    view, me, opp, handById, fieldById, isMine,
    modeLife, oppLife, myLife, race, myReady, myEssenceBlack,
    handCount: (me.hand || []).length,
    essenceCount: (me.essence || []).length,
  };
}

// 对方此刻能阻挡 uid 攻击者的单位（含敏捷/守护过滤）。
function potentialBlockers(ctx, attacker) {
  const agile = hasKw(attacker, '敏捷');
  return ctx.opp.field.filter((u) => {
    if (u.type !== '灵像') return false;
    const guard = hasKw(u, '守护');
    if (u.tapped && !guard) return false;
    if (agile && !hasKw(u, '敏捷') && !(u.tapped && guard)) return false;
    return true;
  });
}

function blockRisk(ctx, attacker, blockers) {
  const aAtk = atkOf(attacker), aHp = hpLeft(attacker);
  let risk = 0;
  for (const u of blockers) {
    const killsMe = atkOf(u) >= aHp;
    const iKill = aAtk >= hpLeft(u);
    if (killsMe && !iKill) risk += 16;
    else if (killsMe && iKill) risk += 5;
  }
  return Math.min(risk, 46);
}

function scoreAttack(ctx, mv) {
  const A = ctx.fieldById.get(mv.uid);
  if (!A) return 0;
  const imp = impOf(A), atk = atkOf(A);
  const blockers = potentialBlockers(ctx, A);
  if (mv.target === 'spirit') {
    let s = 46 + imp * 30 * ctx.race;
    if (hasKw(A, '敏捷')) s += 16;
    if (hasKw(A, '超冲击')) s += 22;
    if (hasKw(A, '先攻')) s += 8;
    if (hasKw(A, '预制')) s += 4;
    s -= blockRisk(ctx, A, blockers);
    if (ctx.oppLife <= imp) s += blockers.length ? 60 : 220;
    return s;
  }
  const U = ctx.fieldById.get(mv.target);
  if (!U) return 5;
  const killsU = atk >= hpLeft(U);
  const uKillsMe = atkOf(U) >= hpLeft(A);
  let s;
  if (U.type === '灵性' || atkOf(U) === 0) s = killsU ? 62 : 22;
  else if (killsU && !uKillsMe) s = 72 + atkOf(U) * 0.012;
  else if (killsU && uKillsMe) s = 42 + (atkOf(U) - atk) * 0.004;
  else if (!killsU && !uKillsMe) s = 20 + (U.damage > 0 ? 8 : 0);
  else s = 2 - atkOf(U) * 0.002;
  s -= blockRisk(ctx, A, blockers);
  return s;
}

function scoreBlock(ctx, mv) {
  const cb = ctx.view.combat;
  const A = ctx.fieldById.get(cb.attackerUid);
  const B = ctx.fieldById.get(mv.uid);
  if (!A || !B) return 0;
  const aImp = impOf(A), aAtk = atkOf(A);
  const killsA = atkOf(B) >= hpLeft(A);
  const killsB = aAtk >= hpLeft(B);
  const prevents = cb.target === 'spirit' ? aImp : 0;
  let s;
  if (killsA && !killsB) s = 88 + aAtk * 0.012;
  else if (killsA && killsB) s = 58 + (aAtk - atkOf(B)) * 0.004 + (sacCost(B) < 0 ? 14 : 0);
  else if (!killsA && !killsB) s = 34 + prevents * 16;
  else s = 10 + prevents * 12 + (sacCost(B) < 0 ? 10 : -6);
  if (killsA) s += 10;
  if (B.name === '灰烬小僧' && killsB) s += 14;
  if (cb.target === 'spirit' && ctx.myLife <= aImp) s += 45;
  return s;
}

function scoreOrder(ctx, mv) {
  const order = mv.order || [];
  const n = order.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const u = ctx.fieldById.get(order[i]);
    const threat = u
      ? atkOf(u) * 0.02 + impOf(u) * 22 + (u.hp || 0) * 0.004 + (hasKw(u, '先攻') ? 12 : 0) + (hasKw(u, '超冲击') ? 10 : 0)
      : 0;
    s += threat * (n - i);
  }
  return s;
}

// 血怒/烈焰之力：留到战斗响应窗给攻击者或阻挡者，主阶段先不急。
function scorePump(ctx, mv, name) {
  const target = ctx.fieldById.get((mv.targets || [])[0]);
  const cb = ctx.view.combat;
  const selfDoom = name === '烈焰之力';
  if (target && !ctx.isMine(target.uid)) return 2;
  if (cb && cb.stage === 'response') {
    const ourAttack = ctx.isMine(cb.attackerUid);
    const ourBlocks = (cb.blockers || []).some((uid) => ctx.isMine(uid));
    if (ourAttack && target && target.uid === cb.attackerUid) {
      const lethal = ctx.oppLife <= impOf(target) + 1;
      return (lethal ? 130 : 102) + impOf(target) * 4 - (selfDoom ? 4 : 0);
    }
    if (ourBlocks && target && (cb.blockers || []).includes(target.uid)) {
      return 94 + atkOf(target) * 0.01 - (selfDoom ? 6 : 0);
    }
    return 30;
  }
  if (cb) return 22;
  // 主阶段：临时强化回合结束即失效，没攻击就浪费。
  if (target && !target.tapped && target.type === '灵像') {
    return 26 + (selfDoom ? -6 : 0);
  }
  return 12;
}

function scorePlay(ctx, mv) {
  const hc = ctx.handById.get(mv.uid);
  if (!hc) return 0;
  const name = hc.name;
  const mode = mv.mode || 'main';
  const targets = mv.targets || [];
  const race = ctx.race;

  switch (name) {
    case '火球术':
      return 30 + 2 * 40 * race;
    case '焚尽': {
      const dmg = ctx.me.field.length === 0 ? 4 : 3;
      return 30 + dmg * 40 * race;
    }
    case '燃魂': {
      const t = ctx.fieldById.get(targets[0]);
      let s = 30 + 2 * 40 * race - sacCost(t);
      if (t && t.name === '灰烬小僧') s += 30 * race;
      return s;
    }
    case '爆燃': {
      const t = ctx.fieldById.get(targets[0]);
      if (!t || ctx.isMine(t.uid)) return 3;
      const left = hpLeft(t);
      const killable = left <= 1000 || (t.damage > 0 && left <= 3000);
      let s = killable ? 34 + destroyValue(t) : 16 + atkOf(t) * 0.004;
      const cb = ctx.view.combat;
      if (cb && cb.stage === 'response' && cb.attackerUid === t.uid && killable) s += 55;
      return s;
    }
    case '自杀式袭击': {
      const mine = ctx.fieldById.get(targets[0]);
      const theirs = ctx.fieldById.get(targets[1]);
      if (!theirs || ctx.isMine(theirs.uid)) return 2;
      let s = 24 + destroyValue(theirs) - sacCost(mine);
      const cb = ctx.view.combat;
      if (cb && cb.stage === 'response' && cb.attackerUid === theirs.uid) s += 45;
      return s;
    }
    case '血怒':
    case '烈焰之力':
      return scorePump(ctx, mv, name);
    case '灵质榨取': {
      if (mode === 'bury') {
        let minCost = 99;
        for (const c of ctx.me.hand || []) if ((c.cost && c.cost.total || 0) < minCost) minCost = c.cost.total;
        return 68 + (ctx.handCount >= 7 ? 20 : -24) + (minCost >= 3 ? 12 : -8);
      }
      return 68;
    }
    case '火种祭坛':
      return scoreAbility(ctx, mv, name);
    default:
      if (name in UNIT_SCORE) {
        let s = UNIT_SCORE[name];
        if (ctx.me.field.length >= 5) s -= 8;
        if (race > 1 && (hasKw(hc, '预制') || hasKw(hc, '敏捷'))) s += 6;
        return s;
      }
      return 30;
  }
}

function scoreAbility(ctx, mv, name) {
  const self = ctx.fieldById.get(mv.uid);
  if (!self || self.tapped) return 0;
  const targets = mv.targets || [];
  if (name === '熔岩投手') {
    const t = ctx.fieldById.get(targets[0]);
    if (!t) return 2;
    if (ctx.isMine(t.uid)) return 2;
    const killable = hpLeft(t) <= 1000;
    let s = killable ? 58 + destroyValue(t) * 0.6 : 26;
    const cb = ctx.view.combat;
    if (cb && cb.stage === 'response' && cb.attackerUid === t.uid && killable) s += 55;
    return s;
  }
  if (name === '火种祭坛') {
    const t = ctx.fieldById.get(targets[0]);
    if (!t || !ctx.isMine(t.uid)) return 1;
    const burns = t.name === '灰烬小僧' ? 2 : 1;
    return 18 + burns * 40 * ctx.race - sacCost(t);
  }
  return 20;
}

function scoreSpiritSpecial(ctx, mv) {
  const t = ctx.fieldById.get((mv.targets || [])[0]);
  const cb = ctx.view.combat;
  if (t && !ctx.isMine(t.uid)) return 1;
  if (cb && cb.stage === 'response') {
    const ourAttack = ctx.isMine(cb.attackerUid);
    if (ourAttack && t && t.uid === cb.attackerUid) return 108 + impOf(t) * 4;
    const ourBlocks = (cb.blockers || []).filter((uid) => ctx.isMine(uid));
    if (ourBlocks.length && t && ourBlocks.includes(t.uid)) return 96;
  }
  if (t && !t.tapped && t.type === '灵像' && ctx.myReady.length > 0) return 84;
  return 14;
}

function scoreSetEssence(ctx, mv) {
  const hc = ctx.handById.get(mv.uid);
  if (!hc) return 0;
  const e = ctx.essenceCount, h = ctx.handCount;
  let base;
  if (h >= 3 && e < 3) base = 95;
  else if (h >= 4 && e < 5) base = 82;
  else if (h >= 6 && e < 6) base = 58;
  else if (h >= 8) base = 46;
  else base = 16;
  if (hc.color === '黑') base += ctx.myEssenceBlack === 0 ? 30 : ctx.myEssenceBlack === 1 ? 8 : 0;
  if (['火球术', '燃魂', '焚尽', '爆燃', '自杀式袭击'].includes(hc.name)) base -= 32;
  else if (['血怒', '烈焰之力'].includes(hc.name)) base -= 14;
  else if (['火焰鸟', '地狱犬', '烈焰斗士'].includes(hc.name)) base -= 12;
  if ((hc.cost && hc.cost.total || 0) >= 5) base += e < 3 ? 10 : -12;
  return Math.max(base, 1);
}

function scoreMove(ctx, mv) {
  switch (mv.type) {
    case 'attack': return scoreAttack(ctx, mv);
    case 'block': return scoreBlock(ctx, mv);
    case 'orderBlockers': return scoreOrder(ctx, mv);
    case 'supportSpirit': return 85;
    case 'play': return scorePlay(ctx, mv);
    case 'ability': return scoreAbility(ctx, mv, mv.name);
    case 'spiritSpecial': return scoreSpiritSpecial(ctx, mv);
    case 'spiritDraw': {
      const h = ctx.handCount;
      return 78 - (h >= 8 ? 26 : h >= 7 ? 12 : 0);
    }
    case 'setEssence': return scoreSetEssence(ctx, mv);
    case 'tapEssence': return 1;
    case 'pass': {
      const cb = ctx.view.combat;
      if (cb && cb.stage === 'blockers') {
        const A = ctx.fieldById.get(cb.attackerUid);
        const lethal = cb.target === 'spirit' && A && ctx.myLife <= impOf(A);
        return lethal ? 8 : 30;
      }
      if (cb && cb.stage === 'attackers') return 42;
      if (cb && cb.stage === 'support') return 10;
      return 40;
    }
    default: return 0;
  }
}

function pickBest(view, moves) {
  const ctx = buildCtx(view);

  // 灵体检视：inspectTake 免费入手；仅 CT 触发张（地狱犬/烈焰之力）值得 1 点灵能揭示换暴击。
  if (view.inspect) {
    const take = moves.find((m) => m.type === 'inspectTake');
    const reveal = moves.find((m) => m.type === 'inspectReveal');
    const card = view.inspect.card;
    const trig = card && card.trigger ? String(card.trigger) : '—';
    const worthCT = trig.includes('CT') && ctx.essenceCount >= 2;
    if (reveal && worthCT) return reveal;
    return take || PASS(moves);
  }

  // 阻挡：block 是切换式动作，必须滤掉已宣告的阻挡者，否则宣告/取消无限循环。
  if (view.combat && view.combat.stage === 'blockers') {
    const chosen = view.combat.blockers || [];
    const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
    let best = null, bestScore = -Infinity;
    for (const m of fresh) {
      const s = scoreMove(ctx, m);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best || PASS(moves);
  }

  // 确定伤害分配顺序：每轮必须返回 orderBlockers（此阶段合法动作也只有它们）。
  if (view.combat && view.combat.stage === 'order') {
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      if (m.type !== 'orderBlockers') continue;
      const s = scoreMove(ctx, m);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best || moves[0] || PASS(moves);
  }

  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const s = scoreMove(ctx, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || PASS(moves);
}

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    return pickBest(view, moves) || PASS(moves);
  } catch (e) {
    return PASS(moves);
  }
}
