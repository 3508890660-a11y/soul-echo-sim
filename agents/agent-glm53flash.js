/**
 * 策略名称：血燃献祭
 * 选择理由：SE01 里冲击是唯一稳定的赢生命通道，红色拥有最密集的预制/敏捷单位与
 *   直伤灵感，黑色拥有廉价解场（蹒跚的僵尸）与以自身单位换资源（燃魂/自杀式袭击）
 *   的手段，两色互补、各自有色费都不深，红主黑辅的灵质配比可以把卡色风险压到最低。
 *   灵体选余烬执火者：+1000 攻击力与 +1 冲击力的回合内增益直接放大打脸能力。
 * 主责模式：duo（双色对局，红/黑两色各覆盖远超 10 张，灰色填充不计入颜色数）
 */

export const meta = {
  id: 'glm53flash',
  model: 'GLM5.3flash',
  modelId: 'glm-5.3-flash',
  name: '血燃献祭',
  desc: '红黑双色的预制单位连续打脸、廉价解场清路、直伤收尾的快攻中速。',
  primaryMode: 'duo',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // 红 32 张：低费进攻单位与直伤
  火焰鸟: 4,
  地狱犬: 4,
  烈焰斗士: 4,
  火球术: 4,
  爆燃: 4,
  血怒: 3,
  熔岩投手: 3,
  焚尽: 3,
  烈焰战将: 3,
  // 黑 14 张：解场、补牌与献祭收益
  灵质榨取: 4,
  蹒跚的僵尸: 4,
  自杀式袭击: 3,
  燃魂: 3,
  // 灰 6 张：无色费填充，不参与颜色数
  混沌打击: 2,
  混沌冲击: 2,
  荒原狼: 2,
};

export const spirit = '余烬执火者';
export const color = '红';

/* ───────────────────────── 基础工具 ───────────────────────── */

const kwOf = (c) => (c && c.keywords) || [];
const hpLeft = (c) => ((c && c.hp) || 0) - ((c && c.damage) || 0);
const findUid = (list, uid) => (list || []).find((u) => u.uid === uid) || null;

function costColorsOf(c) {
  if (c && c.cost && c.cost.colors && !c.cost.colors.__single) return c.cost.colors;
  if (c && c.cost && c.cost.colored) return { [c.color]: c.cost.colored };
  return {};
}

/** 场上单位的价值估计，用于交换与解场决策。 */
function unitValue(c) {
  if (!c) return 0;
  const kw = kwOf(c);
  const body = (c.atk || 0) / 1000 + hpLeft(c) / 1000 * 0.8 + (c.imp || 0) * 1.5;
  let bonus = 0;
  if (kw.includes('守护')) bonus += 1;
  if (kw.includes('敏捷') || kw.includes('预制')) bonus += 1;
  if (kw.includes('先攻')) bonus += 1;
  if (kw.includes('超冲击') || kw.includes('践踏')) bonus += 1.5;
  if (kw.includes('威慑')) bonus += 1;
  if (c.type === '灵性') return hpLeft(c) / 1000 * 0.8 + 1.5;
  return body + bonus;
}

/** 手牌保留价值（越低越适合设灵质）。 */
function keepValue(c) {
  if (!c) return 0;
  if (c.type === '灵像') return 10 + (c.atk || 0) / 1000 + (c.cost && c.cost.total || 0) * 0.8;
  return 8 + (c.cost && c.cost.total || 0) * 0.5;
}

/** 当前最缺的有色灵能（基于下回合内可打出的手牌颜色需求）。 */
function worstColor(view) {
  const n = view.me.essence.length;
  const avail = {};
  for (const e of view.me.essence) avail[e.color] = (avail[e.color] || 0) + 1;
  const need = {};
  for (const c of view.me.hand || []) {
    const colors = costColorsOf(c);
    const total = (c.cost && c.cost.total) || 0;
    if (total <= n + 1) {
      for (const col of Object.keys(colors)) need[col] = (need[col] || 0) + colors[col];
    }
  }
  let worst = null;
  let maxd = 0;
  for (const col of Object.keys(need)) {
    const d = need[col] - (avail[col] || 0);
    if (d > maxd) { maxd = d; worst = col; }
  }
  return worst;
}

/** 对某攻击者而言对手当前合法的阻挡者集合。 */
function eligibleBlockers(view, attacker) {
  const agile = kwOf(attacker).includes('敏捷');
  return (view.opp.field || []).filter((u) => {
    if (u.type !== '灵像') return false;
    if (u.tapped && !kwOf(u).includes('守护')) return false;
    if (agile && !kwOf(u).includes('敏捷') && !(u.tapped && kwOf(u).includes('守护'))) return false;
    return true;
  });
}

/* ───────────────────────── 各阶段决策 ───────────────────────── */

function scoreAttack(view, mv) {
  const a = findUid(view.me.field, mv.uid);
  if (!a) return -1;
  const aHp = hpLeft(a);
  const aAtk = a.atk || 0;
  const aImp = a.imp || 0;
  const akw = kwOf(a);
  const blockers = eligibleBlockers(view, a);
  if (mv.target === 'spirit') {
    if (!blockers.length) {
      let v = 42 + aImp * 14;
      if (aImp >= view.opp.life) v += 400;
      return v;
    }
    let v = 6 + aImp * 2;
    if (akw.includes('超冲击')) v += aImp * 6;
    if (blockers.some((u) => (u.atk || 0) >= aHp)) v -= unitValue(a) * 4;
    return v;
  }
  const t = findUid(view.opp.field, mv.target);
  if (!t) return -1;
  const tHp = hpLeft(t);
  const kills = aAtk >= tHp;
  const first = akw.includes('先攻');
  let v = 0;
  if (kills) v += unitValue(t) * 5;
  else v += aAtk > 0 ? 3 : 0;
  if (!(first && kills)) {
    const tAtk = t.atk || 0;
    if (tAtk >= aHp) v -= unitValue(a) * 4.5;
    else if (tAtk > 0) v -= (tAtk / 1000) * 2;
  }
  return v;
}

function chooseAttack(view, moves, pass) {
  let best = pass;
  let bestV = 2.5;
  for (const mv of moves) {
    if (mv.type !== 'attack') continue;
    const v = scoreAttack(view, mv);
    if (v > bestV) { bestV = v; best = mv; }
  }
  return best;
}

function chooseBlock(view, moves, pass) {
  const cb = view.combat;
  if (!cb) return pass;
  const att = findUid(view.opp.field, cb.attackerUid);
  if (!att) return pass;
  // 引擎的 block 是切换式：已在 blockers 里的 uid 再宣告一次等于取消阻挡。
  // 所以只从「尚未宣告」的候选里选，已宣告的绝不再返回，否则会无限来加。
  const chosen = (cb.blockers || []).slice();
  const first = chosen.length === 0;
  const incoming = cb.target === 'spirit' ? (att.imp || 0) : 0;
  const lethalLife = incoming >= view.me.life;
  const tgt = cb.target !== 'spirit' ? findUid(view.me.field, cb.target) : null;
  // 第一个阻挡者负责挡下伤害；后续阻挡者只为参与反杀，不再重复计算「救下」的价值。
  const savedVal = first ? (tgt ? unitValue(tgt) * 10 : incoming * 10) : 0;
  let teamAtk = 0;
  for (const uid of chosen) {
    const u = findUid(view.me.field, uid);
    if (u) teamAtk += u.atk || 0;
  }
  const needAtk = hpLeft(att);
  let best = pass;
  let bestV = first ? 1 : 0.5;
  for (const mv of moves) {
    if (mv.type !== 'block') continue;
    if (chosen.includes(mv.uid)) continue;
    const u = findUid(view.me.field, mv.uid);
    if (!u) continue;
    const uAtk = u.atk || 0;
    let v = savedVal;
    if ((att.atk || 0) >= hpLeft(u)) v -= unitValue(u) * 8;
    if (teamAtk + uAtk >= needAtk) v += unitValue(att) * (first ? 8 : 5);
    else if (uAtk > 0) v += (uAtk / 1000) * 2;
    if (lethalLife) v += 200;
    if (v > bestV) { bestV = v; best = mv; }
  }
  return best;
}

function chooseOrder(view, moves, pass) {
  const ord = moves.filter((m) => m.type === 'orderBlockers');
  if (!ord.length) return pass;
  const byCheap = (x, y) => {
    const a = findUid(view.me.field, x) || { atk: 0, hp: 0 };
    const b = findUid(view.me.field, y) || { atk: 0, hp: 0 };
    return unitValue(a) - unitValue(b);
  };
  for (const mv of ord) {
    const want = [...mv.order].sort(byCheap);
    const same = want.every((uid, i) => uid === mv.order[i]);
    if (same) return mv;
  }
  return ord[0];
}

function scorePlay(view, mv, card, inCombat) {
  const name = card.name;
  const myUids = new Set((view.me.field || []).map((u) => u.uid));
  const oppUids = new Set((view.opp.field || []).map((u) => u.uid));
  const oppVal = (uid) => { const c = findUid(view.opp.field, uid); return c ? unitValue(c) : 0; };
  const ownVal = (uid) => { const c = findUid(view.me.field, uid); return c ? unitValue(c) : 0; };
  const oppLife = view.opp.life;
  switch (name) {
    case '混沌打击':
    case '爆燃': {
      const t = mv.targets && mv.targets[0];
      if (!t || !oppUids.has(t)) return -5;
      const c = findUid(view.opp.field, t);
      const dmg = name === '混沌打击' ? 2000 : ((c && (c.damage || 0) > 0) ? 3000 : 1000);
      const kills = c && dmg >= hpLeft(c);
      return 10 + (kills ? unitValue(c) * 6 : (dmg / 1000) * 1.5);
    }
    case '火球术': {
      let v = 10 + 6;
      if (oppLife <= 2) v += 200;
      return v;
    }
    case '焚尽': {
      const dmg = (view.me.field || []).length ? 3 : 4;
      let v = 16 + dmg * 3;
      if (oppLife <= dmg) v += 200;
      return v;
    }
    case '混沌冲击': {
      let v = 6;
      if (oppLife <= 1) v += 200;
      if (view.turn >= 6) v += 4;
      return v;
    }
    case '燃魂': {
      const t = mv.targets && mv.targets[0];
      if (!t || !myUids.has(t)) return -5;
      let v = 18 - ownVal(t) * 3;
      const c = findUid(view.me.field, t);
      if (c && c.name === '蹒跚的僵尸') v += 18;
      if (oppLife <= 2) v += 200;
      return v;
    }
    case '自杀式袭击': {
      const own = mv.targets && mv.targets[0];
      const opp = mv.targets && mv.targets[1];
      if (!own || !myUids.has(own) || !opp || !oppUids.has(opp)) return -5;
      return 12 + oppVal(opp) * 6 - ownVal(own) * 3;
    }
    case '血怒': {
      const t = mv.targets && mv.targets[0];
      if (!t || !myUids.has(t)) return -5;
      const u = findUid(view.me.field, t);
      if (!u || u.type !== '灵像' || u.tapped) return 3;
      let v = inCombat ? 6 : 20;
      if (!inCombat && (u.damage || 0) > 0) v += 4;
      if (!inCombat && oppLife <= 2) v += 150;
      return v;
    }
    case '灵质榨取': {
      if (mv.mode === 'bury') return (view.me.handCount || 0) >= 3 ? 18 : 2;
      const h = view.me.handCount || 0;
      return h <= 4 ? 22 : (h <= 5 ? 16 : 5);
    }
    default: {
      if (card.type === '灵像') {
        let v = 10 + (card.atk || 0) / 1000 * 1.4 + ((card.hp || 0) / 1000) * 0.7 + (card.imp || 0) * 2.2;
        const kw = kwOf(card);
        if (kw.includes('预制')) v += 3;
        if (kw.includes('敏捷')) v += 1;
        if (kw.includes('先攻')) v += 1.5;
        if (kw.includes('超冲击') || kw.includes('践踏')) v += 2;
        if (kw.includes('守护')) v += 1;
        if (name === '蹒跚的僵尸') v += 5;
        const total = (card.cost && card.cost.total) || 0;
        v -= total * 1.3;
        if (view.turn <= 3 && total >= 5) v -= 10;
        return v;
      }
      if (card.type === '灵性') return 6 + ((card.hp || 0) / 1000) * 0.5;
      return 2;
    }
  }
}

function scoreAbility(view, mv) {
  const t = mv.targets && mv.targets[0];
  if (mv.name === '熔岩投手') {
    if (!t) return 1;
    const c = findUid(view.opp.field, t);
    if (!c) return -5;
    if (1000 >= hpLeft(c)) return 8 + unitValue(c) * 5;
    return 3;
  }
  return 3;
}

function scoreSpiritSpecial(view, mv, inCombat) {
  const t = mv.targets && mv.targets[0];
  if (!t) return 2;
  const u = findUid(view.me.field, t);
  if (!u || u.type !== '灵像' || u.tapped) return 2;
  if (inCombat) return 3;
  let v = 24 + (u.imp || 0) * 2 + (u.atk || 0) / 3000;
  if ((u.imp || 0) + 1 >= view.opp.life) v += 200;
  return v;
}

function chooseMain(view, moves, pass) {
  const inCombat = !!view.combat;
  const me = view.me;
  const essenceCount = me.essence.length;
  let best = pass;
  let bestV = 1.5;

  // 出牌与启动
  const handMap = {};
  for (const c of me.hand || []) handMap[c.uid] = c;
  for (const mv of moves) {
    let v = -99;
    if (mv.type === 'play') {
      const card = handMap[mv.uid];
      if (card) v = scorePlay(view, mv, card, inCombat);
    } else if (mv.type === 'ability') {
      v = scoreAbility(view, mv);
    } else if (mv.type === 'spiritSpecial') {
      v = scoreSpiritSpecial(view, mv, inCombat);
    }
    if (v > bestV) { bestV = v; best = mv; }
  }

  // 灵体检视（免费过牌）
  if (!inCombat && !me.spirit.tapped && view.turn > 1) {
    const draw = moves.find((m) => m.type === 'spiritDraw');
    if (draw) {
      const v = (me.handCount || 0) <= 3 ? 20 : 10;
      if (v > bestV) { bestV = v; best = draw; }
    }
  }

  // 设灵质：每回合 1 次的费用成长
  if (!inCombat && moves.some((m) => m.type === 'setEssence')) {
    let base = essenceCount < 6 ? 24 : essenceCount < 8 ? 20 : 10;
    const worst = worstColor(view);
    let setBest = null;
    let setV = -99;
    for (const mv of moves) {
      if (mv.type !== 'setEssence') continue;
      const card = handMap[mv.uid];
      if (!card) continue;
      let v = base - keepValue(card);
      if (worst && card.color === worst) v += 8;
      if (v > setV) { setV = v; setBest = mv; }
    }
    if (setBest && setV > bestV) { bestV = setV; best = setBest; }
  }

  return best;
}

function decide(view, moves) {
  if (!moves || !moves.length) return null;
  const pass = moves.find((m) => m.type === 'pass');
  if (view.inspect) return moves.find((m) => m.type === 'inspectTake') || moves[0];
  if (!pass) return moves[0];
  const cb = view.combat;
  if (cb && cb.stage === 'attackers') return chooseAttack(view, moves, pass);
  if (cb && cb.stage === 'support') return moves.find((m) => m.type === 'supportSpirit') || pass;
  if (cb && cb.stage === 'blockers') return chooseBlock(view, moves, pass);
  if (cb && cb.stage === 'order') return chooseOrder(view, moves, pass);
  if (view.active !== view.me.idx || view.chain.length) return pass;
  if (['setup', 'start', 'damage', 'end'].includes(view.phase)) return pass;
  return chooseMain(view, moves, pass);
}

export function choose(view, moves) {
  try {
    const picked = decide(view, moves);
    if (picked && moves.indexOf(picked) >= 0) return picked;
  } catch (e) {
    // 任何内部异常都退回让过，保证总能返回合法动作
  }
  const p = moves.find((m) => m.type === 'pass');
  return p || moves[moves.length - 1];
}
