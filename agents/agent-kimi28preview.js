// 策略名称：余烬速燃（Ember Rush）
// 选择理由：blitz 只有 6 点生命，红色拥有全卡池最密集的 1—3 费单位与最多的灵体直伤，
//           配合灵体「余烬执火者」每回合 +1000 攻/+1 冲击的免费增益，抢血与斩杀都最快。
// 主责模式：blitz

export const meta = {
  id: 'kimi28preview',
  model: 'KIMI 2.8preview',
  modelId: 'kimi-k2.8-preview',
  name: '余烬速燃',
  desc: 'blitz 6 点生命下，用红色低费敏捷单位抢血、直伤灵感收尾的速攻。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

// 52 张：红 34（65.4%，满足 ≥60%）+ 黄 14（duo 模式第二色，均 ≥10）+ 灰 4（混沌冲击，任意灵能可付）。
// 曲线：1 费 12 / 2 费 24 / 3 费 8 / 5 费 2。每回合只能设 1 张灵质，曲线必须压低。
export const deck = {
  // —— 红 34：主体 ——
  '火焰鸟': 4,        // 1 费 1000/1 敏捷威慑，最快抢血
  '烈焰聚合体': 4,      // 1 费质密，横置 +2000 攻，配合灵体增益斩杀
  '爆燃': 4,          // 1 费解场/补刀，受伤目标打 3000
  '地狱犬': 4,        // 2 费 2000/1 预制自愈，当回合即可攻
  '灰烬小僧': 2,       // 2 费，终曲烧 1，死了也赚
  '血怒': 4,          // 2 费 +1000/+1，受伤目标 +2000/+1
  '烈焰之力': 2,       // 2 费 +2000/+1 爆发
  '烈焰斗士': 4,       // 3 费 3500 先攻敏捷，交换王牌
  '火球术': 4,        // 3 费烧 2，主力直伤
  '焚尽': 2,          // 5 费烧 3（空场烧 4），终结技
  // —— 黄 14：duo 第二色，全部 1—2 费低色费需求 ——
  '雷霆打击': 4,       // 1 费打 2000， cheapest removal
  '雷鸣侍从': 4,       // 2 费 1500/1/2000，启动 +500 攻
  '雷铸工匠': 2,       // 2 费 1500/1 灵气，序曲激活 2
  '力量共鸣': 2,       // 2 费全体 +500 攻
  '雷铸天兵': 2,       // 2 费 +1000/+1
  // —— 灰 4：斩杀补刀 ——
  '混沌冲击': 4,       // 2 费烧 1，任意灵能支付
};

export const spirit = '余烬执火者';
export const color = '红';

// —— 工具（纯函数，不改 view/moves）——

function cardByUid(list, uid) {
  for (const c of list || []) if (c.uid === uid) return c;
  return null;
}

function best(moves, score) {
  let top = null;
  let topScore = -Infinity;
  for (const m of moves) {
    const s = score(m);
    if (s > topScore) { topScore = s; top = m; }
  }
  return top;
}

// 直伤卡对对方灵体的伤害
function burnDamage(name, me) {
  if (name === '火球术') return 2;
  if (name === '混沌冲击') return 1;
  if (name === '焚尽') return (me.field || []).length === 0 ? 4 : 3;
  return 0;
}

// —— 各阶段决策 ——

function pickAttack(view, moves) {
  const oppField = view.opp.field || [];
  const passScore = 4;
  const score = (m) => {
    const self = cardByUid(view.me.field, m.uid);
    if (!self) return -1;
    if (m.target === 'spirit') return 8 + (self.imp || 0) * 2;
    const def = cardByUid(oppField, m.target);
    if (!def) return -1;
    let s = 1;
    if ((self.atk || 0) >= (def.hp || 0)) {
      s = 7;
      if ((def.imp || 0) >= 2) s += 2;          // 优先拆掉冲击 2 的威胁
      if ((def.atk || 0) > (self.hp || 0)) s += 1; // 换掉比我大的攻击者
    }
    return s;
  };
  const top = best(moves.filter((m) => m.type === 'attack'), score);
  if (top && score(top) > passScore) return top;
  return moves.find((m) => m.type === 'pass');
}

function pickSupport(view, moves) {
  const sup = moves.find((m) => m.type === 'supportSpirit');
  if (sup) {
    const atk = cardByUid(view.me.field, view.combat.attackerUid);
    const oppField = view.opp.field || [];
    // 打生命且（对方场面小或冲击已够高）时，暴击 +1000/+1 很值
    if (atk && view.combat.target === 'spirit' &&
        (oppField.length <= 1 || (atk.imp || 0) >= 2 || (view.opp.life || 99) <= 3)) {
      return sup;
    }
  }
  return moves.find((m) => m.type === 'pass');
}

function pickBlock(view, moves) {
  const chosen = view.combat.blockers || [];
  const fresh = moves.filter((m) => m.type !== 'block' || !chosen.includes(m.uid));
  const attacker = cardByUid(view.opp.field, view.combat.attackerUid);
  const imp = attacker ? (attacker.imp || 0) : 1;
  const atk = attacker ? (attacker.atk || 0) : 0;
  const passScore = 3;
  const score = (m) => {
    if (m.type !== 'block') return passScore - 1; // pass 基线 3
    const self = cardByUid(view.me.field, m.uid);
    if (!self) return -1;
    let s = imp * 3;                             // 挡住 1 点生命伤害值 3 分
    if (imp >= (view.me.life || 99)) s += 100;   // 致命一击必须挡
    if ((self.atk || 0) >= (attacker ? attacker.hp : 1)) s += 3; // 能反杀
    if ((self.hp || 0) <= atk) s -= 3;           // 会送掉自己
    return s;
  };
  const top = best(fresh, score);
  if (top && top.type === 'block' && score(top) > passScore) return top;
  return moves.find((m) => m.type === 'pass');
}

function scorePlayMain(view, m) {
  const card = cardByUid(view.me.hand, m.uid);
  if (!card) return 0;
  const oppLife = view.opp.life || 99;
  const myField = view.me.field || [];
  const oppField = view.opp.field || [];
  const name = card.name;

  // 直伤烧灵体
  if (name === '火球术' || name === '混沌冲击' || name === '焚尽') {
    const dmg = burnDamage(name, view.me);
    let s = 2;
    if (oppLife <= dmg) s += 30;                 // 直接斩杀
    else if (oppLife <= dmg + 2) s += 5;         // 逼近斩杀线
    if (view.turn >= 6) s += 1;                  // 后期不留
    return s;
  }
  // 解场
  if (name === '爆燃' || name === '雷霆打击') {
    const dmgCap = name === '爆燃' ? 3000 : 2000;
    const target = oppField.find((c) => (c.hp || 0) <= dmgCap && c.type === '灵像');
    if (!target) return 0.5;
    if ((target.imp || 0) >= 2 || oppField.length >= 3) return 5;
    return 3.5;
  }
  //  buff 类：场上有未横置灵像才值得
  if (name === '血怒' || name === '烈焰之力' || name === '雷铸天兵' || name === '力量共鸣') {
    const hasReady = myField.some((c) => !c.tapped && c.type === '灵像' && !c.token);
    if (!hasReady) return 0.5;
    return oppLife <= 3 ? 6 : 4.5;
  }
  // 回收直伤
  if (name === '余烬回燃') {
    return (view.me.handCount || 0) <= 3 ? 5 : 1;
  }
  // 灵像：按费用与冲击力评分，曲线越低越优先
  if (card.type === '灵像') {
    let s = 5 + (card.imp || 0) * 1.5 - (card.cost ? card.cost.total : 0) * 0.08;
    if ((card.keywords || []).includes('预制')) s += 0.6;
    if ((card.keywords || []).includes('超冲击')) s += 1.2;
    return s;
  }
  // 灵性（熔炉之核）
  if (card.type === '灵性') return 3.8;
  return 1;
}

function pickMain(view, moves) {
  const myField = view.me.field || [];
  const oppLife = view.opp.life || 99;
  const handCount = view.me.handCount || 0;

  const score = (m) => {
    switch (m.type) {
      case 'play':
        return scorePlayMain(view, m);
      case 'setEssence': {
        // 每回合只设 1 张灵质：前期必设，手牌少时慎设；优先把高费卡设掉
        const card = cardByUid(view.me.hand, m.uid);
        const cost = card && card.cost ? card.cost.total : 1;
        let s = 4.2 + cost * 0.05;
        if (card && card.color === '黄') s += 1.2;   // 优先把黄色卡设成灵质，保证黄卡能付
        if (view.turn <= 3) s += 0.9;
        if (handCount >= 6) s += 0.8;
        if (handCount <= 3 && view.turn > 3) s -= 2.2;
        return s;
      }
      case 'spiritSpecial': {
        // 余烬执火者：+1000 攻/+1 冲击，给能打的灵像
        const ready = myField.some((c) => !c.tapped && c.type === '灵像');
        if (!ready) return 0.5;
        return oppLife <= 4 ? 6.5 : 5.6;
      }
      case 'spiritDraw': {
        if (handCount <= 2) return 5;
        if (handCount <= 4) return 2.8;
        return 0.4;
      }
      case 'ability': {
        // 熔岩投手启动打 1000 / 熔炉之核类
        const src = cardByUid(myField, m.uid) || cardByUid(view.me.essence || [], m.uid);
        if (src && (view.opp.field || []).length > 0) return 3.2;
        return 0.2;
      }
      case 'tapEssence':
        return 0.1;
      case 'pass':
        return 0;
      default:
        return 0.1;
    }
  };

  const top = best(moves, score);
  if (top && score(top) > 0) return top;
  return moves.find((m) => m.type === 'pass');
}

// 响应对方（对方回合/连锁中）：只有灵感卡与 pass；只在能斩杀或贴近斩杀线时出手
function pickResponse(view, moves) {
  const oppLife = view.opp.life || 99;
  const score = (m) => {
    if (m.type !== 'play') return 0;
    const card = cardByUid(view.me.hand, m.uid);
    if (!card) return 0;
    const dmg = burnDamage(card.name, view.me);
    if (dmg > 0) {
      if (oppLife <= dmg) return 40;             // 响应斩杀
      if (oppLife <= dmg + 1) return 6;          // 逼近斩杀线，先烧
      return 0.2;
    }
    if (card.name === '爆燃' || card.name === '雷霆打击') {
      const oppField = view.opp.field || [];
      const dmgCap = card.name === '爆燃' ? 3000 : 2000;
      const target = oppField.find((c) => c.type === '灵像' && (c.hp || 0) <= dmgCap);
      return target ? 2.5 : 0.1;                 // 顺手解掉威胁
    }
    return 0.1;
  };
  const top = best(moves, score);
  if (top && score(top) >= 2) return top;
  return moves.find((m) => m.type === 'pass');
}

// —— 入口 ——

export function choose(view, moves) {
  try {
    if (view.inspect) {
      const take = moves.find((m) => m.type === 'inspectTake');
      if (take) return take;
    }
    const c = view.combat;
    if (c && c.stage === 'order') {
      const ord = moves.find((m) => m.type === 'orderBlockers');
      if (ord) return ord;
    }
    if (c && c.stage === 'attackers') {
      const r = pickAttack(view, moves);
      if (r) return r;
    }
    if (c && c.stage === 'support') {
      const r = pickSupport(view, moves);
      if (r) return r;
    }
    if (c && c.stage === 'blockers') {
      const r = pickBlock(view, moves);
      if (r) return r;
    }
    const inMain = (view.phase === 'main1' || view.phase === 'main2') &&
      view.active === view.me.idx && (!view.chain || view.chain.length === 0);
    const r = inMain ? pickMain(view, moves) : pickResponse(view, moves);
    if (r) return r;
  } catch (e) {
    // 异常兜底：让过
  }
  return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
}
