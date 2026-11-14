// =====================================================================
// 策略名称：回响巨像（Echo Colossus）
// 选择理由：绿色灵脉加速（根脉育苗者每回合横置 +1 灵质并抽牌）是 SE01 最稳定的
//          经济引擎，能最快拍出带「预制·超冲击·践踏」的森林战将与王牌巨像，
//          这些巨像即使被阻挡也能穿透冲击直击生命，是最难被解掉的终结手段。
// 主责模式：standard
// =====================================================================

export const meta = {
  id: 'deepseekv4pro',
  model: 'deepseek v4pro',
  modelId: 'deepseek-v4-pro',
  name: '回响巨像',
  desc: '根脉育苗者每回合横置灵体加速并抽牌，快速拍出带预制·超冲击·践踏的森林战将与王牌巨像，绕过阻挡直击生命。',
  primaryMode: 'standard',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // 绿色核心（36）
  '幼苗守望者': 4,
  '部落祭司': 4,
  '自然生长': 4,
  '丰收': 2,
  '森林守卫者': 2,
  '森林狼王': 2,
  '古树牧者': 2,
  '藤蔓编织者': 2,
  '森林战将': 4,
  '王牌巨象': 4,
  '全面成长': 4,
  '根须缠绕': 2,
  // 白色辅助（10）：解场 + 守护，补足绿色的短板
  '圣光打击': 4,
  '净化仪式': 2,
  '光能守护者': 2,
  '晨祷侍从': 2,
  // 灰色（4）：前期曲线
  '新人冒险者': 4,
};

export const spirit = '根脉育苗者';
export const color = '绿';

// ─────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────
function has(c, kw) { return Array.isArray(c && c.keywords) && c.keywords.includes(kw); }
function countColor(cards, col) { return (cards || []).filter((c) => c && c.color === col).length; }
function passMove(moves) { return moves.find((m) => m.type === 'pass') || moves[moves.length - 1]; }
function cardByUid(cards, uid) { return (cards || []).find((c) => c && c.uid === uid) || null; }

// 卡牌保留价值：越低越愿意设为灵质（王牌巨象/森林战将是绝对保留的核心）
function keepValue(c) {
  switch (c.name) {
    case '王牌巨象': return 120;
    case '森林战将': return 110;
    case '全面成长': return 75;
    case '圣光打击': return 72;
    case '净化仪式': return 70;
    case '丰收': return 60;
    case '光能守护者': return 55;
    case '幼苗守望者': return 52;
    case '自然生长': return 52;
    case '部落祭司': return 50;
    case '古树牧者': return 48;
    case '森林狼王': return 46;
    case '森林守卫者': return 42;
    case '根须缠绕': return 40;
    case '藤蔓编织者': return 35;
    case '晨祷侍从': return 28;
    case '新人冒险者': return 20;
    default: return 30;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────
export function choose(view, moves) {
  try {
    return decide(view, moves) || passMove(moves);
  } catch (err) {
    return passMove(moves);
  }
}

function decide(view, moves) {
  if (!moves || !moves.length) return null;

  // 检视阶段：免费拿牌即可（不支付揭示费用）
  if (view.inspect) {
    return moves.find((m) => m.type === 'inspectTake') || moves[0];
  }

  const cb = view.combat;
  if (cb) {
    if (cb.stage === 'attackers') return decideAttackers(view, moves);
    if (cb.stage === 'support') {
      const sup = moves.find((m) => m.type === 'supportSpirit');
      return (sup && cb.target === 'spirit') ? sup : passMove(moves);
    }
    if (cb.stage === 'blockers') return decideBlockers(view, moves);
    if (cb.stage === 'order') return moves[0];
  }

  const myMain = view.active === view.me.idx
    && (view.phase === 'main1' || view.phase === 'main2')
    && !view.chain.length;
  if (myMain) return decideMain(view, moves);

  // 响应窗口或其它阶段：默认让过，费用留给自己的回合
  return passMove(moves);
}

// ─────────────────────────────────────────────────────────────────────
// 主要阶段
// ─────────────────────────────────────────────────────────────────────
function decideMain(view, moves) {
  // 1) 灵体加速（根脉育苗者：+1 灵质并抽 1）——最强价值动作，每回合优先
  const spiritM = moves.find((m) => m.type === 'spiritSpecial');
  if (spiritM) return spiritM;

  // 2) 打分所有出牌
  const plays = moves.filter((m) => m.type === 'play');
  let bestPlay = null, bestPlayScore = -Infinity;
  for (const m of plays) {
    const s = playScore(m, view);
    if (s > bestPlayScore) { bestPlayScore = s; bestPlay = m; }
  }

  // 3) 终曲/核心（>=100）立即拍下
  if (bestPlay && bestPlayScore >= 100) return bestPlay;

  // 4) 设灵质（每回合 1 次，加速）
  if (shouldSetEssence(view)) {
    const setM = pickSetEssence(view, moves);
    if (setM) return setM;
  }

  // 5) 其它出牌
  if (bestPlay && bestPlayScore >= 20) return bestPlay;

  // 6) 兜底让过
  return passMove(moves);
}

function shouldSetEssence(view) {
  if (view.me.essence.length >= 8) return false;   // 费已足够
  if (view.me.hand.length <= 1) return false;       // 手牌太少，不设
  return true;
}

function pickSetEssence(view, moves) {
  const setMoves = moves.filter((m) => m.type === 'setEssence');
  if (!setMoves.length) return null;
  const whiteInHand = view.me.hand.filter((c) => c.color === '白');
  const needWhite = countColor(view.me.essence, '白') === 0 && whiteInHand.length >= 2;
  let best = null, bestScore = Infinity;
  for (const m of setMoves) {
    const c = cardByUid(view.me.hand, m.uid);
    if (!c) continue;
    let s = keepValue(c);
    if (needWhite && c.color === '白') s -= 40;   // 需要白费时优先设白卡
    if (s < bestScore) { bestScore = s; best = m; }
  }
  if (bestScore >= 100) return null;               // 只剩终曲，不牺牲
  return best;
}

function playScore(m, view) {
  const c = cardByUid(view.me.hand, m.uid);
  if (!c) return -1000;
  const name = c.name;
  const totalEss = view.me.essence.length;
  let s = 0;
  switch (name) {
    case '王牌巨象': s = 120; break;
    case '森林战将': s = 110; break;
    case '丰收': s = 75; break;
    case '自然生长': s = 62; break;
    case '幼苗守望者': s = 60; break;
    case '部落祭司': s = 58; break;
    case '全面成长': s = 55 + pumpBonus(m, view); break;
    case '圣光打击': s = 50 + removalBonus(m, view, 5000); break;
    case '净化仪式': s = 48 + removalBonus2(m, view); break;
    case '光能守护者': s = 52; break;
    case '古树牧者': s = 50; break;
    case '森林狼王': s = 46; break;
    case '森林守卫者': s = 44; break;
    case '根须缠绕': s = 30 + tapBonus(m, view); break;
    case '藤蔓编织者': s = 36; break;
    case '晨祷侍从': s = 26; break;
    case '新人冒险者': s = 20; break;
    default: s = 15;
  }
  // 加速牌在费用已足时价值下降
  if (['丰收', '自然生长', '幼苗守望者', '部落祭司'].includes(name)) {
    s -= Math.max(0, (totalEss - 6) * 12);
  }
  return s;
}

function pumpBonus(m, view) {
  const t = m.targets && m.targets[0];
  const targetCard = cardByUid(view.me.field, t);
  if (!targetCard) return -40;
  let b = 10;
  if ((targetCard.imp || 0) >= 2) b += 18;
  else if ((targetCard.imp || 0) >= 1) b += 10;
  if (has(targetCard, '超冲击') || has(targetCard, '践踏')) b += 15;
  if ((targetCard.atk || 0) >= 3000) b += 5;
  return b;
}

function removalBonus(m, view, dmg) {
  const t = m.targets && m.targets[0];
  const targetCard = cardByUid(view.opp.field, t);
  if (!targetCard) return -80;                    // 目标是己方或不存在，不打
  let b = 8;
  if ((targetCard.hp || 0) <= dmg) b += 30;       // 能直接击杀
  if ((targetCard.atk || 0) >= 3000) b += 15;
  if ((targetCard.imp || 0) >= 2) b += 15;
  if (has(targetCard, '守护')) b += 12;
  return b;
}

function removalBonus2(m, view) {
  const targets = m.targets || [];
  const cards = targets.map((t) => cardByUid(view.opp.field, t)).filter(Boolean);
  if (!cards.length) return -60;
  let b = 10 + cards.length * 20;
  for (const t of cards) {
    if ((t.atk || 0) >= 3000) b += 8;
    if ((t.imp || 0) >= 2) b += 8;
  }
  return b;
}

function tapBonus(m, view) {
  const t = m.targets && m.targets[0];
  const targetCard = cardByUid(view.opp.field, t);
  if (!targetCard) return -40;
  let b = 8;
  if ((targetCard.atk || 0) >= 4000) b += 18;
  if (!targetCard.tapped) b += 6;
  return b;
}

// ─────────────────────────────────────────────────────────────────────
// 攻击阶段
// ─────────────────────────────────────────────────────────────────────
function decideAttackers(view, moves) {
  const oppField = view.opp.field || [];
  const myField = view.me.field || [];
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const u = cardByUid(myField, m.uid);
    if (!u) continue;
    let s;
    if (m.target === 'spirit') s = faceAttackScore(u, oppField);
    else {
      const t = cardByUid(oppField, m.target);
      if (!t) continue;
      s = unitAttackScore(u, t);
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  if (best && bestScore >= 0) return best;
  return passMove(moves);
}

function faceAttackScore(u, oppField) {
  const imp = u.imp || 0;
  if (imp <= 0) return -100;
  let s = 30 + imp * 25;
  if (has(u, '超冲击')) s += 45;
  if (has(u, '敏捷')) s += 15;
  if (has(u, '践踏')) s += 10;
  if (has(u, '碾压')) s += 20;
  // 没有穿透手段、又会被对方单位换死时，不值
  if (!has(u, '超冲击') && !has(u, '碾压')) {
    const killer = oppField.find((b) => (b.atk || 0) >= (u.hp || 0) && (b.atk || 0) > 0);
    if (killer) s -= 70;
  }
  return s;
}

function unitAttackScore(u, t) {
  const kill = (u.atk || 0) >= (t.hp || 0);
  const survive = (t.atk || 0) < (u.hp || 0);
  let s = 5;
  if (kill && survive) s += 45;                   // 白吃
  else if (kill && !survive) s += 15;              // 同归于尽
  if ((t.imp || 0) >= 2) s += 15;
  if (has(t, '守护')) s += 12;
  if (has(t, '诱饵')) s += 10;
  if ((t.atk || 0) >= 4000) s += 10;
  if (!kill && (t.atk || 0) >= (u.hp || 0)) s -= 40; // 打不过还送
  return s;
}

// ─────────────────────────────────────────────────────────────────────
// 阻挡阶段（block 是 toggle：必须过滤掉已宣告的阻挡者）
// ─────────────────────────────────────────────────────────────────────
function decideBlockers(view, moves) {
  const chosen = view.combat.blockers || [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const att = cardByUid(view.opp.field || [], view.combat.attackerUid);
  const target = view.combat.target;

  const blockMoves = fresh.filter((m) => m.type === 'block');
  if (!blockMoves.length) return passMove(fresh);

  const faceAttack = target === 'spirit';
  const imp = att ? (att.imp || 0) : 0;

  let wantBlock = false;
  if (faceAttack) {
    wantBlock = imp >= 1;                         // 打脸就挡
  } else {
    const myTarget = cardByUid(view.me.field || [], target);
    if (myTarget && att && (att.atk || 0) >= (myTarget.hp || 0) && keepValue(myTarget) >= 100) {
      wantBlock = true;                           // 保护核心单位
    }
  }
  if (!wantBlock) return passMove(fresh);

  let best = null, bestScore = -Infinity;
  for (const m of blockMoves) {
    const b = cardByUid(view.me.field || [], m.uid);
    if (!b) continue;
    let s = 0;
    if (att && (b.hp || 0) > (att.atk || 0)) s += 50;   // 能活下来
    else s -= 30;                                        // 会被打死
    if (att && (b.atk || 0) >= (att.hp || 0)) s += 40;   // 能反杀
    s -= keepValue(b) * 0.15;                            // 优先牺牲低价值牌
    if (has(b, '守护')) s += 10;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best || passMove(fresh);
}
