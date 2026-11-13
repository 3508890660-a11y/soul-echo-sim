// 策略名称：余烬圣所（Ember Sanctum）
// 选择理由：grand 长局（生命 15、起手 5、牌库 50—60）里，谁的生命卡组先被拆空谁输。
//           白系提供「生命回填＋解场」稳住生命线，红系提供「直伤烧脸＋冲击生物」收尾；
//           直伤（对灵体造成 X 点伤害）绕过阻挡直接削生命，配合白系续航形成耗死对手的节奏。
// 主责模式：grand
//
// 零依赖 ES Module。choose(view, moves) 永远原样返回 moves 数组里的一个元素，不新建、不改字段、
// 不对 moves 排序、不修改 view，无模块级可变状态，任何分支都能返回，不抛异常。

export const meta = {
  id: 'hy3',
  model: 'hy3',
  modelId: 'hy3',
  name: '余烬圣所',
  desc: '白红双色：白色续航与解场稳住 15 点生命线，红色直伤与冲击生物收尾拆空对方生命卡组。',
  primaryMode: 'grand',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  // ── 白（28 张）：生命回填 + 解场 + 墙 + 炸弹 ──
  '圣光打击': 4,        // 2费 5000 点伤害，优质单解
  '治愈灵光': 2,        // 2费 主卡组顶→生命顶（回填生命）
  '圣光聚合体': 3,      // 1费 质密，横置把自身塞回生命顶（续航引擎，兼灵质）
  '圣疗': 2,            // 3费 回血 5000
  '净化仪式': 2,        // 4费 破坏 1 单位，攻击>生命则破坏 2
  '晨祷侍从': 2,        // 2费 入场回血 1000
  '光能守护者': 2,      // 3费 守护+自愈 墙
  '圣光祷告者': 2,      // 5费 守护+诱饵+终曲回生命（粘性威胁）
  '赎罪骑士': 2,        // 5费 守护+终曲回填生命
  '圣所钟塔': 2,        // 4费 灵性 回响：结束回血全体 1000
  '誓约之环': 2,        // 2费 灵性 回响：单位死亡回填生命
  '圣光战将': 2,        // 6费 序曲破坏 2 敌、守护、自愈（炸弹）
  '圣光肃清': 1,        // 7费 破坏全场（劣势清场用）
  // ── 红（30 张）：直伤烧脸 + 冲击生物 + 去除 ──
  '火球术': 4,          // 3费 对灵体 2 点（直伤）
  '焚尽': 3,            // 5费 对灵体 3 点，无场则 4 点（收尾）
  '灰烬小僧': 3,        // 2费 终曲对灵体 1 点（烧脸小生物）
  '烈焰战将': 2,        // 6费 终曲对灵体 1 点、超冲击、冲击 2（穿透收尾）
  '火种祭坛': 2,       // 2费 灵性 启动：自爆一单位 + 对灵体 1 点（烧脸引擎）
  '烈焰斗士': 2,       // 3费 预制+敏捷+先攻（快攻身板）
  '地狱犬': 2,          // 2费 预制+自愈
  '火焰鸟': 2,          // 1费 敏捷+威慑（便宜飞行）
  '熔岩投手': 2,       // 4费 启动：对敌单位 1000 伤害（去除）
  '血怒': 2,            // 2费 buff +1000 攻 +1 冲（受伤则 +2000）
  '烈焰之力': 2,       // 2费 buff +2000 攻 +1 冲（回合结束自爆）
  '爆燃': 2,            // 1费 1000 伤害，受伤则 3000（去除）
  '余烬回燃': 2,       // 3费 红色灵感回手，生命<5 则多 1（续航）
};

export const spirit = '圣所守夜人';
export const color = '白';

// ─────────────────────────────────────────────────────────────
// 工具函数（全部纯函数，不持有跨回合状态）
// ─────────────────────────────────────────────────────────────

function fcard(view, uid) {
  if (!uid) return null;
  const lists = [view.me.hand, view.me.field, view.me.essence, view.opp.field, view.opp.essence];
  for (const L of lists) {
    if (!L) continue;
    for (const c of L) if (c && c.uid === uid) return c;
  }
  return null;
}

function oppThreat(view) {
  let best = 0;
  const f = view.opp.field || [];
  for (const u of f) {
    const v = (u.atk || 0) + (u.hp || 0) - (u.damage || 0);
    if (v > best) best = v;
  }
  return best;
}

function damagedUnit(view) {
  return (view.me.field || []).some((u) => (u.damage || 0) > 0);
}

function essenceCounts(me) {
  const o = {};
  for (const c of me.essence || []) {
    const col = c.color || '灰';
    o[col] = (o[col] || 0) + 1;
  }
  return o;
}

// ─────────────────────────────────────────────────────────────
// 各动作评分
// ─────────────────────────────────────────────────────────────

function scoreSetEssence(view, m) {
  const c = fcard(view, m.uid);
  if (!c) return 60;
  let s = 60;
  s += (c.cost ? c.cost.total : 0) * 4; // 优先塞高费（当前打不出的）当灵质，保留低费可玩
  const same = (view.me.hand || []).filter((x) => x.name === c.name).length;
  if (same > 1) s += 8;
  const ec = essenceCounts(view.me);
  const mine = ec[c.color] || 0;
  const other = c.color === '白' ? (ec['红'] || 0) : (ec['白'] || 0);
  if (mine < other) s += 6; // 补稀少的颜色
  return s;
}

function scorePlay(view, m) {
  const c = fcard(view, m.uid);
  if (!c) return 20;
  if (c.type === '灵像') {
    let s = 40 + (c.imp || 0) * 120 + Math.min(c.atk || 0, 4000) * 0.06;
    const kw = c.keywords || [];
    for (const k of kw) {
      if (k === '预制') s += 25;
      else if (k === '守护') s += 20;
      else if (k === '灵气') s += 10;
      else if (k === '敏捷') s += 15;
      else if (k === '先攻') s += 20;
      else if (k === '践踏') s += 15;
      else if (k === '超冲击') s += 20;
      else if (k === '威慑') s += 10;
      else if (k === '自愈') s += 15;
      else if (k === '富集') s += 10;
    }
    if (c.name === '灰烬小僧' || c.name === '烈焰战将') s += 20; // 终曲烧脸
    if ((c.cost ? c.cost.total : 0) >= 6) s += 10;
    return s;
  }
  if (c.type === '灵性') {
    let s = 32;
    if (['圣所钟塔', '誓约之环', '火种祭坛'].includes(c.name)) s += 18;
    return s;
  }
  if (c.type === '灵感') return scoreInspiration(view, c);
  return 30;
}

function scoreInspiration(view, c) {
  const me = view.me, opp = view.opp;
  const threat = oppThreat(view);
  switch (c.name) {
    case '圣光打击': return 90 + threat * 0.05;
    case '净化仪式': return 85 + threat * 0.05;
    case '火球术': return 92 + Math.max(0, 12 - opp.life) * 4;
    case '焚尽': return 100 + Math.max(0, 11 - opp.life) * 5;
    case '爆燃': return 60 + threat * 0.04;
    case '混沌打击': return 55 + threat * 0.04;
    case '治愈灵光': return 50 + (me.life < 10 ? 30 : 0);
    case '圣疗': return 45 + (me.life < 10 ? 30 : 0) + (damagedUnit(view) ? 10 : 0);
    case '圣光肃清': return (opp.field.length >= 2 && me.field.length <= 2) ? 120 : 5;
    case '烈焰之力': return (me.field || []).some((u) => (u.atk || 0) >= 3000) ? 70 : 40;
    case '血怒': return (me.field || []).length ? 50 : 30;
    case '余烬回燃': return 45;
    default: return 40;
  }
}

function scoreAbility(view, m) {
  switch (m.name) {
    case '圣光聚合体': return 50 + (view.me.life <= 10 ? 20 : 0);
    case '火种祭坛': {
      const weak = (view.me.field || []).filter((u) => (u.atk || 0) < 1500 || u.token);
      return weak.length ? 48 : 10;
    }
    case '熔岩投手': {
      let sv = 45;
      const t = m.targets && m.targets[0];
      if (t) { const u = fcard(view, t); if (u) sv += ((u.atk || 0) + (u.hp || 0)) * 0.04; }
      return sv;
    }
    default: return 20;
  }
}

function scoreSpiritSpecial(view, m) {
  if (damagedUnit(view)) return 80; // 给受伤单位回 2000 血，物有所值
  return 30; // 无受伤单位时不如过牌
}

function scoreAttack(view, m) {
  const attacker = fcard(view, m.uid);
  if (!attacker) return 20;
  const impVal = attacker.imp || 0;
  const atkVal = attacker.atk || 0;
  if (m.target === 'spirit') {
    // 直扑脸：推进生命伤害，符合烧脸收尾计划
    return 55 + impVal * 80 + atkVal * 0.05;
  }
  const tgt = fcard(view, m.target);
  if (!tgt) return 40;
  const lethal = atkVal >= ((tgt.hp || 0) - (tgt.damage || 0));
  let s = 45 + (lethal ? 45 : 0);
  if ((tgt.atk || 0) >= 3000) s += 20;
  return s;
}

function scoreSupport(view) {
  const cb = view.combat;
  let s = 60;
  if (cb && cb.target === 'spirit') s += 30 + (view.opp.life < 8 ? 30 : 0);
  else s += 10;
  return s;
}

function scoreBlock(view, m) {
  const cb = view.combat;
  if (!cb) return 0;
  // 已在阻挡列表中的单位若再返回 block 会“取消阻挡”，导致来回切换的死循环。
  // 因此：已阻挡的单位一律不碰，只在「尚未阻挡」且确实有利时才新增阻挡。
  const already = (cb.blockers || []).includes(m.uid);
  if (already) return -100;
  const attacker = fcard(view, cb.attackerUid);
  const blocker = fcard(view, m.uid);
  if (!attacker || !blocker) return -100;
  const aAtk = attacker.atk || 0;
  const aHp = (attacker.hp || 0) - (attacker.damage || 0);
  const bAtk = blocker.atk || 0;
  const bHp = (blocker.hp || 0) - (blocker.damage || 0);
  const kills = bAtk >= aHp;
  const survives = bHp > aAtk;
  if (cb.target === 'spirit') {
    if (kills && survives) return 85;
    if (kills) return 55;
    if (view.me.life <= 6) return 40; // 濒死才白送挡脸
    return -5; // 健康且挡不住就不挡，放过去，保持对攻节奏
  }
  // 对方攻击我方单位：仅在能反杀攻击者时才挡
  if (kills && survives) return 60;
  if (kills) return 40;
  return -5;
}

function scoreMove(view, m) {
  switch (m.type) {
    case 'pass': return 0;
    case 'tapEssence': return -1; // 费用支付自动横置，无需手动
    case 'inspectTake': return 30;
    case 'inspectReveal': return 10;
    case 'setEssence': return scoreSetEssence(view, m);
    case 'play': return scorePlay(view, m);
    case 'ability': return scoreAbility(view, m);
    case 'spiritSpecial': return scoreSpiritSpecial(view, m);
    case 'spiritDraw': return 35;
    case 'attack': return scoreAttack(view, m);
    case 'supportSpirit': return scoreSupport(view);
    case 'block': return scoreBlock(view, m);
    case 'orderBlockers': return 5;
    default: return 0;
  }
}

function pick(view, moves) {
  const me = view.me;
  // 1) 灵体检视：免费拿牌
  if (view.inspect) {
    const take = moves.find((m) => m.type === 'inspectTake');
    if (take) return take;
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
  // 2) 战斗阶段
  if (view.combat) {
    const stage = view.combat.stage;
    if (stage === 'attackers') {
      let best = null, bs = -1;
      for (const m of moves) {
        const s = scoreMove(view, m);
        if (s > bs) { bs = s; best = m; }
      }
      return best || (moves.find((m) => m.type === 'pass') || moves[moves.length - 1]);
    }
    if (stage === 'support') {
      const sup = moves.find((m) => m.type === 'supportSpirit');
      if (sup && scoreSupport(view) > 0) return sup;
      return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
    }
    if (stage === 'blockers') {
      let best = null, bs = 0;
      for (const m of moves) {
        if (m.type === 'block') {
          const s = scoreBlock(view, m);
          if (s > bs) { bs = s; best = m; }
        }
      }
      if (best) return best;
      return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
    }
    if (stage === 'order') {
      const ob = moves.find((m) => m.type === 'orderBlockers');
      if (ob) return ob;
      return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
    }
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  }
  // 3) 主要阶段 / 响应阶段：统一打分
  let best = null, bs = -Infinity;
  for (const m of moves) {
    const s = scoreMove(view, m);
    if (s > bs) { bs = s; best = m; }
  }
  return best || (moves.find((m) => m.type === 'pass') || moves[moves.length - 1]);
}

export function choose(view, moves) {
  try {
    const mv = pick(view, moves);
    if (mv) return mv;
  } catch (e) {
    // 任何异常退回让过，绝不抛出
  }
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
