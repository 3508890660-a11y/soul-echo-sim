// 策略名称：赤烬疾袭
// 选择理由：SE01 胜负只看「谁先把对方生命卡组打空」，冲击打脸与直伤灵感是最短路径；
//           红色低费灵像配合直伤，可在对方铺开防线前压空血线，短平快、不依赖高费上限。
// 主责模式：standard

export const meta = {
  id: 'hy4',
  model: 'hy4',
  modelId: 'hy4std',
  name: '赤烬疾袭',
  desc: '红色低费灵像铺场 + 冲击打脸 + 直伤灵感，双管齐下快速清空对手生命卡组。',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const spirit = '余烬执火者';
export const color = '红';

export const deck = {
  // 红（主色，34 张 = 68%）
  '火焰鸟': 4,
  '地狱犬': 4,
  '烈焰斗士': 4,
  '灰烬小僧': 4,
  '火球术': 4,
  '焚尽': 4,
  '血怒': 4,
  '熔岩投手': 2,
  '烈焰战将': 2,
  '熔炉之核': 2,
  // 蓝（第二非灰色，满足 duo 恰好 2 色、每色≥10，10 张）
  '智慧之光': 4,
  '彩虹喷射': 4,
  '法师护甲': 2,
  // 灰（中性，灰费可用任意颜色灵能支付，6 张）
  '混沌冲击': 4,
  '荒原狼': 2,
};

// 直伤灵感：卡名 -> 大致生命伤害，用于出牌打分
const BURN = { '火球术': 2, '焚尽': 3, '混沌冲击': 1 };
const ESS_TARGET = 6; // 本卡组最高曲线为 6 费烈焰战将，6 张灵质即可通付

function passOf(moves) {
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}

// 灵体检视：一律不支付，直接拿 inspectTake
function pickInspect(moves) {
  return moves.find((m) => m.type === 'inspectTake') || passOf(moves);
}

// 伤害分配顺序：每轮都必须返回 orderBlockers，绝不返回 pass
function pickOrder(moves) {
  return moves.find((m) => m.type === 'orderBlockers') || passOf(moves);
}

// 阻挡：block 是 toggle 且 moves 会含已宣告者，必须先滤掉；pass 也参与打分
function pickBlockers(view, moves) {
  const cb = view.combat || {};
  const chosen = Array.isArray(cb.blockers) ? cb.blockers : [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const pass = passOf(moves);
  if (!fresh.length) return pass;

  const myField = {};
  for (const c of (view.me.field || [])) if (c && c.uid) myField[c.uid] = c;
  const oppField = {};
  for (const c of (view.opp.field || [])) if (c && c.uid) oppField[c.uid] = c;
  const attacker = oppField[cb.attackerUid] || null;
  const aAtk = attacker ? (attacker.atk || 0) : 0;
  const aHp = attacker ? Math.max(0, (attacker.hp || 0) - (attacker.damage || 0)) : 0;
  const aImp = attacker ? (attacker.imp || 1) : 1;
  const toFace = cb.target === 'spirit';
  const lethal = toFace && aImp >= (view.me.life || 0);

  let best = null, bestScore = -Infinity;
  for (const m of fresh) {
    let s;
    if (m.type === 'pass') {
      s = 10;
    } else if (m.type === 'block') {
      const b = myField[m.uid];
      if (!b) {
        s = -1;
      } else {
        const bAtk = b.atk || 0;
        const bHp = Math.max(0, (b.hp || 0) - (b.damage || 0));
        s = 0;
        if (toFace) s += 30;          // 防打脸
        if (lethal) s += 200;         // 防致命冲击，最优先
        if (bAtk >= aHp) s += 60;     // 能反杀攻击者
        if (aAtk < bHp) s += 40;      // 能扛住反击
        s -= bAtk / 1000;             // 同等条件下用较弱单位去换
      }
    } else {
      s = -1;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || pass;
}

// 攻击：优先打脸（冲击=生命伤害），其次才清对方单位
function pickAttackers(view, moves) {
  const myField = {};
  for (const c of (view.me.field || [])) if (c && c.uid) myField[c.uid] = c;
  const oppField = {};
  for (const c of (view.opp.field || [])) if (c && c.uid) oppField[c.uid] = c;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    let s;
    if (m.type === 'pass') {
      s = 1;
    } else if (m.type === 'attack') {
      const a = myField[m.uid];
      const atk = a ? (a.atk || 0) : 0;
      const imp = a ? (a.imp || 1) : 1;
      if (m.target === 'spirit') {
        s = 100 + imp * 30 + atk / 1000;
      } else {
        const t = oppField[m.target];
        const thp = t ? Math.max(0, (t.hp || 0) - (t.damage || 0)) : 99999;
        s = 40 + (atk >= thp ? 25 : 0) + atk / 1000;
      }
    } else {
      s = 0;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

function playScore(c) {
  if (!c) return 5;
  const name = c.name;
  const burn = BURN[name];
  if (burn) return 200 + burn * 12;
  const cost = (c.cost && c.cost.total) || 0;
  const imp = c.imp || c.impact || 0;
  const atk = c.atk || c.attack || 0;
  if (c.type === '灵像') return 100 + imp * 25 + atk / 1000 - cost * 2;
  if (c.type === '灵性') return 45 + imp * 5;
  if (c.type === '灵感') {
    if (name === '血怒') return 72;
    if (name === '智慧之光' || name === '彩虹喷射') return 62;
    if (name === '法师护甲') return 40;
    return 50;
  }
  return 50;
}

// 主要阶段：设灵质(ramp) > 出牌(直伤/铺场) > 让过；其余动作一律不用
function pickMain(view, moves) {
  const hand = {};
  for (const c of (view.me.hand || [])) if (c && c.uid) hand[c.uid] = c;
  const essCount = (view.me.essence || []).length;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    let s;
    if (m.type === 'setEssence') {
      const c = hand[m.uid];
      const cost = c ? (c.cost && c.cost.total) || 0 : 0;
      // 未到上限：设灵质优先（且当回合立即可横置产费）；优先高费、优先红色灵质
      s = essCount < ESS_TARGET ? 300 + cost + (c && c.color === '红' ? 6 : 0) : 0;
    } else if (m.type === 'play') {
      s = playScore(hand[m.uid]);
    } else if (m.type === 'pass') {
      s = 1;
    } else {
      // ability / spiritSpecial / spiritDraw / tapEssence：不用，避免副作用与循环
      s = 0;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passOf(moves);
}

function decide(view, moves) {
  if (!view || !view.me || !moves || !moves.length) return null;
  if (view.inspect) return pickInspect(moves);

  const cb = view.combat;
  if (cb && cb.stage) {
    if (cb.stage === 'blockers') return pickBlockers(view, moves);
    if (cb.stage === 'order') return pickOrder(moves);
    if (cb.stage === 'attackers') return pickAttackers(view, moves);
    if (cb.stage === 'support') return passOf(moves);
    return passOf(moves); // combat_start / response / damage / 未知
  }

  const myMain = view.active === view.me.idx
    && (view.phase === 'main1' || view.phase === 'main2')
    && !(view.chain && view.chain.length);
  if (myMain) return pickMain(view, moves);
  return passOf(moves); // 响应窗口 / start / setup / end 等
}

export function choose(view, moves) {
  try {
    const pick = decide(view, moves);
    if (pick) return pick;
  } catch (e) {
    // 打分异常时退回让过，不把异常抛给引擎
  }
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
