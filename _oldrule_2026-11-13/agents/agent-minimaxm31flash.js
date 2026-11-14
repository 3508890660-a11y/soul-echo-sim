/**
 * 策略名称：熔线回响（Burn Line Echo）
 * 选择理由：速攻对局生命只有 6，迟疑一回合就等于送对手一张救场牌。
 *           这套用 1 费「火焰鸟」与 3 费「烈焰斗士」两张敏捷单位持续压脸，
 *           用 2 费混色「燃魂」（红1黑1，2 点生命直伤）负责收割，
 *           再用「血怒」与灵体「余烬执火者」把单个攻击者的冲击堆到 3—4 点，
 *           目标是在第 5—6 回合把对手生命卡组打空。
 * 主责模式：blitz
 */

export const meta = {
  id: 'minimaxm31flash',
  model: 'MiniMax M3.1flash',
  modelId: 'minimax-m3.1-flash',
  name: '熔线回响',
  desc: '速攻局用低费敏捷单位压脸、2 费「燃魂」直伤抢节奏，第 5—6 回合打空对手生命卡组。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

/* 主卡组 55 张：红 31（含混色「燃魂」4）、黑 12（含混色「燃魂」4）、灰 15（不计入 duo 配色）。
   恰好两种非灰颜色且各覆盖 ≥10 张，duo 模式同样合法。 */
export const deck = {
  // ── 红系：低费身体、冲击强化、直伤终结 ──
  '地狱犬': 4,
  '火焰鸟': 4,
  '烈焰斗士': 4,
  '血怒': 4,
  '烈焰之力': 2,
  '爆燃': 1,
  '焚尽': 2,
  '火球术': 2,
  '烈焰聚合体': 3,
  '烈焰战将': 1,
  '燃魂': 4,
  // ── 黑系：牺牲、回收、暴击引擎（只留 8 张，混色「燃魂」另计 4 张）──
  '自杀式袭击': 2,
  '灵质榨取': 2,
  '灵魂交易': 2,
  '骸骨祭坛': 2,
  // ── 灰系：万能零件、灵质燃料与补牌 ──
  '新人冒险者': 3,
  '流浪佣兵': 2,
  '荒原狼': 1,
  '混沌打击': 2,
  '混沌冲击': 4,
  '混沌聚合体': 1,
  '巨石守卫': 1,
  '黑市商人': 2,
};

export const spirit = '余烬执火者';
export const color = '红';

/* ───────────────────────── 静态资料 ───────────────────────── */

const DECK_TOTAL = { ...deck };

/* 单卡价值（用于「牺牲谁」「牺牲哪张牌」的取舍） */
const CARD_VALUE = {
  '地狱犬': 22, '火焰鸟': 17, '烈焰斗士': 26, '烈焰聚合体': 4, '荒原狼': 18,
  '流浪佣兵': 12, '新人冒险者': 8, '巨石守卫': 24, '食魂者': 16, '骸骨祭坛': 18,
  '烈焰战将': 30, '燃魂': 30, '焚尽': 28, '火球术': 24, '血怒': 24,
  '烈焰之力': 16, '爆燃': 10, '混沌冲击': 18, '混沌打击': 12, '自杀式袭击': 16,
  '灵质榨取': 18, '灵魂交易': 16, '黑市商人': 18, '混沌聚合体': 6,
};
/* 战意价值极低的牌：最适合当灵质燃料 */
const JUNK = new Set(['烈焰聚合体', '新人冒险者', '流浪佣兵', '混沌打击', '混沌聚合体', '爆燃']);
/* 关键牌：几乎不拿去当灵质 */
const KEY = new Set([
  '燃魂', '焚尽', '火球术', '血怒', '骸骨祭坛', '灵魂交易',
  '灵质榨取', '地狱犬', '烈焰斗士', '烈焰战将', '烈焰之力', '火焰鸟',
]);

/* ───────────────────────── 基础工具 ───────────────────────── */

const hasKw = (u, k) => !!(u && u.keywords && u.keywords.indexOf(k) >= 0);
const unitsOf = (list) => (list || []).filter((u) => u && u.type === '灵像');
const fallback = (moves) => moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

function findHand(view, uid) {
  const hand = view.me.hand || [];
  for (const h of hand) if (h.uid === uid) return h;
  return null;
}

function findField(list, uid) {
  const f = list || [];
  for (const u of f) if (u.uid === uid) return u;
  return null;
}

/** 场上单位的综合价值：面板 + 冲击 + 关键字 */
function unitValue(u) {
  if (!u) return 0;
  let v = (u.atk || 0) / 500 + (u.hp || 0) / 500 + (u.imp || 0) * 6;
  if (hasKw(u, '敏捷')) v += 6;
  if (hasKw(u, '守护')) v += 5;
  if (hasKw(u, '预制')) v += 4;
  if (hasKw(u, '先攻')) v += 4;
  if (hasKw(u, '超冲击')) v += 5;
  if (hasKw(u, '践踏')) v += 2;
  if (hasKw(u, '灵气')) v += 4;
  if (u.tapped) v *= 0.55;
  return v;
}

/** 敌方单位对我方的威胁值 */
function threatValue(u) {
  if (!u) return 0;
  let t = (u.atk || 0) / 300 + (u.imp || 0) * 5;
  if (hasKw(u, '敏捷')) t += 5;
  if (hasKw(u, '先攻')) t += 4;
  if (hasKw(u, '践踏')) t += 3;
  if (hasKw(u, '超冲击')) t += 3;
  if (u.type === '灵性') t += 4;
  return t;
}

/** 灵能池：已产未花 + 未横置灵质（每张灵质每回合产 1 点同色灵能）
 *  引擎里 p.mana 可能被扣成负数（用灵质付費时），负数部分要归零。 */
function manaPool(view) {
  const pool = {};
  const m = view.me.mana || {};
  for (const k of Object.keys(m)) pool[k] = m[k] > 0 ? m[k] : 0;
  for (const e of view.me.essence || []) {
    if (!e.tapped) pool[e.color] = (pool[e.color] || 0) + 1;
  }
  return pool;
}

function poolTotal(pool) {
  let t = 0;
  for (const k of Object.keys(pool)) if (pool[k] > 0) t += pool[k];
  return t;
}

/** 卡的费用拆成「有色费 + 灰费」 */
function costParts(card) {
  const c = card.cost || {};
  if (c.colors && !c.colors.__single) return { colors: { ...c.colors }, grey: c.grey || 0 };
  const n = c.colored || 0;
  return { colors: n > 0 ? { [card.color]: n } : {}, grey: c.grey || 0 };
}

/** 与引擎 manaPlan 同口径的可负担判断：有色费必须同色，灰费可由任意颜色支付 */
function canAfford(card, pool) {
  const { colors, grey } = costParts(card);
  const left = { ...pool };
  for (const c of Object.keys(colors)) {
    left[c] = (left[c] || 0) - colors[c];
    if (left[c] < 0) return false;
  }
  let total = 0;
  for (const k of Object.keys(left)) if (left[k] > 0) total += left[k];
  return total >= grey;
}

function colorCount(list, color) {
  let n = 0;
  for (const u of list || []) if (u.color === color) n += 1;
  return n;
}

/** 这一击能不能直接赢：生命卡组翻空后还需再吃 1 点 */
function lethalBonus(dmg, oppLife) {
  if (dmg >= oppLife + 1) return 600;
  if (dmg >= oppLife) return 150;
  return 0;
}

/** 我还能看到多少张同名牌在牌库里（用于判断牺牲一张是否心疼） */
function copiesLeft(view, name) {
  let seen = 0;
  for (const zone of ['hand', 'essence', 'field', 'grave', 'armor']) {
    for (const c of view.me[zone] || []) if (c.name === name) seen += 1;
  }
  return (DECK_TOTAL[name] || 0) - seen;
}

/* ───────────────────────── 目标挑选 ───────────────────────── */

/** 燃魂/自杀式袭击这类「牺牲自己单位」的效果：挑价值最低的那个 */
function pickVictim(view, targets) {
  const field = view.me.field || [];
  let best = null;
  let bestV = Infinity;
  for (const uid of targets || []) {
    const u = findField(field, uid);
    if (!u || u.type !== '灵像') continue;
    const v = unitValue(u);
    if (v < bestV) { bestV = v; best = u; }
  }
  return best;
}

/** 伤害类灵感：优先打对方的单位 */
function pickDamageTarget(view, targets) {
  const foe = view.opp.field || [];
  const mine = view.me.field || [];
  let best = null;
  let bestScore = -Infinity;
  for (const uid of targets || []) {
    const isFoe = !!findField(foe, uid);
    const u = isFoe ? findField(foe, uid) : findField(mine, uid);
    if (!u) continue;
    const s = isFoe ? threatValue(u) : -60;
    if (s > bestScore) { bestScore = s; best = u; }
  }
  return best;
}

/**
 * 冲击强化（血怒/烈焰之力/灵体余烬执火者）的目标：
 * 优先「预制」单位（一定可攻击），其次选不是最后进场的那张。
 * view 里没有 enteredTurn，只能靠战场顺序近似判断召唤失调。
 */
function pickBuffTarget(view, targets) {
  const field = view.me.field || [];
  const lastUid = field.length ? field[field.length - 1].uid : null;
  const cands = [];
  for (const uid of targets || []) {
    const u = findField(field, uid);
    if (u && u.type === '灵像' && (u.imp || 0) >= 1) cands.push(u);
  }
  if (!cands.length) return null;
  const pre = cands.filter((u) => hasKw(u, '预制'));
  const notLast = cands.filter((u) => u.uid !== lastUid);
  const pool = pre.length ? pre : (notLast.length ? notLast : cands);
  pool.sort((a, b) => ((b.imp || 0) * 10 + (b.atk || 0) / 500) - ((a.imp || 0) * 10 + (a.atk || 0) / 500));
  const u = pool[0];
  // 场上只有这一张、又是非预制、又在前两回合：多半是本回合刚进场，buff 会白费
  const sick = u.uid === lastUid && !hasKw(u, '预制') && cands.length === 1 && view.turn <= 2;
  return { u, canAttack: !sick };
}

/* ───────────────────────── 出牌评分 ───────────────────────── */

function scorePlay(view, m) {
  const me = view.me;
  const opp = view.opp;
  const card = findHand(view, m.uid);
  if (!card) return -100;
  const name = card.name;
  const targets = m.targets || [];
  const mode = m.mode || 'main';
  const oppLife = opp.life || 0;
  const myUnits = unitsOf(me.field);
  const foeUnits = unitsOf(opp.field);
  const lateGame = view.phase === 'main2';
  let s = 0;

  switch (name) {
    /* ── 直伤系 ── */
    case '燃魂': {
      s = 94 + lethalBonus(2, oppLife);
      const victim = pickVictim(view, targets);
      if (victim) {
        s -= unitValue(victim) * 0.7;
        if (victim.name === '烈焰战将') s += 26;   // 终曲再给 1 点
      }
      break;
    }
    case '混沌冲击':
      s = 54 + lethalBonus(1, oppLife);
      break;
    case '火球术':
      s = 90 + lethalBonus(2, oppLife);
      break;
    case '焚尽': {
      const empty = (me.field || []).length === 0;
      const dmg = empty ? 4 : 3;
      s = 118 + (empty ? 40 : 0) + lethalBonus(dmg, oppLife);
      break;
    }
    /* ── 冲击强化系 ── */
    case '血怒': {
      if (lateGame) { s = 0; break; }
      const t = pickBuffTarget(view, targets);
      if (!t) { s = 0; break; }
      s = t.canAttack ? 48 : 10;
      break;
    }
    case '烈焰之力': {
      if (lateGame) { s = 0; break; }
      const t = pickBuffTarget(view, targets);
      if (!t) { s = 0; break; }
      s = (t.canAttack ? 30 : 8) - unitValue(t.u) * 0.45;
      break;
    }
    /* ── 伤害/解场系 ── */
    case '爆燃': {
      const t = pickDamageTarget(view, targets);
      if (!t || !findField(opp.field, t.uid)) { s = 3; break; }
      const total = (t.damage || 0) > 0 ? 3000 : 1000;
      const lethal = (t.hp - (t.damage || 0)) <= total;
      s = lethal ? 30 + threatValue(t) * 0.5 : 6;
      break;
    }
    case '混沌打击': {
      const t = pickDamageTarget(view, targets);
      if (!t || !findField(opp.field, t.uid)) { s = 3; break; }
      const lethal = (t.hp - (t.damage || 0)) <= 2000;
      s = lethal ? 34 + threatValue(t) * 0.6 : 9;
      break;
    }
    case '自杀式袭击': {
      const victim = pickVictim(view, targets);
      const foe = findField(opp.field, targets[1]);
      s = 24;
      if (victim) s -= unitValue(victim) * 0.6;
      if (foe) s += threatValue(foe) * 0.6 + (foe.type === '灵性' ? 16 : 0);
      else s -= 16;
      break;
    }
    /* ── 引擎/资源系 ── */
    case '灵质榨取': {
      const handSize = (me.hand || []).length;
      s = mode === 'bury' ? 24 : 9;
      if (handSize <= 3) s += 16;
      if (handSize >= 6) s -= 8;
      break;
    }
    case '灵魂交易': {
      const g = findField(me.grave, targets[0]);
      s = 8 + (g ? (CARD_VALUE[g.name] || 10) * 0.9 : 0);
      break;
    }
    case '骸骨祭坛': {
      const already = (me.field || []).filter((u) => u.name === '骸骨祭坛').length;
      s = already === 0 ? 26 : (already === 1 ? 16 : 5);
      break;
    }
    case '食魂者':
      s = 22;
      break;
    case '黑市商人':
      s = 22;
      break;
    /* ── 身体系：速攻里身体就是持续的伤害来源 ── */
    case '荒原狼': s = 28; break;
    case '流浪佣兵': s = 24; break;
    case '新人冒险者': s = 30; break;
    case '地狱犬': s = 46; break;             // 预制：进场即可攻击
    case '烈焰斗士': s = 44; break;          // 预制 + 敏捷 + 先攻
    case '火焰鸟': s = 40; break;            // 敏捷 + 威慑
    case '烈焰聚合体': s = 6; break;         // 500/500 的身体没有意义
    case '巨石守卫': s = 34; break;          // 冲击 2
    case '烈焰战将': s = 42; break;          // 冲击 2 + 超冲击 + 终曲
    default:
      s = 12;
  }

  /* 身体的边际价值随场面调整：对面单位多就多补身体，别无脑铺场 */
  if (myUnits.length && (name === '荒原狼' || name === '流浪佣兵' || name === '新人冒险者'
    || name === '地狱犬' || name === '烈焰斗士' || name === '火焰鸟' || name === '巨石守卫'
    || name === '食魂者' || name === '烈焰战将')) {
    s += Math.min(10, foeUnits.length - myUnits.length);
  }
  return s;
}

/* ───────────────────────── 设灵质评分 ───────────────────────── */

/** 一张牌的长期价值（用于比较「牺牲它换灵能」划不划算） */
function roughPlayValue(name) {
  switch (name) {
    case '燃魂': return 60;
    case '焚尽': return 55;
    case '火球术': return 45;
    case '烈焰斗士': return 44;
    case '地狱犬': return 40;
    case '烈焰战将': return 40;
    case '血怒': return 38;
    case '火焰鸟': return 34;
    case '混沌冲击': return 34;
    case '灵魂交易': return 30;
    case '骸骨祭坛': return 30;
    case '灵质榨取': return 26;
    case '巨石守卫': return 26;
    case '荒原狼': return 26;
    case '黑市商人': return 24;
    case '烈焰之力': return 24;
    case '食魂者': return 22;
    case '流浪佣兵': return 20;
    case '混沌打击': return 18;
    case '爆燃': return 14;
    case '新人冒险者': return 14;
    case '烈焰聚合体': return 3;
    case '混沌聚合体': return 3;
    default: return 12;
  }
}

/* 手上出现这些黑牌时，值得专门留一张黑色灵质（「燃魂」要红1黑1） */
const BLACK_USEFUL = new Set(['燃魂', '自杀式袭击', '灵魂交易', '灵质榨取']);

function scoreSetEssence(view, m) {
  const me = view.me;
  const card = findHand(view, m.uid);
  if (!card) return -100;
  const hand = me.hand || [];
  const pool = manaPool(view);
  const blackEss = colorCount(me.essence, '黑');

  /* 把这张牌变成灵质之后，本回合我能多打出什么？
     注意这部分只按折扣计入——这些牌本来迟早也会打出去，
     真正无法挽回的损失是「被牺牲掉的那张牌本身」。 */
  const pool2 = { ...pool };
  pool2[card.color] = (pool2[card.color] || 0) + 1;
  const wanted = [];
  for (const h of hand) {
    if (h.uid === card.uid) continue;
    if (!canAfford(h, pool2)) continue;
    wanted.push(roughPlayValue(h.name));
  }
  wanted.sort((a, b) => b - a);
  const gain = Math.min(30, (wanted[0] || 0) + (wanted[1] || 0) * 0.4);

  const cost = roughPlayValue(card.name);
  let s = 12 + gain * 0.25 - cost;

  /* 优先拿废牌当燃料，别动主力 */
  if (JUNK.has(card.name)) s += 10;
  if (KEY.has(card.name)) s -= 20;

  /* 颜色：灵质区的颜色决定了这一回合能打出什么牌。
     规则是「补最缺的那种灵能」——按手上想打的牌的需求 + 红50/黑25/灰25 的配比缺口打分。 */
  const ess = me.essence || [];
  const total = ess.length + 1;
  const demand = { '红': 0, '黑': 0, '灰': 0 };
  let totalDemand = 0;
  for (const h of hand) {
    if (h.uid === card.uid) continue;
    const v = roughPlayValue(h.name);
    demand[h.color] = (demand[h.color] || 0) + v;
    totalDemand += v;
  }
  const share = {
    '红': colorCount(ess, '红') / total,
    '黑': colorCount(ess, '黑') / total,
    '灰': colorCount(ess, '灰') / total,
  };
  const TARGET_SHARE = { '红': 0.5, '黑': 0.25, '灰': 0.25 };
  const deficit = Math.max(0, TARGET_SHARE[card.color] - share[card.color]);
  const want = totalDemand ? demand[card.color] / totalDemand : 0;
  s += deficit * 70 + want * 26 - 12;

  if (cost >= 40) s -= 8;           // 主力牌不做燃料
  if (hand.length <= 2) s -= 8;     // 手牌见底时先留着
  return s;
}

/* ───────────────────────── 其他动作评分 ───────────────────────── */

function scoreAbility(view, m) {
  const me = view.me;
  const u = findField(me.essence, m.uid) || findField(me.field, m.uid);
  const name = u ? u.name : '';
  if (name === '混沌聚合体') return 6;   // +1 灰色灵能
  if (name === '烈焰聚合体') {
    /* 引擎里「烈焰聚合体」的目标是场上任意单位：指向对手的单位，
       就能在回合结束时把它销毁——这是一次白嫖的解场。 */
    const foe = pickAbilityFoe(view, m.targets || []);
    if (!foe) return 2;
    return 34 + threatValue(foe) * 0.5;
  }
  return 3;
}

/** 烈焰聚合体启动：挑对手场上最该消失的单位 */
function pickAbilityFoe(view, targets) {
  const foe = view.opp.field || [];
  let best = null;
  let bestScore = -Infinity;
  for (const uid of targets || []) {
    const u = findField(foe, uid);
    if (!u) continue;
    const s = threatValue(u) + (u.type === '灵性' ? 10 : 0);
    if (s > bestScore) { bestScore = s; best = u; }
  }
  return best;
}

function scoreSpiritSpecial(view, m) {
  if (view.phase === 'main2') return 0;   // 战斗已过，buff 会白费
  const t = pickBuffTarget(view, m.targets || []);
  if (!t || !t.canAttack) return 0;
  return 60;
}

function scoreSpiritDraw(view, m) {
  const handSize = (view.me.hand || []).length;
  let s = 16;
  if (handSize <= 3) s += 12;
  if (handSize >= 6) s -= 6;
  return s;
}

/* ───────────────────────── 战斗阶段决策 ───────────────────────── */

function decideAttack(view, moves, pass) {
  const attackMoves = moves.filter((m) => m.type === 'attack');
  if (!attackMoves.length) return pass;
  const me = view.me;
  const opp = view.opp;
  const field = me.field || [];
  const foeUnits = unitsOf(opp.field);
  const canBlockAgile = foeUnits.some((u) => hasKw(u, '敏捷') || (u.tapped && hasKw(u, '守护')));
  let maxBlockHp = 0;
  for (const u of foeUnits) {
    const left = (u.hp || 0) - (u.damage || 0);
    if (left > maxBlockHp) maxBlockHp = left;
  }

  const seen = {};
  const uids = [];
  for (const m of attackMoves) {
    if (!seen[m.uid]) { seen[m.uid] = true; uids.push(m.uid); }
  }

  const cands = [];
  for (const uid of uids) {
    const u = findField(field, uid);
    if (!u) continue;
    cands.push({
      uid,
      u,
      imp: u.imp || 0,
      atk: u.atk || 0,
      /* 敏捷攻击者只有对方有敏捷或横置守护时才挡得住 */
      unblockable: hasKw(u, '敏捷') && !canBlockAgile,
      /* 能打死对方任意一块阻挡者：逼对方用掉一块肉 */
      killer: maxBlockHp > 0 && (u.atk || 0) >= maxBlockHp,
    });
  }
  if (!cands.length) return pass;

  const free = cands.filter((c) => c.unblockable);
  const killers = cands.filter((c) => c.killer);
  const overwhelming = cands.length > foeUnits.length;

  let pick = null;
  if (free.length) {
    /* 挡不住的攻击者：直接打脸，冲击最大的先上 */
    free.sort((a, b) => b.imp - a.imp || b.atk - a.atk);
    pick = free[0];
  } else if (overwhelming) {
    /* 我方攻击者多于对方阻挡者：用最弱的去换掉对方的阻挡，最强的留到能连上 */
    const weakFirst = cands.slice().sort((a, b) => a.imp - b.imp || a.atk - b.atk);
    pick = weakFirst[0];
  } else if (killers.length) {
    killers.sort((a, b) => b.imp - a.imp || b.atk - a.atk);
    pick = killers[0];
  } else {
    /* 必被挡、且换不掉对方任何单位：这一回合先不打，把身材留到下一回合 */
    return pass;
  }

  const options = attackMoves.filter((m) => m.uid === pick.uid);
  const face = options.find((m) => m.target === 'spirit');
  return face || options[0] || pass;
}

function decideBlock(view, moves, pass) {
  const blocks = moves.filter((m) => m.type === 'block');
  if (!blocks.length) return pass;
  const cb = view.combat || {};
  const already = cb.blockers || [];
  const atk = findField(view.opp.field, cb.attackerUid);
  if (!atk) return already.length ? pass : (blocks[0] || pass);

  const me = view.me;
  const cands = [];
  for (const m of blocks) {
    if (already.indexOf(m.uid) >= 0) continue;      // 已宣告过的再选一次是取消阻挡
    const u = findField(me.field, m.uid);
    if (u) cands.push({ m, u });
  }
  if (!cands.length) return pass;

  let best = null;
  let bestScore = 0;
  for (const c of cands) {
    let s = (atk.imp || 0) * 16;                       // 挡下来就免掉的伤害
    if ((c.u.atk || 0) >= (atk.hp || 0)) s += 55;       // 反杀
    if ((c.u.hp || 0) > (atk.atk || 0)) s += 12;        // 我活下来
    else s -= unitValue(c.u) * 0.55;                   // 我会死，亏身材
    if (s > bestScore) { bestScore = s; best = c.m; }
  }
  if (!best) return pass;

  /* 已经挡了一个，且两个阻挡者的攻击力能反杀对方大攻击者时，再补一个 */
  if (already.length === 1) {
    const first = findField(me.field, already[0]);
    const need = (atk.hp || 0) - ((first ? first.atk : 0) + (best.u.atk || 0));
    const worth = (atk.atk || 0) >= 3000 && need <= 0
      && (first ? unitValue(first) : 0) < 26;
    if (worth) return best;
    return pass;
  }
  if (already.length >= 2) return pass;
  return best;
}

function decideOrder(view, moves, pass) {
  const cb = view.combat || {};
  const ids = (cb.blockers || []).slice();
  const field = view.me.field || [];
  const hpOf = (uid) => {
    const u = findField(field, uid);
    return u ? (u.hp || 0) : 0;
  };
  const sorted = ids.slice().sort((a, b) => hpOf(a) - hpOf(b));
  for (const m of moves) {
    if (!m.order || m.order.length !== sorted.length) continue;
    let ok = true;
    for (let i = 0; i < sorted.length; i += 1) if (m.order[i] !== sorted[i]) { ok = false; break; }
    if (ok) return m;
  }
  return moves[0] || pass;
}

/* ───────────────────────── 响应（连锁中）───────────────────────── */

const RESPOND_DAMAGE = { '燃魂': 2, '混沌冲击': 1, '火球术': 2, '焚尽': 3 };

function scoreRespondPlay(view, m) {
  const card = findHand(view, m.uid);
  if (!card) return -100;
  const dmg = RESPOND_DAMAGE[card.name] || 0;
  if (!dmg) return 4;
  let s = 8 + dmg * 8;
  const oppLife = view.opp.life || 0;
  if (dmg >= oppLife + 1) s += 300;
  if (card.name === '燃魂') {
    const victim = pickVictim(view, m.targets || []);
    const count = unitsOf(view.me.field).length;
    if (!victim || count < 4) return -10;   // 场面太薄时不拿自己的单位换伤害
    s -= unitValue(victim) * 0.5;
  }
  if (card.name === '焚尽' && (view.me.field || []).length !== 0) s -= 18;
  return s;
}

/* ───────────────────────── 主流程 ───────────────────────── */

function decideMain(view, moves, pass) {
  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type === 'pass') continue;
    let s = -100;
    if (m.type === 'play') s = scorePlay(view, m);
    else if (m.type === 'setEssence') s = scoreSetEssence(view, m);
    else if (m.type === 'ability') s = scoreAbility(view, m);
    else if (m.type === 'spiritSpecial') s = scoreSpiritSpecial(view, m);
    else if (m.type === 'spiritDraw') s = scoreSpiritDraw(view, m);
    else if (m.type === 'tapEssence') s = -100;   // 费用支付会自动横置，手动横置纯浪费
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pass;
}

function decideRespond(view, moves, pass) {
  let best = null;
  let bestScore = 0;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const s = scoreRespondPlay(view, m);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pass;
}

function decide(view, moves) {
  const pass = fallback(moves);

  /* 灵体检视窗口 */
  if (view.inspect) {
    if (view.inspect.card) {
      const take = moves.find((m) => m.type === 'inspectTake');
      if (take) return take;
    }
    return pass;
  }

  const cb = view.combat;
  if (cb) {
    if (cb.stage === 'blockers') return decideBlock(view, moves, pass);
    if (cb.stage === 'order') return decideOrder(view, moves, pass);
    if (cb.stage === 'support') {
      const sup = moves.find((m) => m.type === 'supportSpirit');
      if (sup) return sup;
      return pass;
    }
    if (cb.stage === 'attackers') return decideAttack(view, moves, pass);
    return pass;
  }

  if (view.phase === 'start' || view.phase === 'setup' || view.phase === 'end') return pass;

  const chain = view.chain || [];
  if (chain.length) {
    const top = chain[chain.length - 1];
    if (top && top.controller === view.me.idx) return pass;  // 我自己的牌在链上：先让过
    return decideRespond(view, moves, pass);
  }

  if (view.active === view.me.idx && (view.phase === 'main1' || view.phase === 'main2')) {
    return decideMain(view, moves, pass);
  }
  return decideRespond(view, moves, pass);
}

export function choose(view, moves) {
  if (!moves || !moves.length) return { type: 'pass' };
  try {
    const move = decide(view, moves);
    if (move && moves.indexOf(move) >= 0) return move;
    return fallback(moves);
  } catch (err) {
    return fallback(moves);
  }
}
