// 策略名称：炽林疾行
// 选择理由：红绿双色——红提供烧脸直伤与敏捷穿透，绿提供跳费与超冲击巨兽，混合直伤抢血致胜。
// 主责模式：standard

export const meta = {
  id: 'deepseekv4pro',
  model: 'deepseek v4pro',
  modelId: 'deepseek-v4-pro',
  name: '炽林疾行',
  desc: '红绿双色：红烧脸+敏捷穿透，绿跳费+超冲击巨兽，直伤抢血致胜',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  火焰鸟: 4,
  地狱犬: 4,
  烈焰斗士: 4,
  火球术: 4,
  焚尽: 3,
  烈焰战将: 3,
  熔岩投手: 2,
  幼苗守望者: 4,
  部落祭司: 3,
  自然生长: 3,
  森林战将: 3,
  王牌巨象: 3,
  全面成长: 3,
  混沌冲击: 4,
  混沌打击: 3,
};

export const spirit = '余烬执火者';
export const color = '红';

// 卡牌分类（只读常量，运行时不变）
const INFO = {
  火焰鸟: { k: 'unit' },
  地狱犬: { k: 'unit' },
  烈焰斗士: { k: 'unit' },
  烈焰战将: { k: 'unit', fin: true },
  森林战将: { k: 'unit', fin: true },
  王牌巨象: { k: 'unit', fin: true },
  熔岩投手: { k: 'unit' },
  幼苗守望者: { k: 'unit', ramp: true },
  部落祭司: { k: 'unit', ramp: true },
  火球术: { k: 'burn', face: 2 },
  焚尽: { k: 'burn', face: 3 },
  混沌冲击: { k: 'burn', face: 1 },
  混沌打击: { k: 'removal', dmg: 2000 },
  自然生长: { k: 'rampSpell' },
  全面成长: { k: 'pump', atk: 1000, imp: 1, hp: 1000 },
};

// ---- 纯工具函数 ----
function findUnit(list, uid) {
  for (let i = 0; i < list.length; i++) if (list[i].uid === uid) return list[i];
  return null;
}
function unitValue(c) {
  return (c.imp || 0) * 10 + (c.atk || 0) / 1000 + (c.cost ? c.cost.total : 1);
}
function colorCount(list) {
  const r = { 红: 0, 绿: 0, 灰: 0 };
  for (let i = 0; i < list.length; i++) {
    const c = list[i].color;
    r[c] = (r[c] || 0) + 1;
  }
  return r;
}
function passMove(moves) {
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
function hasKw(c, kw) {
  return (c.keywords || []).indexOf(kw) >= 0;
}

// ---- 各阶段决策 ----
function pickInspect(view, moves) {
  return moves.find((m) => m.type === 'inspectTake') || moves[0];
}

function pickSupport(view, moves) {
  const sp = moves.find((m) => m.type === 'supportSpirit');
  return sp || passMove(moves);
}

function canBlockers(a, oppField) {
  const agile = hasKw(a, '敏捷');
  const out = [];
  for (let i = 0; i < oppField.length; i++) {
    const b = oppField[i];
    if (b.type !== '灵像') continue;
    if (b.tapped && !hasKw(b, '守护')) continue;
    if (agile && !hasKw(b, '敏捷') && !hasKw(b, '守护')) continue;
    out.push(b);
  }
  return out;
}

function pickAttack(view, moves) {
  let best = null, bestScore = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'attack') continue;
    const a = findUnit(view.me.field, m.uid);
    if (!a) continue;
    let s;
    if (m.target === 'spirit') {
      s = faceScore(a, view);
    } else {
      const t = findUnit(view.opp.field, m.target);
      if (!t) continue;
      s = unitAttackScore(a, t);
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passMove(moves);
}

function faceScore(a, view) {
  const blockers = canBlockers(a, view.opp.field);
  const base = (a.imp || 0) * 12;
  if (!blockers.length) return base + 4;
  let worst = blockers[0];
  for (let i = 1; i < blockers.length; i++) if (blockers[i].atk > worst.atk) worst = blockers[i];
  const aRem = (a.hp || 0) - (a.damage || 0);
  const wRem = (worst.hp || 0) - (worst.damage || 0);
  const dangerous = worst.atk >= aRem && a.atk < wRem;
  if (hasKw(a, '超冲击')) return base;
  if (dangerous) return base * 0.2 - 6;
  return base * 0.8;
}

function unitAttackScore(a, t) {
  const aRem = (a.hp || 0) - (a.damage || 0);
  const tRem = (t.hp || 0) - (t.damage || 0);
  const iKill = a.atk >= tRem;
  const theyKill = (t.atk || 0) >= aRem;
  const aFirst = hasKw(a, '先攻');
  const tFirst = hasKw(t, '先攻');
  if (iKill && aFirst && !tFirst) return unitValue(t) + 3;
  let s = 0;
  if (iKill) s += unitValue(t) + 2;
  if (theyKill) s -= unitValue(a) * 0.7;
  return s;
}

function pickBlock(view, moves) {
  const att = findUnit(view.opp.field, view.combat.attackerUid);
  if (!att) return passMove(moves);
  const already = view.combat.blockers || [];
  let atkSoFar = 0;
  for (let i = 0; i < already.length; i++) {
    const b = findUnit(view.me.field, already[i]);
    if (b) atkSoFar += b.atk || 0;
  }
  let best = null, bestScore = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'block') continue;
    if (already.indexOf(m.uid) >= 0) continue;
    const b = findUnit(view.me.field, m.uid);
    if (!b) continue;
    const attHp = (att.hp || 0) - (att.damage || 0);
    const iKill = atkSoFar + (b.atk || 0) >= attHp;
    const bRem = (b.hp || 0) - (b.damage || 0);
    const iDie = (att.atk || 0) >= bRem;
    let s = 0;
    if (iKill && !iDie) s = 30 + unitValue(att);
    else if (iKill && iDie) s = 15 + unitValue(att) - unitValue(b);
    else if (!iKill && iDie) s = (att.imp >= 2 ? 10 : 0) - unitValue(b) * 0.3;
    else s = 4;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return bestScore > 0 ? best : passMove(moves);
}

function pickOrder(view, moves) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'orderBlockers') continue;
    const ord = m.order || [];
    let s = 0;
    for (let j = 0; j < ord.length; j++) {
      const b = findUnit(view.me.field, ord[j]);
      if (b) s += (b.atk || 0) * (ord.length - j);
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || moves[0];
}

function pickMain(view, moves) {
  const isMain1 = view.phase === 'main1';
  let best = null, bestScore = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const s = scoreMain(view, m, isMain1);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function scoreMain(view, m, isMain1) {
  switch (m.type) {
    case 'pass': return 0;
    case 'tapEssence': return -1;
    case 'setEssence': return scoreSetEssence(view, m);
    case 'play': return scorePlay(view, m, isMain1);
    case 'spiritSpecial': return isMain1 ? scoreSpiritSpecial(view, m) : 0;
    case 'spiritDraw': return scoreSpiritDraw(view);
    case 'ability': return scoreAbility(view, m);
    default: return 0;
  }
}

function scoreSetEssence(view, m) {
  if (view.me.essence.length >= 8) return 0;
  const c = findUnit(view.me.hand, m.uid);
  if (!c) return 0;
  const hand = colorCount(view.me.hand);
  const ess = colorCount(view.me.essence);
  const wantRed = (hand.红 || 0) - (ess.红 || 0);
  const wantGreen = (hand.绿 || 0) - (ess.绿 || 0);
  const desired = wantGreen > wantRed ? '绿' : '红';
  let s = 45;
  if (c.color === desired) s += 15;
  else if (c.color === '灰') s -= 25;
  else s += 2;
  const info = INFO[c.name] || {};
  if (info.fin) s -= 10;
  if (info.k === 'burn') s -= 5;
  if (view.me.hand.length <= 2 && info.fin) s -= 20;
  return s;
}

function scorePlay(view, m, isMain1) {
  const c = findUnit(view.me.hand, m.uid);
  if (!c) return 0;
  const info = INFO[c.name] || { k: 'unit' };
  switch (info.k) {
    case 'unit': {
      let s = (c.imp || 0) * 10 + (c.atk || 0) / 1000 + (c.cost ? c.cost.total * 0.5 : 0.5);
      if (info.ramp) s += 8;
      if (info.fin) s += 4;
      if (isMain1) s += 4;
      return s;
    }
    case 'burn': {
      let face = info.face;
      if (c.name === '焚尽' && view.me.field.length === 0) face = 4;
      let s = face * 12;
      if ((view.opp.life || 0) <= face) s += 60;
      if (isMain1) s *= 0.65;
      return s;
    }
    case 'removal': {
      const t = m.targets && m.targets[0] ? findUnit(view.opp.field, m.targets[0]) : null;
      if (!t) return 4;
      const remain = (t.hp || 0) - (t.damage || 0);
      let s = 8;
      if (remain <= (info.dmg || 2000)) s += unitValue(t) + 2;
      else s += 4;
      return s;
    }
    case 'rampSpell': {
      if (view.me.essence.length >= 8) return 4;
      return isMain1 ? 22 : 16;
    }
    case 'pump': {
      const t = m.targets && m.targets[0] ? findUnit(view.me.field, m.targets[0]) : null;
      if (!t) return 0;
      let s = 4 + (info.imp || 0) * 10 + ((info.atk || 0) / 1500) * 5 + ((info.hp || 0) / 1500) * 2;
      if ((t.imp || 0) >= 2) s += 4;
      return s;
    }
    default: return 5;
  }
}

function scoreSpiritSpecial(view, m) {
  const t = m.targets && m.targets[0] ? findUnit(view.me.field, m.targets[0]) : null;
  if (!t) return 0;
  let s = 12;
  if ((t.imp || 0) >= 2) s += 6;
  s += ((t.atk || 0) / 1000) * 0.5;
  return s;
}

function scoreSpiritDraw(view) {
  const h = view.me.hand.length;
  if (h <= 2) return 22;
  if (h <= 4) return 14;
  return 8;
}

function scoreAbility(view, m) {
  const t = m.targets && m.targets[0] ? findUnit(view.opp.field, m.targets[0]) : null;
  if (!t) return 0;
  const remain = (t.hp || 0) - (t.damage || 0);
  if (remain <= 1000) return unitValue(t) + 2;
  return 2;
}

export function choose(view, moves) {
  try {
    let m = null;
    if (view.inspect) {
      m = pickInspect(view, moves);
    } else if (view.combat) {
      const st = view.combat.stage;
      if (st === 'attackers') m = pickAttack(view, moves);
      else if (st === 'support') m = pickSupport(view, moves);
      else if (st === 'blockers') m = pickBlock(view, moves);
      else if (st === 'order') m = pickOrder(view, moves);
      else m = passMove(moves);
    } else {
      const myMain = view.priority === view.me.idx && view.active === view.me.idx
        && (view.phase === 'main1' || view.phase === 'main2')
        && (view.chain || []).length === 0;
      if (myMain) m = pickMain(view, moves);
      else m = passMove(moves);
    }
    if (m) return m;
  } catch (e) {
    // 异常时退回让过
  }
  return passMove(moves);
}
