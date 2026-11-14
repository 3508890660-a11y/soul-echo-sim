/**
 * 策略名称：根脉奔流（Root Torrent）
 * 选择理由：绿色是唯一能系统性突破「每回合只能设 1 张灵质」这一全局硬限制的颜色
 *   （幼苗守望者/部落祭司序曲搬手牌、自然生长/丰收搬牌库顶进灵质区、丰收再重置 2 张灵质、
 *   灵体根脉育苗者专属能力「手牌→灵质＋抽 1」），跳费 2 回合后让冲击 2 的
 *   超冲击巨兽（森林战将/王牌巨象）提前 2-3 回合登场，践踏＋超冲击穿透阻挡直取生命。
 *   白色守护墙（光能守护者/守林圣骑士）与回血（治愈灵光/圣光聚合体质密）保住前中期。
 * 主责模式：standard
 */

export const meta = {
  id: 'glm53',
  model: 'GLM5.3',
  modelId: 'glm-5.3',
  name: '根脉奔流',
  desc: '绿色灵质加速突破每回合 1 灵质上限，跳费 2 回合让冲击 2 的超冲击巨兽提前登场穿透生命。',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // 绿 34 张：跳费引擎 + 超冲击巨兽
  幼苗守望者: 4,
  自然生长: 4,
  部落祭司: 4,
  丰收: 4,
  森林战将: 4,
  王牌巨象: 3,
  古树牧者: 3,
  森林狼王: 2,
  森林守卫者: 2,
  藤蔓编织者: 1,
  根须缠绕: 2,
  生命灌注: 1,
  // 白 12 张：守护墙 + 解场 + 加血
  圣光打击: 3,
  光能守护者: 3,
  晨祷侍从: 2,
  治愈灵光: 2,
  圣光聚合体: 2,
  // 混色 4 张（主色白，费用两色各计）：守护 + 奶 + 置灵质
  守林圣骑士: 2,
  生命之泉: 2,
};

export const spirit = '根脉育苗者';
export const color = '绿';

// ───────────────────────── 工具函数（纯读 view，无副作用） ─────────────────────────

const isUnit = (c) => c && c.type === '灵像';
const hpLeft = (c) => Math.max(0, (c.hp || 0) - (c.damage || 0));
const atkOf = (c) => (c.atk || 0);
const impOf = (c) => (c.imp || 0);
const valueOf = (c) => ((c.atk || 0) + (c.hp || 0) + (c.imp || 0) * 6) / 1000;
const kwOf = (c) => c.keywords || [];
const passOf = (moves) => moves.find((m) => m.type === 'pass');

function canBlockMe(c) {
  return !c.tapped || kwOf(c).includes('守护');
}

function colorNeed(card) {
  const c = (card && card.cost) || {};
  if (c.colors && !c.colors.__single) {
    const out = {};
    for (const k of Object.keys(c.colors)) out[k] = c.colors[k];
    return out;
  }
  const n = (c.colors && c.colors.__single) || c.colored || 0;
  return n > 0 && card.color ? { [card.color]: n } : {};
}

/** 手牌有色费需求 −（浮动灵能＋未横置灵质）的正缺口，用于决定设灵质的颜色。 */
function colorGap(view) {
  const me = view.me;
  const avail = {};
  for (const k of Object.keys(me.mana || {})) avail[k] = me.mana[k] || 0;
  for (const c of me.essence || []) if (!c.tapped) avail[c.color] = (avail[c.color] || 0) + 1;
  const need = {};
  for (const c of me.hand || []) {
    for (const [col, n] of Object.entries(colorNeed(c))) need[col] = (need[col] || 0) + n;
  }
  const gap = {};
  for (const k of Object.keys(need)) gap[k] = Math.max(0, need[k] - (avail[k] || 0));
  return gap;
}

// ───────────────────────── 入口 ─────────────────────────

export function choose(view, moves) {
  try {
    const pick = decide(view, moves);
    if (pick && moves.some((m) => m === pick)) return pick;
  } catch (e) {
    // 评分异常时退回让过
  }
  return passOf(moves) || moves[moves.length - 1];
}

function decide(view, moves) {
  if (view.over) return passOf(moves);

  // 灵体检视：免费加入手牌（本卡组无 ST 收益，揭示只亏 1 费）
  if (view.inspect && view.inspect.uid) {
    const take = moves.find((m) => m.type === 'inspectTake');
    if (take) return take;
    return moves.find((m) => m.type === 'inspectReveal') || moves[0];
  }

  const cb = view.combat;
  if (cb) {
    if (cb.stage === 'attackers') return pickAttack(view, moves);
    if (cb.stage === 'support') return pickSupport(view, moves);
    if (cb.stage === 'blockers') return pickBlock(view, moves);
    if (cb.stage === 'order') return moves.find((m) => m.type === 'orderBlockers') || moves[0];
    return passOf(moves);
  }

  // 响应窗口（对方回合或连锁未空）：只让过，保留费用
  const iAmActive = view.active === view.me.idx;
  const responding = !iAmActive || (view.chain && view.chain.length > 0);
  const isMain = view.phase === 'main1' || view.phase === 'main2';
  if (!isMain || responding) return passOf(moves);

  return pickMain(view, moves);
}

// ───────────────────────── 攻击宣告 ─────────────────────────

function pickAttack(view, moves) {
  // 回合越晚越激进，防止马拉松；速攻模式天然激进
  let threshold = view.mode === 'blitz' ? 4 : 6;
  if (view.turn > 10) threshold = 3;
  if (view.turn > 16) threshold = 1;
  let best = null;
  let bestScore = threshold;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const s = attackScore(view, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

function attackScore(view, m) {
  const me = view.me, opp = view.opp;
  const a = me.field.find((c) => c.uid === m.uid);
  if (!a) return -1;
  const kw = kwOf(a);
  const aAtk = atkOf(a), aImp = impOf(a), aHpLeft = hpLeft(a);
  const oppBlockers = opp.field.filter((c) => isUnit(c) && canBlockMe(c));

  if (m.target === 'spirit') {
    // 直接终结
    if (!oppBlockers.length && aImp >= opp.life) return 1000;
    if (!oppBlockers.length) return 26 * aImp;
    const clearable = oppBlockers.every((c) => aAtk >= hpLeft(c));
    if (kw.includes('超冲击') && clearable) return 16 * aImp + 20;
    if (aImp >= 2 && clearable) return 10 * aImp + 6;
    return 4 * aImp;
  }

  const t = opp.field.find((c) => c.uid === m.target);
  if (!t) return -1;
  const tHpLeft = hpLeft(t);
  const kill = aAtk >= tHpLeft;
  const tVal = valueOf(t);
  let s;
  if (kill) s = tVal + 10;
  else s = Math.min(aAtk / Math.max(tHpLeft, 1), 1) * tVal * 0.5;
  // 反击风险：会被反死且自己先攻不占优
  const tAtk = atkOf(t);
  const iFirst = kw.includes('先攻') && !kwOf(t).includes('先攻');
  if (tAtk >= aHpLeft && !iFirst) s -= valueOf(a) * 0.7;
  // 换掉对方最后一个战斗单位 = 解锁打脸
  if (kill && oppBlockers.length === 1) s += 8;
  return s;
}

// ───────────────────────── 支援（暴击指示物） ─────────────────────────

function pickSupport(view, moves) {
  const cb = view.combat;
  const sup = moves.find((m) => m.type === 'supportSpirit');
  if (sup && cb) {
    const me = view.me, opp = view.opp;
    const a = me.field.find((c) => c.uid === cb.attackerUid);
    if (a && cb.target === 'spirit') {
      const oppBlockers = opp.field.filter((c) => isUnit(c) && canBlockMe(c));
      if (!oppBlockers.length) return sup;
      const clearable = oppBlockers.every((c) => atkOf(a) >= hpLeft(c));
      if (kwOf(a).includes('超冲击') && clearable) return sup;
    }
  }
  return passOf(moves);
}

// ───────────────────────── 阻挡（toggle：必须过滤已宣告者） ─────────────────────────

function pickBlock(view, moves) {
  const cb = view.combat;
  const chosen = (cb && cb.blockers) || [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  let best = null;
  let bestScore = 0.5;
  for (const m of fresh) {
    if (m.type !== 'block') continue;
    const s = blockScore(view, m, chosen);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  if (best) return best;
  return fresh.find((m) => m.type === 'pass') || passOf(moves) || moves[0];
}

function blockScore(view, m, chosen) {
  const cb = view.combat, me = view.me, opp = view.opp;
  const atk = opp.field.find((c) => c.uid === cb.attackerUid);
  const b = me.field.find((c) => c.uid === m.uid);
  if (!atk || !b) return -1;
  const aAtk = atkOf(atk);
  const aHpLeft = hpLeft(atk);
  const aImp = impOf(atk);
  const aVal = valueOf(atk);

  // 已宣告阻挡者的吸收能力与反击总和
  let absorbed = 0;
  let chosenCounter = 0;
  for (const uid of chosen) {
    const c = me.field.find((x) => x.uid === uid);
    if (c) { absorbed += hpLeft(c); chosenCounter += atkOf(c); }
  }

  const bHpLeft = hpLeft(b);
  const bAtk = atkOf(b);
  const bVal = valueOf(b);
  const dmg = Math.max(0, aAtk - absorbed); // 近似：新挡位承担溢出伤害
  const wouldDie = dmg >= bHpLeft;
  const loss = wouldDie ? bVal : (dmg / 1000) * 0.4;

  const alreadyKilled = chosenCounter >= aHpLeft;
  let killMargin = 0;
  if (!alreadyKilled) {
    const counterAfter = chosenCounter + (wouldDie ? 0 : bAtk);
    if (counterAfter >= aHpLeft) killMargin = aVal + 8 + aImp * 3;
    else killMargin = (Math.min(bAtk, aHpLeft - chosenCounter) / 1000) * 0.5;
  }

  // 脸面/目标保全只在还没有任何挡位时计价（有挡位后攻击者伤害打挡位）
  let protect = 0;
  if (!alreadyKilled && chosen.length === 0) {
    if (cb.target === 'spirit') {
      protect = aImp * 6 + (aImp >= me.life ? 400 : 0);
    } else {
      const t = me.field.find((x) => x.uid === cb.target);
      if (t) protect = aAtk >= hpLeft(t) ? valueOf(t) : valueOf(t) * 0.2;
    }
  }

  return killMargin + protect - loss;
}

// ───────────────────────── 主要阶段 ─────────────────────────

const CORE = ['森林战将', '王牌巨象', '丰收', '圣光打击'];

function pickMain(view, moves) {
  let best = null;
  let bestScore = 0.5;
  for (const m of moves) {
    if (m.type === 'pass' || m.type === 'tapEssence') continue; // 永不主动产费
    let s = -1;
    if (m.type === 'play') s = playScore(view, m);
    else if (m.type === 'setEssence') s = essenceScore(view, m);
    else if (m.type === 'spiritSpecial') s = spiritSpecialScore(view);
    else if (m.type === 'spiritDraw') s = spiritDrawScore(view);
    else if (m.type === 'ability') s = abilityScore(view, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves) || moves[moves.length - 1];
}

function playScore(view, m) {
  const me = view.me;
  const card = (me.hand || []).find((c) => c.uid === m.uid);
  if (!card) return -1;
  if (card.type === '灵像') return creatureScore(view, card);
  return spellScore(view, m, card);
}

function creatureScore(view, card) {
  const me = view.me, opp = view.opp;
  const kw = kwOf(card);
  let s = 10 + ((card.attack || 0) + (card.vitality || 0)) / 1000 + (card.impact || 0) * 6;
  if (kw.includes('预制')) s += 4;
  if (kw.includes('践踏')) s += 3;
  if (kw.includes('超冲击')) s += 6;
  if (kw.includes('守护')) s += 5;
  if (kw.includes('自愈')) s += 3;
  if ((card.impact || 0) >= 2) s += 8;
  const name = card.name;
  if (name === '森林战将' || name === '王牌巨象') s += 12; // 终结者
  if (name === '幼苗守望者' || name === '部落祭司') s += me.essence.length < 8 ? 13 : 5;
  if (name === '光能守护者' || name === '晨祷侍从' || name === '守林圣骑士') {
    const oppAtk = opp.field.reduce((n, c) => n + (isUnit(c) ? atkOf(c) : 0), 0);
    if (oppAtk > 0) s += 5;
  }
  if (me.hand.length >= 6) s += 3; // 防爆手牌
  return s;
}

function spellScore(view, m, card) {
  const me = view.me, opp = view.opp;
  const name = card.name;
  if (name === '丰收') return me.essence.length < 6 ? 36 : 26;
  if (name === '自然生长') return me.essence.length < 7 ? 28 : 18;
  if (name === '圣光打击') return strikeScore(view, m.targets);
  if (name === '治愈灵光') {
    const warn = view.mode === 'blitz' ? 4 : 6;
    return me.life <= warn ? 20 : me.life <= warn + 2 ? 10 : 3;
  }
  if (name === '生命之泉') {
    const hurt = me.field.some((c) => (c.damage || 0) >= 2000);
    return (hurt ? 12 : 4) + (me.essence.length < 7 ? 6 : 0);
  }
  if (name === '根须缠绕') {
    const maxAtk = Math.max(0, ...opp.field.map((c) => atkOf(c)));
    return maxAtk >= 2500 ? 14 + maxAtk / 2000 : 6;
  }
  if (name === '生命灌注') {
    const fragile = me.field.some((c) => isUnit(c) && (c.damage || 0) >= 1500 && hpLeft(c) <= 2000);
    return fragile ? 9 : 2;
  }
  return 8;
}

function strikeScore(view, targets) {
  const opp = view.opp;
  let s = 0;
  for (const uid of (targets || [])) {
    if (typeof uid !== 'string') continue;
    const t = opp.field.find((c) => c.uid === uid);
    if (!t) continue; // 不打自己人
    if (5000 >= hpLeft(t)) s += valueOf(t) + 12;
    else s += 2;
  }
  return s || 1;
}

function essenceScore(view, m) {
  const me = view.me;
  if ((me.hand || []).length < 2) return -1; // 保手牌
  const card = me.hand.find((c) => c.uid === m.uid);
  if (!card) return -1;
  const gap = colorGap(view);
  let s = 22;
  if ((gap[card.color] || 0) > 0) s += 9; // 补最缺的颜色
  s -= ((card.cost && card.cost.total) || 0) * 1.5; // 优先沉低费卡
  if (CORE.includes(card.name)) s -= 12; // 核心卡别沉
  if (me.hand.length <= 3) s -= 8;
  if ((me.turnCount || 0) <= 3) s += 4; // 早期跳费优先
  return s;
}

function spiritSpecialScore(view) {
  const me = view.me;
  const n = (me.hand || []).length;
  if (n >= 3) return me.essence.length < 8 ? 30 : 24; // 一换一：低费手牌→灵质＋抽 1
  if (n === 2) return 14;
  return -1;
}

function spiritDrawScore(view) {
  const n = (view.me.hand || []).length;
  if (n >= 6) return -1;
  const eager = view.mode === 'grand' ? 5 : 3;
  if (n <= eager) return 16;
  return 8;
}

function abilityScore(view, m) {
  const me = view.me;
  const name = m.name;
  if (name === '森林守卫者') {
    const gap = colorGap(view);
    return (gap['绿'] || 0) > 0 ? 14 : -1; // 缺绿费才横置产费
  }
  if (name === '藤蔓编织者') {
    const targets = (m.targets || []);
    const good = targets.some((uid) => {
      const c = me.field.find((x) => x.uid === uid);
      return c && (c.damage || 0) > 0 && hpLeft(c) <= 2000 && atkOf(c) >= 2000;
    });
    return good ? 7 : 1;
  }
  if (name === '圣光聚合体') {
    // 质密：横置把自己置于生命卡组顶 = 换 1 血，终局救命用
    const warn = view.mode === 'blitz' ? 4 : 5;
    return me.life <= warn ? 22 : -1;
  }
  return -1;
}
