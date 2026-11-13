/** 确定性脚本 AI：只能选择一个 legalMoves 已枚举的动作，不能改写引擎状态。 */
const unitScore = (u) => (u?.atk || 0) / 1000 + (u?.imp || 0) * 1.5 + (u?.hp || 0) / 1200;
const cardByUid = (view, uid) => [...view.me.field, ...view.opp.field].find((c) => c.uid === uid);
const ownUnit = (view, uid) => view.me.field.find((c) => c.uid === uid);
const enemyUnit = (view, uid) => view.opp.field.find((c) => c.uid === uid);
const pass = { type: 'pass' };

function responseChoice(view, moves) {
  const counters = moves.filter((m) => m.type === 'play' && m.targets?.some((t) => String(t).startsWith('k')));
  if (counters.length && view.chain.some((x) => x.controller !== view.me.idx && !x.countered)) return counters[0];
  const direct = moves.find((m) => {
    if (m.type !== 'play') return false;
    const c = view.me.hand.find((x) => x.uid === m.uid);
    return c && ['火球术', '混沌冲击'].includes(c.name) && view.opp.life <= 3;
  });
  return direct || pass;
}

function combatChoice(view, moves) {
  const attacks = moves.filter((m) => m.type === 'attack');
  if (attacks.length) {
    const face = attacks.filter((m) => m.target === 'spirit');
    const totalImpact = face.reduce((n, m) => n + (ownUnit(view, m.uid)?.imp || 0), 0);
    if (face.length && (view.opp.field.length === 0 || totalImpact >= view.opp.life || view.me.stats.combatDamage <= view.opp.stats.directDamage + 8)) return face[0];
    const good = attacks.map((m) => {
      if (m.target === 'spirit') return { m, score: (ownUnit(view, m.uid)?.imp || 0) * 2 };
      const a = ownUnit(view, m.uid), t = enemyUnit(view, m.target);
      if (!a || !t) return { m, score: -99 };
      const kill = a.atk >= t.hp - t.damage, dies = t.atk >= a.hp - a.damage;
      return { m, score: (kill ? unitScore(t) * 2 : -1) - (dies ? unitScore(a) : 0) };
    }).sort((a, b) => b.score - a.score);
    if (good[0]?.score > 0) return good[0].m;
    if (face.length) return face[0];
  }
  if (moves.some((m) => m.type === 'supportSpirit')) return { type: 'supportSpirit' };
  const blocks = moves.filter((m) => m.type === 'block');
  if (blocks.length) {
    const attacker = enemyUnit(view, view.combat?.attackerUid);
    const chosen = view.combat?.blockers || [];
    const candidates = blocks.filter((m) => !chosen.includes(m.uid)).map((m) => {
      const b = ownUnit(view, m.uid);
      const kills = b && attacker && b.atk >= attacker.hp - attacker.damage;
      const survives = b && attacker && b.hp - b.damage > attacker.atk;
      return { m, score: (kills ? 4 : 0) + (survives ? 1 : -unitScore(b) * 0.25) };
    }).sort((a, b) => b.score - a.score);
    if (candidates[0] && (candidates[0].score > 0 || chosen.length === 0)) return candidates[0].m;
  }
  const order = moves.find((m) => m.type === 'orderBlockers');
  if (order) return order;
  return pass;
}

export const TACTICIAN = {
  id: 'tactician', name: '回响·战术脚本',
  desc: '曲线铺场、解场、交换与响应；只使用引擎给出的合法动作。',
  choose(view, moves) {
    if (!moves.length) throw new Error('AI 收到空动作集');
    if (moves.some((m) => m.type === 'inspectReveal')) {
      const inspected = view.inspect?.card;
      if (inspected && inspected.trigger && inspected.trigger !== '—') return { type: 'inspectReveal' };
    }
    if (moves.some((m) => m.type === 'inspectTake')) return { type: 'inspectTake' };
    if (view.combat && ['attackers', 'support', 'blockers', 'order'].includes(view.combat.stage)) return combatChoice(view, moves);
    if (view.priority !== view.me.idx || view.active !== view.me.idx) return responseChoice(view, moves);

    // 灵质质密通常优先于把它当普通费用长期搁置。
    const quality = moves.find((m) => m.type === 'ability' && ['幻梦聚合体', '混沌聚合体', '水晶聚合体'].includes(m.name));
    if (quality) return quality;

    const essence = moves.filter((m) => m.type === 'setEssence').sort((a, b) => {
      const ca = view.me.hand.find((x) => x.uid === a.uid), cb = view.me.hand.find((x) => x.uid === b.uid);
      return (cb?.cost.total || 0) - (ca?.cost.total || 0);
    });
    if (essence.length) {
      const plays = moves.filter((m) => m.type === 'play');
      if (!plays.length || view.me.essence.length < 5) return essence[0];
    }

    const plays = moves.filter((m) => m.type === 'play').map((m) => {
      const c = view.me.hand.find((x) => x.uid === m.uid);
      let score = (c?.cost.total || 0) * 0.35;
      if (c?.type === '灵像') score += 2 + (c.attack || 0) / 1500 + (c.vitality || 0) / 2500;
      if (['火球术', '混沌冲击'].includes(c?.name)) score += view.opp.life <= 3 ? 20 : 1.5;
      if (['智慧之光', '冒险准备'].includes(c?.name)) score += view.me.handCount <= 4 ? 4 : 1;
      if (['圣光肃清'].includes(c?.name)) score += view.opp.field.length >= view.me.field.length + 2 ? 12 : -6;
      if (['次元超越'].includes(c?.name)) score += view.me.field.length ? 15 : 4;
      for (const t of m.targets || []) {
        const enemy = enemyUnit(view, t);
        if (enemy) score += unitScore(enemy) * 1.8;
      }
      if (m.mode === 'bury') score += view.me.handCount >= 4 ? 1.5 : -2;
      if (m.mode === 'condense' || m.mode === 'both') score += 2;
      return { m, score };
    }).sort((a, b) => b.score - a.score);
    if (plays[0]?.score > 0.5) return plays[0].m;

    const abilities = moves.filter((m) => m.type === 'ability' || m.type === 'spiritSpecial');
    if (abilities.length) {
      const token = abilities.find((m) => ['梦境采集者', '幻梦战将', '梦境巡逻员'].includes(m.name) && m.mode !== 'damage');
      if (token) return token;
      const removal = abilities.find((m) => m.targets?.some((t) => enemyUnit(view, t)));
      if (removal) return removal;
      return abilities[0];
    }
    if (essence.length) return essence[0];

    const spirit = moves.find((m) => m.type === 'spiritDraw');
    if (spirit && view.me.handCount <= 7) return spirit;

    // 响应阶段不为了“有事做”而浪费解牌；主要阶段才主动使用。
    if (!['main1', 'main2'].includes(view.phase)) return responseChoice(view, moves);
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  },
};

export const PASSIVE = {
  id: 'passive', name: '规则探针·总是让过',
  desc: '仅用于测试阶段推进；仍会完成检视选择。',
  choose(view, moves) {
    return moves.find((m) => m.type === 'inspectTake') || moves.find((m) => m.type === 'pass') || moves[0];
  },
};

export const BUILTIN = [TACTICIAN, PASSIVE];
