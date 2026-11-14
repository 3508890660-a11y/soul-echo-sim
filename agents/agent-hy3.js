/**
 * 策略名称：翠林根基（Verdant Foundation）
 * 选择理由：绿色灵体「根脉育苗者」横置即可把一张手牌置为灵质并抽牌，等于每回合免费扩张费用+补牌；
 *           配合随灵质数量成长的绿色单位与冲击2巨兽，在 15 血长局里靠稳定收益滚雪球取胜。
 * 主责模式：grand（长局）
 *
 * 零依赖 · 无副作用 · 无模块级可变状态 · 始终返回 moves 中的合法元素。
 */

export const meta = {
  id: 'hy3',
  model: 'hy3',
  modelId: 'hy3',
  name: '翠林根基',
  desc: '以绿色灵体根脉育苗者的「置灵质+抽牌」为核心，免费扩张费用，铺出随灵质成长的森林大军，用冲击2巨兽在长局中碾压取胜。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

// 主卡组：绿色 42 张（80.8%）+ 白色 10 张 = 52 张。灵体为白色不进主卡组。
// 主色绿 ≥60%；duo 恰好两色（绿/白）且各 ≥10，跨模式照用。
export const deck = {
  // —— 绿色核心（42）——
  '幼苗守望者': 3,   // 2费 序曲·置灵质（免费扩张费用）
  '部落祭司': 3,     // 3费 序曲·置灵质
  '自然生长': 3,     // 2费 灵感·牌库顶置灵质（ramp）
  '森林守卫者': 3,   // 3费 启动·产绿（mana 源）
  '藤蔓编织者': 2,   // 3费 启动·+生命力
  '古树牧者': 4,     // 5费 回响·每绿灵质 +250/+250
  '森林狼王': 2,     // 5费 回响/敏捷·成长
  '根脉网络': 2,     // 3费 灵性·每3绿灵质全队 +250/+250
  '根须缠绕': 2,     // 2费 横置对手灵像（节奏控制）
  '力量灌注': 4,     // 1费 灵感·+1500 攻
  '生命灌注': 4,     // 1费 灵感·+1500 生
  '全面成长': 3,     // 3费 灵感·+1000攻/+1冲/+1000生
  '森林战将': 3,     // 6费 预制/践踏/超冲击 6000/2/5000
  '王牌巨象': 2,     // 7费 预制/碾压/践踏/超冲击 6000/2/7000
  '世界树苗': 1,     // 5费 灵性·启动 置灵质+抽牌
  '丰收': 1,         // 4费 灵感·置2灵质+充能2
  // —— 白色辅色（10，duo 第二色；可置灵质产白灵能，亦可裸用）——
  '回复灵光': 4,     // 1费 灵感·回复 3000
  '圣疗': 2,         // 3费 灵感·回复 5000
  '圣光打击': 2,     // 2费 灵感·5000 伤害
  '治愈灵光': 2,     // 2费 灵感·牌库顶置生命顶（回血/藏牌）
};

export const spirit = '根脉育苗者';
export const color = '绿';

// ── 内部辅助（只读 view，绝不修改）────────────────────
function findHand(view, uid) {
  const h = (view.me && view.me.hand) || [];
  for (const c of h) if (c.uid === uid) return c;
  return null;
}
function findField(view, uid, side) {
  const arr = side === 'me' ? ((view.me && view.me.field) || []) : ((view.opp && view.opp.field) || []);
  for (const c of arr) if (c.uid === uid) return c;
  return null;
}
function passOf(moves) {
  return moves.find((m) => m.type === 'pass') || moves[0];
}

function scorePlay(view, mv) {
  const c = findHand(view, mv.uid);
  if (!c) return -1;
  let s = 0;
  const kw = c.keywords || [];
  const t = c.type;
  if (t === '灵像') {
    s += 8;
    s += (c.atk || 0) * 0.002 + (c.imp || 0) * 3 + (c.hp || 0) * 0.001;
    if (kw.includes('序曲') && c.text && c.text.includes('灵质')) s += 6; // 免费扩张费用
    if (kw.includes('超冲击')) s += 2;
    if (kw.includes('践踏')) s += 1;
    if (kw.includes('敏捷')) s += 1;
  } else if (t === '灵性') {
    s += 6;
    if (kw.includes('回响')) s += 2;
    if (kw.includes('启动')) s += 2;
  } else if (t === '灵感') {
    s += 5;
    const n = c.name;
    if (n === '自然生长' || n === '丰收') s += 4; // ramp
    if ((view.me.field || []).length > 0) {
      if (['力量灌注', '生命灌注', '全面成长', '圣疗', '回复灵光', '圣光打击', '治愈灵光'].includes(n)) s += 2;
    }
  }
  return s;
}

function scoreAbility(view, mv) {
  const c = findField(view, mv.uid, 'me');
  if (!c) return -1;
  let s = 4;
  const n = c.name;
  if (n === '森林守卫者') s += 4;   // 产绿
  if (n === '世界树苗') s += 4;     // 置灵质+抽牌
  if (n === '根脉网络') s += 2;
  if (n === '藤蔓编织者') s += 1;
  return s;
}

function mainPhase(view, moves) {
  let best = null;
  let bestS = -Infinity;
  for (const mv of moves) {
    let s = null;
    if (mv.type === 'spiritSpecial') s = 12;          // 置灵质+抽牌，核心引擎
    else if (mv.type === 'spiritDraw') s = 3;
    else if (mv.type === 'play') s = scorePlay(view, mv);
    else if (mv.type === 'setEssence') {
      const c = findHand(view, mv.uid);
      const cost = c && c.cost ? (c.cost.total || 0) : 0;
      s = 3 + cost * 0.4;                              // 无更好动作时才沉底扩张费用
    } else if (mv.type === 'ability') s = scoreAbility(view, mv);
    else if (mv.type === 'tapEssence') s = -1;         // 费用自动横置，不必手动
    else if (mv.type === 'pass') s = 0;
    if (s === null) s = -1;
    if (s > bestS) { bestS = s; best = mv; }
  }
  return best || passOf(moves);
}

function attackers(view, moves) {
  const ms = moves.filter((m) => m.type === 'attack');
  if (!ms.length) return passOf(moves);
  let best = null;
  let bestS = -Infinity;
  for (const m of ms) {
    const c = findField(view, m.uid, 'me');
    if (!c) continue;
    let s;
    if (m.target === 'spirit') {
      // 只打脸有冲击的单位；冲击越高越优先
      s = (c.imp || 0) >= 1 ? (20 + (c.imp || 0) * 15 + (c.atk || 0) * 0.005) : -10;
    } else {
      const t = findField(view, m.target, 'opp');
      if (t) {
        const ourAtk = c.atk || 0;
        const theirHp = (t.hp || 0) - (t.damage || 0);
        const theirAtk = t.atk || 0;
        const ourHp = (c.hp || 0) - (c.damage || 0);
        const weKill = ourAtk >= theirHp;
        const weDie = theirAtk >= ourHp;
        if (weKill && !weDie) s = 15;
        else if (weKill && weDie) s = 6;
        else s = -5;
      } else s = -5;
    }
    if (s > bestS) { bestS = s; best = m; }
  }
  if (best && bestS > 0) return best;
  return passOf(moves);
}

function blockers(view, moves) {
  const combat = view.combat || {};
  const chosen = combat.blockers || [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const blockMoves = fresh.filter((m) => m.type === 'block');
  if (!blockMoves.length) return passOf(moves);
  const atkCard = findField(view, combat.attackerUid, 'opp');
  const target = combat.target;
  const aHp = atkCard ? (atkCard.hp || 0) - (atkCard.damage || 0) : 0;
  const aAtk = atkCard ? (atkCard.atk || 0) : 0;

  if (target === 'spirit') {
    // 对手打脸：能挡则挡，优先「能杀死攻击者且存活」的单位
    let best = null;
    let bestS = -Infinity;
    for (const m of blockMoves) {
      const c = findField(view, m.uid, 'me');
      if (!c) continue;
      let s = 1;
      if ((c.atk || 0) >= aHp) s += 5;            // 能击杀
      if ((c.hp || 0) - (c.damage || 0) > aAtk) s += 3; // 能存活
      s += (c.atk || 0) * 0.001;
      if (s > bestS) { bestS = s; best = m; }
    }
    return best || passOf(moves);
  }

  // 对手攻击我方单位：仅当目标珍贵且能干净换掉攻击者时才挡
  const tgt = findField(view, target, 'me');
  const valuable = tgt && ((tgt.hp || 0) >= 3000 || (tgt.keywords && tgt.keywords.length));
  let best = null;
  let bestS = -Infinity;
  for (const m of blockMoves) {
    const c = findField(view, m.uid, 'me');
    if (!c) continue;
    let s = -1;
    if (valuable) {
      const ourAtk = c.atk || 0;
      const ourHp = (c.hp || 0) - (c.damage || 0);
      if (ourAtk >= aHp && ourHp > aAtk) s = 8;
      else if (ourAtk >= aHp) s = 4;
      else s = 0;
    }
    if (s > bestS) { bestS = s; best = m; }
  }
  if (best && bestS > 0) return best;
  return passOf(moves);
}

function respond(view, moves) {
  // 仅在对方回合用「无目标、无副作用」的灵感牌白赚节奏（扩张费用/回血）
  const safe = ['自然生长', '丰收', '治愈灵光'];
  for (const m of moves) {
    if (m.type === 'play') {
      const c = findHand(view, m.uid);
      if (c && safe.includes(c.name)) return m;
    }
  }
  return passOf(moves);
}

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    const me = view.me || {};

    // 灵体检视：免费拿牌
    if (view.inspect) {
      const t = moves.find((m) => m.type === 'inspectTake') || moves.find((m) => m.type === 'inspectReveal');
      return t || passOf(moves);
    }

    const combat = view.combat;
    if (combat && combat.stage) {
      if (combat.stage === 'attackers') return attackers(view, moves);
      if (combat.stage === 'support') {
        if (me.spirit && me.spirit.crit > 0 && moves.find((m) => m.type === 'supportSpirit')) {
          return moves.find((m) => m.type === 'supportSpirit');
        }
        return passOf(moves);
      }
      if (combat.stage === 'blockers') return blockers(view, moves);
      if (combat.stage === 'order') {
        return moves.find((m) => m.type === 'orderBlockers') || passOf(moves);
      }
    }

    // 自己的主要阶段
    if ((view.phase === 'main1' || view.phase === 'main2') &&
        view.active === me.idx &&
        (!view.chain || !view.chain.length)) {
      return mainPhase(view, moves);
    }

    // 响应对方 / 连锁中：仅用安全灵感牌或让过
    if (view.priority === me.idx && view.active !== me.idx) return respond(view, moves);
    if (view.chain && view.chain.length && view.priority === me.idx) return respond(view, moves);

    return passOf(moves);
  } catch (e) {
    return moves.find((m) => m.type === 'pass') || moves[0];
  }
}
