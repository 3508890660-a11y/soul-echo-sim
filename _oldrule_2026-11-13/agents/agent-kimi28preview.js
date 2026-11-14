/**
 * 策略名称：余烬突击（Ember Blitz）
 * 选择理由：blitz 模式生命仅 6 张、8 回合内多见决胜，低费前压与直伤的价值远高于后期。
 *   这套牌 1 费卡 24 张保证每回合有事可做，混沌冲击/火球术/焚尽/灰烬小僧终曲提供
 *   不依赖场面的斩杀线，灵体余烬执火者每回合 +1 冲击把任意 attacker 变成致胜威胁。
 * 主责模式：blitz（速攻对局）。
 *
 * 零依赖、无副作用、无模块级可变状态；所有分支都有让过兜底。
 */

export const meta = {
  id: 'kimi28preview',
  model: 'KIMI 2.8preview',
  modelId: 'kimi-k2.8-preview',
  name: '余烬突击',
  desc: '生命只有 6：用 24 张 1 费曲线抢前压，配合灵体加冲击与十数点直伤，在第 4—6 回合烧穿对手生命卡组。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // ── 红（28）：前压与直伤主轴 ──────────────
  火焰鸟: 4,        // 1费 1000/1/1000 敏捷威慑，一费最好身材
  爆燃: 4,          // 1费 1000/3000(已受伤) 去除
  地狱犬: 4,        // 2费 2000/1/2500 预制自愈
  灰烬小僧: 4,      // 2费 1500/1/1500 终曲 1 点直伤
  烈焰斗士: 4,      // 3费 3500/1/2000 预制敏捷先攻
  火球术: 4,        // 3费 2 点直伤
  血怒: 2,          // 2费 +1000~2000/+1 冲击，斩杀增益
  焚尽: 2,          // 5费 3~4 点直伤终结技
  // ── 黄（12）：辅色去除与增益，满足 duo 双色 ──
  雷霆打击: 4,      // 1费 2000 去除
  雷鸣侍从: 4,      // 2费 1500/1/2000，启动 +500 攻永久
  雷铸天兵: 4,      // 2费 +1000/+1 冲击永久增益
  // ── 灰（16）：不抢色源的填充与补刀 ─────────
  新人冒险者: 4,    // 1费 1000/1/1000
  混沌打击: 4,      // 1费 2000 去除
  混沌冲击: 4,      // 1费 1 点直伤
  流浪佣兵: 2,      // 2费 2500/1/1500
  巨石守卫: 2,      // 5费 5000/2/5000 灰色终结者（无需有色灵能）
};

export const spirit = '余烬执火者';
export const color = '红';

// ── 纯函数工具（无副作用） ───────────────────────────

const passOf = (moves) => moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

const effHp = (c) => (c ? Math.max(0, c.hp - (c.damage || 0)) : 0);

const myUnit = (view, uid) => view.me.field.find((c) => c.uid === uid);
const oppCard = (view, uid) => view.opp.field.find((c) => c.uid === uid);
const handCard = (view, uid) => view.me.hand.find((c) => c.uid === uid);

/** 对手当前能合法阻挡某攻击者的单位。 */
function legalBlockers(view, attacker) {
  const agile = attacker.keywords.includes('敏捷');
  return view.opp.field.filter((c) =>
    c.type === '灵像' &&
    (!c.tapped || c.keywords.includes('守护')) &&
    (!agile || c.keywords.includes('敏捷') || c.keywords.includes('守护')));
}

/** 直伤法术的伤害量（用于斩杀判断）。 */
function burnDamage(name, myUnits) {
  if (name === '混沌冲击') return 1;
  if (name === '火球术') return 2;
  if (name === '焚尽') return myUnits.length ? 3 : 4;
  return 0;
}

// ── 各情形决策 ────────────────────────────────────

/** 灵体检视：直接拿（牌库无 ST 值得付费揭示）。 */
function pickInspect(moves) {
  return moves.find((m) => m.type === 'inspectTake') || passOf(moves);
}

/** 宣告攻击：能斩杀必打；无阻挡打灵体；有阻挡权衡换血。 */
function pickAttack(view, moves) {
  const oppLife = view.opp.life;
  let best = null, bestScore = 3;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const u = myUnit(view, m.uid);
    if (!u) continue;
    let s;
    if (m.target === 'spirit') {
      const blockers = legalBlockers(view, u);
      if (oppLife <= u.imp) s = 100000;                       // 斩杀
      else if (!blockers.length) s = 60 + u.imp * 10;          // 无阻挡全额伤害
      else {
        const weakestHp = Math.min.apply(null, blockers.map(effHp));
        const worstAtk = Math.max.apply(null, blockers.map((b) => b.atk));
        s = u.imp * 6;                                         // 期望穿透
        if (u.atk >= weakestHp) s += 8;                        // 大概率带走一个阻挡者
        if (worstAtk >= effHp(u)) s -= u.imp * 4 + 6;          // 攻击者可能白死
      }
    } else {
      const t = oppCard(view, m.target);
      if (!t) continue;
      if (u.atk >= effHp(t)) {
        const survive = effHp(u) > t.atk;
        s = 12 + t.imp * 8 + t.atk / 500 + (t.type === '灵性' ? 6 : 0) + (survive ? 6 : -u.imp * 5);
      } else {
        s = u.imp >= 1 ? 2 : 0;
      }
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/** 支援：只在攻击无阻挡（伤害必中）或 bump 后斩杀时用暴击指示物。 */
function pickSupport(view, moves) {
  const m = moves.find((x) => x.type === 'supportSpirit');
  if (!m) return null;
  const cb = view.combat || {};
  const u = myUnit(view, cb.attackerUid);
  if (!u) return null;
  if (!legalBlockers(view, u).length) return m;
  if (view.opp.life <= u.imp + 1) return m;
  return null;
}

/** 阻挡：先保命（防斩杀），再权衡交换；已选过阻挡就不再追加。 */
function pickBlock(view, moves) {
  const cb = view.combat || {};
  if (cb.blockers && cb.blockers.length) return null;
  const atk = oppCard(view, cb.attackerUid);
  if (!atk) return null;
  const lethal = cb.target === 'spirit' && view.me.life <= atk.imp;
  let best = null, bestScore = lethal ? -1 : 5;
  for (const m of moves) {
    if (m.type !== 'block') continue;
    const b = myUnit(view, m.uid);
    if (!b) continue;
    const kill = b.atk >= effHp(atk);
    const survive = effHp(b) > atk.atk;
    let s;
    if (cb.target === 'spirit') {
      // 优先挡高冲击攻击者；能用便宜单位换就不亏节奏
      s = atk.imp * 4 + (kill ? 10 : 0) + (survive ? 5 : -3) - b.imp * 2 - b.atk / 1000;
    } else {
      const t = myUnit(view, cb.target);
      const tVal = t ? t.imp * 8 + t.atk / 500 : 0;
      s = kill ? 10 + tVal * 0.5 : (survive && tVal > 10 ? 5 : -6);
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/** 确定阻挡顺序（我是攻击方）：按剩余生命升序，最大化击杀数。 */
function pickOrder(view, moves) {
  const eff = {};
  for (const uid of (view.combat && view.combat.blockers) || []) {
    const c = oppCard(view, uid);
    eff[uid] = c ? effHp(c) : 0;
  }
  const sortedKey = [...((view.combat && view.combat.blockers) || [])]
    .sort((a, b) => (eff[a] || 0) - (eff[b] || 0)).join(',');
  for (const m of moves) {
    if (m.type === 'orderBlockers' && m.order.join(',') === sortedKey) return m;
  }
  return moves.find((m) => m.type === 'orderBlockers') || passOf(moves);
}

/** 设灵质：优先高费死牌与灰色牌，保住低费曲线和直伤。 */
function pickSetEssence(view, moves) {
  const cands = moves.filter((m) => m.type === 'setEssence');
  if (!cands.length) return null;
  const redN = view.me.hand.filter((c) => c.color === '红').length;
  const yellowN = view.me.hand.filter((c) => c.color === '黄').length;
  let best = null, bestScore = -1e9;
  for (const m of cands) {
    const c = handCard(view, m.uid);
    if (!c) continue;
    let s = (c.cost.total || 0) * 4;
    if (c.color === '灰') s += 4;
    if (c.name === '巨石守卫') s += 6;                        // 5 费灰色大哥最早也是死牌
    if (c.name === '焚尽') s += 3;                            // 终结技尽量留在手里
    if (c.color === '黄' && yellowN <= 1) s -= 6;             // 手里唯一的黄色源不能埋
    if (c.color === '红' && redN <= 1) s -= 4;
    if (burnDamage(c.name, []) || c.name === '爆燃' || c.name === '雷霆打击' || c.name === '混沌打击') s -= 9;
    if (c.type === '灵像' && (c.cost.total || 0) <= 2) s -= 6; // 低费曲线怪优先下场
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/** 给自己单位的增益（血怒/雷铸天兵/灵体专属）。 */
function buffValue(view, targetUid, bonusImp) {
  const u = myUnit(view, targetUid);
  if (!u) return -100;
  let s = 8 + (u.imp + bonusImp) * 6 + u.atk / 2000;
  if (view.opp.life <= u.imp + bonusImp) s += 8000;           // 增益后直接斩杀
  if (u.tapped) s -= 10;                                      // 横置单位当回合打不了
  return s;
}

/** 主要阶段/响应阶段通用的出牌打分。 */
function scorePlay(view, m) {
  const card = handCard(view, m.uid);
  if (!card) return -Infinity;
  const name = card.name;
  const oppLife = view.opp.life;
  const myUnits = view.me.field.filter((c) => c.type === '灵像');
  const t0 = m.targets && m.targets[0];
  const isOppTarget = !!(t0 && oppCard(view, t0));

  // 直伤：斩杀优先级最高，平时也是稳定收益
  const burn = burnDamage(name, myUnits);
  if (burn) return oppLife <= burn ? 100000 + burn : 18 + burn * 8;

  // 去除：只指向对手单位
  if (name === '爆燃') {
    const t = oppCard(view, t0);
    if (!t) return -100;
    const dmg = t.damage > 0 ? 3000 : 1000;
    return effHp(t) <= dmg ? 18 + t.imp * 6 + t.atk / 500 : 2;
  }
  if (name === '混沌打击' || name === '雷霆打击') {
    const t = oppCard(view, t0);
    if (!t) return -100;
    return effHp(t) <= 2000 ? 16 + t.imp * 6 + t.atk / 500 : 2;
  }

  // 增益
  if (name === '血怒') return buffValue(view, t0, 1);
  if (name === '雷铸天兵') return buffValue(view, t0, 1) + 2;

  // 灵像
  if (card.type === '灵像') {
    let s = 12 + card.imp * 8 + (card.atk + card.hp) / 1000;
    if (card.keywords.includes('预制')) s += 5;
    if (card.keywords.includes('敏捷')) s += 3;
    if (card.keywords.includes('先攻')) s += 3;
    if (card.keywords.includes('威慑')) s += 2;
    if (card.keywords.includes('自愈')) s += 1;
    if (name === '灰烬小僧') s += 6;                          // 终曲 1 点直伤
    if (name === '巨石守卫' && view.turn <= 5) s -= 12;       // 5 费前是死牌
    if (myUnits.length >= 3) s -= 5;                          // 场面饱和时递减
    return s;
  }
  return 4;
}

/** 自己的主要阶段：设灵质 → 出牌 → 灵体能力 → 补牌 → 让过。 */
function pickMain(view, moves) {
  const myUnits = view.me.field.filter((c) => c.type === '灵像');
  let best = null, bestScore = 4;                             // 阈值：低于 4 分就让过

  for (const m of moves) {
    if (m.type === 'play') {
      const s = scorePlay(view, m);
      if (s > bestScore) { bestScore = s; best = m; }
    } else if (m.type === 'spiritSpecial' && m.name === '余烬执火者') {
      const s = buffValue(view, m.targets && m.targets[0], 1) + 2;
      if (s > bestScore) { bestScore = s; best = m; }
    } else if (m.type === 'ability' && m.name === '雷鸣侍从') {
      // +500 攻永久，贴给冲击最高的未横置单位（目标由引擎枚举）
      const s = 7;
      if (s > bestScore) { bestScore = s; best = m; }
    } else if (m.type === 'spiritDraw') {
      // 手牌短缺或无事可做时补牌；主卡组空了不打（避免抽生命卡组）
      const s = view.me.deck > 0 ? (view.me.handCount <= 3 ? 9 : 4) : -100;
      if (s > bestScore) { bestScore = s; best = m; }
    }
  }
  if (best) return best;

  // 没有值得出的牌时设灵质（手牌太少且还有得打时不埋）
  const setMove = pickSetEssence(view, moves);
  if (setMove && (view.me.handCount >= 3 || !best)) return setMove;
  return passOf(moves);
}

/** 响应阶段（对方回合或连锁非空）：只打斩杀直伤与关键去除。 */
function pickRespond(view, moves) {
  const cb = view.combat || {};
  const myUnits = view.me.field.filter((c) => c.type === '灵像');
  let best = null, bestScore = 12;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const card = handCard(view, m.uid);
    if (!card) continue;
    const name = card.name;
    const burn = burnDamage(name, myUnits);
    if (burn) {
      const s = view.opp.life <= burn ? 100000 : 11 + burn * 2; // 对方回合烧脸收益打折
      if (s > bestScore) { bestScore = s; best = m; }
      continue;
    }
    // 战斗响应：干掉正在攻击的灵像，防斩杀或保关键单位
    const t = oppCard(view, m.targets && m.targets[0]);
    if (!t) continue;
    const isAttacker = cb.attackerUid && m.targets && m.targets[0] === cb.attackerUid;
    let dmg = 0;
    if (name === '爆燃') dmg = t.damage > 0 ? 3000 : 1000;
    else if (name === '混沌打击' || name === '雷霆打击') dmg = 2000;
    if (!dmg || effHp(t) > dmg) continue;
    let s = 10 + t.imp * 4;
    if (isAttacker && cb.target === 'spirit' && view.me.life <= t.imp) s += 9000; // 防斩杀
    else if (isAttacker) s += 4;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

// ── 入口 ─────────────────────────────────────────

export function choose(view, moves) {
  try {
    if (!view || !Array.isArray(moves) || !moves.length) return moves[moves.length - 1];
    if (view.over) return passOf(moves);
    if (view.inspect) return pickInspect(moves);

    const cb = view.combat;
    if (cb && cb.stage === 'attackers') {
      if (view.active !== view.me.idx) return passOf(moves);
      return pickAttack(view, moves) || passOf(moves);
    }
    if (cb && cb.stage === 'support') return pickSupport(view, moves) || passOf(moves);
    if (cb && cb.stage === 'blockers') return pickBlock(view, moves) || passOf(moves);
    if (cb && cb.stage === 'order') return pickOrder(view, moves);
    if (cb && cb.stage === 'response') return pickRespond(view, moves);

    const chainOpen = view.chain && view.chain.length > 0;
    if (view.active === view.me.idx && !chainOpen &&
        (view.phase === 'main1' || view.phase === 'main2')) {
      return pickMain(view, moves);
    }
    if (chainOpen || view.priority === view.me.idx) return pickRespond(view, moves);
    return passOf(moves);
  } catch (e) {
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
}
