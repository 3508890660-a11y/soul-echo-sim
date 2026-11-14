// ============================================================
// 策略名称：赤雷迅斩（Red-Thunder Rush）
// 选择理由：冲击决定生命伤害，红是冲击增益与直伤最密集的颜色；
//          黄提供廉价的冲击增益（雷铸天兵）与一费解牌（雷霆打击）。
//          用预制/敏捷低成本单位抢节奏，每回合灵体再垫 +1 冲击，
//          配合火球术在对手大单位成型前直接打空其生命卡组。
// 主责模式：duo（红 34 + 黄 16，共 50 张，同色占比 68%）
// ============================================================

export const meta = {
  id: 'glm53flash',
  model: 'GLM5.3flash',
  modelId: 'glm-5.3-flash',
  name: '赤雷迅斩',
  desc: '红黄双色低费预制/敏捷单位配合冲击增益与火球术直打生命，用速度在对手成型前终结比赛。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const spirit = '余烬执火者';
export const color = '红';

export const deck = {
  '火焰鸟': 4,
  '地狱犬': 4,
  '灰烬小僧': 4,
  '烈焰斗士': 4,
  '熔岩投手': 2,
  '烈焰战将': 2,
  '火球术': 4,
  '爆燃': 4,
  '血怒': 2,
  '烈焰之力': 2,
  '余烬回燃': 2,
  '雷鸣侍从': 4,
  '雷铸天兵': 4,
  '雷霆打击': 4,
  '力量共鸣': 2,
  '连锁雷鸣': 2,
};

// ---------- 纯工具函数（无模块级可变状态） ----------

function find(list, uid) {
  if (!list) return null;
  for (const c of list) {
    if (c && c.uid === uid) return c;
  }
  return null;
}

function kw(card) {
  return (card && card.keywords) || [];
}

// 场上单位价值估算，用于解牌目标选择与交换评估
function val(c) {
  if (!c) return 0;
  const k = kw(c);
  let v = (c.atk || 0) / 1000 + (c.hp || 0) / 2000 + (c.imp || 0) * 0.8;
  if (c.type === '灵性') v = (c.hp || 0) / 1500 + 2;
  if (k.includes('守护')) v += 1;
  if (k.includes('回响')) v += 1.5;
  if (k.includes('启动')) v += 0.8;
  if (k.includes('敏捷')) v += 0.5;
  if (k.includes('超冲击')) v += 1;
  if (k.includes('威慑')) v += 0.5;
  if (k.includes('灵气')) v += 0.5;
  if (k.includes('预制')) v += 0.5;
  return v;
}

// 对手某单位能否阻挡我的攻击者 a
function canBlock(u, a) {
  if (!u || u.tapped) return false;
  const ak = kw(a);
  const uk = kw(u);
  if (ak.includes('敏捷') && !(uk.includes('敏捷') || uk.includes('守护'))) return false;
  return true;
}

// 本回合潜在生命伤害：未横置单位冲击 + 手中冲击增益（每个 +1，灵体专属也算 1）
const PUMP = ['血怒', '雷铸天兵', '烈焰之力'];
function potentialLife(view) {
  const me = view.me;
  let imp = 0;
  let units = 0;
  for (const c of me.field || []) {
    if (c.type === '灵像' && !c.tapped) {
      imp += c.imp || 0;
      units++;
    }
  }
  let pumps = 1; // 灵体专属能力
  for (const c of me.hand || []) {
    if (PUMP.includes(c.name)) pumps++;
  }
  return imp + Math.min(pumps, Math.max(units, 1));
}

function pickBest(moves, scoreOf) {
  let best = null;
  let bs = -Infinity;
  for (const m of moves) {
    const s = scoreOf(m);
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  return best;
}

// ---------- 各阶段决策 ----------

// 攻击阶段
function pickAttack(view, moves, pass) {
  const me = view.me;
  const opp = view.opp;
  const oppLife = opp.life;
  return pickBest(moves, (m) => {
    if (m.type !== 'attack') return m.type === 'pass' ? 1 : 0;
    const a = find(me.field, m.uid);
    if (!a) return -10;
    if (m.target === 'spirit') {
      const blocked = (opp.field || []).some((u) => canBlock(u, a));
      const imp = a.imp || 0;
      if (!blocked) return 300 + imp * 40 + (imp >= oppLife ? 500 : 0);
      return -8; // 攻进确定被阻挡的打脸 = 送死
    }
    const t = find(opp.field, m.target);
    if (!t) return -5;
    const kill = a.atk >= t.hp;
    const die = t.atk >= a.hp;
    const tv = val(t);
    const av = val(a);
    if (kill && !die) return 160 + tv * 25;
    if (kill && die) return 95 + (tv - av) * 25;
    if (t.type === '灵性') return 55 + tv * 20; // 灵性不能反击，磨死它
    return -8; // 杀不掉的单位不打，白吃反击
  }) || pass || moves[0];
}

// 支援阶段：+1000 攻 / +1 冲击
function pickSupport(view, moves, pass) {
  const c = view.combat;
  const a = find(view.me.field, c && c.attackerUid);
  let sSup = 5;
  if (a) {
    if (c.target === 'spirit') {
      sSup = 50 + (a.imp || 0) * 20;
    } else {
      const t = find(view.opp.field, c.target);
      if (t && a.atk < t.hp && a.atk + 1000 >= t.hp) sSup = 220; // 支援凑成击杀
      else sSup = 12;
    }
  }
  return pickBest(moves, (m) => {
    if (m.type === 'supportSpirit') return sSup;
    return m.type === 'pass' ? 1 : 0;
  }) || pass || moves[0];
}

// 阻挡阶段：必须从候选中过滤已宣告单位（block 是切换式动作）
function pickBlock(view, moves, pass) {
  const c = view.combat;
  const chosen = (c && c.blockers) || [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const a = find(view.opp.field, c && c.attackerUid);
  return pickBest(fresh, (m) => {
    if (m.type !== 'block') return m.type === 'pass' ? 1 : 0;
    const b = find(view.me.field, m.uid);
    if (!a || !b) return 0;
    const kills = b.atk >= a.hp;
    const first = kw(b).includes('先攻');
    const dies = !kills || (!first && a.atk >= b.hp);
    if (c.target === 'spirit') {
      const imp = a.imp || 0;
      const urgent = imp >= view.me.life;
      if (kills && !dies) return 300;
      if (kills && dies) return 120 + (urgent ? 150 : 0);
      if (kw(a).includes('超冲击')) return 2; // 挡不住超冲击的打脸，别浪费单位
      if (!dies) return 25; // 肉盾白嫖吸收，攻击者白横置
      return urgent ? 70 : imp >= 2 ? 40 : 6;
    }
    const t = find(view.me.field, c.target);
    const tv = t ? val(t) : 10;
    const bv = val(b);
    if (kills && !dies) return 150 + tv * 20;
    if (kills && dies) return tv > bv ? 90 : 5;
    return tv > 20 && !dies ? 15 : 2;
  }) || moves.find((m) => m.type === 'pass') || moves[0];
}

// 主要阶段（含响应判别在外层）
function pickMain(view, moves, pass) {
  const me = view.me;
  const opp = view.opp;
  const ess = me.essence || [];
  const essN = ess.length;
  const yelN = ess.filter((x) => x.color === '黄').length;
  const redN = ess.filter((x) => x.color === '红').length;
  const lethal = potentialLife(view) >= opp.life;
  const untapped = (me.field || []).filter((c) => c.type === '灵像' && !c.tapped);
  const phase1 = view.phase === 'main1';

  return pickBest(moves, (m) => {
    let s = 0;
    if (m.type === 'setEssence') {
      const c = find(me.hand, m.uid);
      const cost = c && c.cost ? c.cost.total : 9;
      s = 70 - essN * 6 - Math.max(0, cost - 2) * 6;
      if (c) {
        if (c.type === '灵感') s += 3;
        if (c.color === '黄') s += yelN === 0 && redN >= 2 ? 18 : -10; // 保证黄色灵能供给
      }
      if (essN >= 6) s -= 30;
    } else if (m.type === 'play') {
      const c = find(me.hand, m.uid);
      if (!c) return 0;
      if (c.type === '灵像') {
        s = 55 + val(c) * 10 - c.cost.total * 3;
        if (kw(c).includes('预制') && phase1) s += 12;
        if (essN <= 1 && c.cost.total > 2) s -= 25;
      } else {
        const name = c.name;
        if (name === '火球术') {
          s = 45 + (12 - opp.life) * 6; // 越接近终结越想打
        } else if (name === '爆燃' || name === '雷霆打击' || name === '连锁雷鸣') {
          let tv = 0;
          for (const u of m.targets || []) {
            const t = find(opp.field, u);
            if (t) tv = Math.max(tv, val(t));
          }
          s = 65 + tv * 8;
        } else if (PUMP.includes(name)) {
          if (lethal) s = 260;
          else if (phase1 && untapped.length && opp.life <= 8) s = 50;
          else s = 15;
        } else if (name === '力量共鸣') {
          s = lethal ? 200 : untapped.length >= 2 ? 35 : 10;
        } else if (name === '余烬回燃') {
          const g = (me.grave || []).filter((x) => x.color === '红' && x.type === '灵感').length;
          s = g >= 2 ? 45 : 5;
        } else {
          s = 10;
        }
      }
    } else if (m.type === 'ability') {
      let tv = 0;
      for (const u of m.targets || []) {
        const t = find(opp.field, u);
        if (t) tv = Math.max(tv, val(t));
      }
      s = m.targets && m.targets.length ? 60 + tv * 5 : 0;
    } else if (m.type === 'spiritSpecial') {
      if (lethal) s = 250;
      else if (phase1 && untapped.length && opp.life <= 9) s = 62;
      else s = 15;
    } else if (m.type === 'spiritDraw') {
      s = me.handCount <= 3 ? 46 : me.handCount <= 5 && view.turnCount >= 3 ? 30 : 8;
    } else {
      s = 1; // tapEssence / pass 等
    }
    return s;
  }) || pass || moves[0];
}

// ---------- 入口 ----------

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return undefined;
    const pass = moves.find((m) => m.type === 'pass');
    const fallback = pass || moves[moves.length - 1];

    // 灵体检视：免费就收
    if (view.inspect) {
      const take = moves.find((m) => m.type === 'inspectTake');
      if (take) return take;
      return fallback;
    }

    const stage = view.combat && view.combat.stage;
    if (stage === 'attackers') return pickAttack(view, moves, fallback);
    if (stage === 'support') return pickSupport(view, moves, fallback);
    if (stage === 'blockers') return pickBlock(view, moves, fallback);
    if (stage === 'order') {
      return moves.find((m) => m.type === 'orderBlockers') || fallback;
    }

    const myMain =
      (view.phase === 'main1' || view.phase === 'main2') &&
      view.active === view.me.idx &&
      !(view.chain && view.chain.length);
    if (myMain) return pickMain(view, moves, fallback);

    // 响应与其他情形：让过
    return fallback;
  } catch (e) {
    return moves && moves.length
      ? moves.find((m) => m.type === 'pass') || moves[moves.length - 1]
      : undefined;
  }
}
