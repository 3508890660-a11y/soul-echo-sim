/**
 * SE01 声明式效果层。
 *
 * 设计动机：第一弹新增 95 张卡，若沿用 effects.js 的命令式 switch，会得到一份
 * 不可审计的巨型分支。这里把每张卡的效果写成「操作数组」，由统一的解释器执行，
 * 卡表文本与代码一一对应，新增卡只需要加一行数据。
 *
 * 操作（op）约定：
 *   [op, ...args]
 *   op = damage | heal | destroy | tap | buff | buffAll | draw | mill | millLife
 *      | deckToLife | lifeToGrave | scry | dream | crit | mana | untapEssence
 *      | createToken | bounce | toHand | summonFromGrave | selfExile | selfToLife
 *      | selfToGrave | lockUntap | discard | lifeDamage | graveToExile | graveToDeck
 *      | activate | destroyIfFragile | damageIfHurt | buffIfHurt | drawIfFewLife
 *      | damageIfTriggers | destroyOwnFor | destroyAll | skipTurn | counter
 *
 * 目标索引：op 里的数字参数是 targets 的下标（0 起）。
 * 阵营：'self' 自己、'opp' 对手。
 */
import { BY_ID } from './cards.js';

const NO_EFFECT = new Set([
  '圣所守卫', '焚城巨兵', '卷册守卫', '森林战将', '王牌巨象', '流浪佣兵',
  '光能守护者', '圣光聚合体', '黑暗聚合体', '混沌聚合体', '水晶聚合体', '烈焰聚合体',
  '火焰鸟', '地狱犬', '烈焰斗士', '荒原狼', '岩石巨像', '巨石守卫', '山岭巨人',
  '新人冒险者', '黑市商人', '织梦学徒', '梦境巡逻员', '梦质处理师', '幻梦战将',
  '梦境采集者', '预言学徒', '光能守护者', '圣光祷告者', '圣光战将', '亡魂役使者·伊可莱',
  '蹒跚的僵尸', '暗夜战将', '幻梦聚合体', '圣光聚合体',
]);

/** 卡名 → { 时机: [op...] }；时机取 main / enter / final / activate / LT / ST / MT / CT。 */
export const SE01_EFFECTS = {
  // ── 白 ─────────────────────────────────────────────
  晨祷侍从: { enter: [['heal', 0, 1000]] },
  赎罪骑士: { final: [['deckToLife', 'self', 1]] },
  白塔裁决者: { enter: [['destroy', 0]] },
  圣疗: { main: [['heal', 0, 5000]], CT: [['heal', 0, 3000]] },
  净化仪式: { main: [['destroy', 0], ['destroyIfFragile', 0, 1]] },
  圣所钟塔: { end: [['healAll', 'self', 1000]] },
  誓约之环: { unitDestroyed: [['deckToLife', 'self', 1]] },

  // ── 黑 ─────────────────────────────────────────────
  掘墓人: { enter: [['mill', 'self', 2]] },
  骨墙: { final: [['graveToDeck', 'self', 1]] },
  食魂者: { cardToGrave: [['selfBuff', 250, 0, 250]] },
  深渊引路人: { enter: [['graveToExile', 'self', 3], ['summonFromGrave', 0]] },
  灵魂交易: { main: [['graveToHand', 0]] },
  骸骨祭坛: { end: [['graveToExile', 'self', 1], ['crit', 'self', 1]] },
  腐朽王座: { activate: [['graveToExile', 'self', 2], ['destroy', 0]] },

  // ── 红 ─────────────────────────────────────────────
  灰烬小僧: { final: [['lifeDamage', 'opp', 1]] },
  熔岩投手: { activate: [['damage', 0, 1000]] },
  爆燃: { main: [['damage', 0, 1000], ['damageIfHurt', 0, 2000]] },
  血怒: { main: [['buff', 0, 1000, 1, 0, 'end'], ['buffIfHurt', 0, 1000, 0, 0, 'end']] },
  余烬回燃: { main: [['graveInspirationToHand', 'self', 2], ['drawIfFewLife', 'self', 5, 1]] },
  焚尽: { main: [['lifeDamage', 'opp', 3], ['lifeDamageIfEmptyField', 'opp', 1]] },
  熔炉之核: { attackDeclared: [['buff', 0, 500, 0, 0, 'end']] },
  火种祭坛: { activate: [['destroy', 0], ['lifeDamage', 'opp', 1]] },

  // ── 蓝 ─────────────────────────────────────────────
  书页侍从: { enter: [['scry', 2, 1]] },
  静默法师: { activate: [['tap', 0]] },
  星图观测者: { firstDraw: [['scry', 1, 1]] },
  大图书馆长: { enter: [['draw', 'self', 2]] },
  浮空书库: { firstInspiration: [['draw', 'self', 1]] },

  // ── 紫 ─────────────────────────────────────────────
  梦茧守护士: { enter: [['dream', 'self', 1]] },
  镜中旅人: { activate: [['dream', 'self', -1], ['createToken', 'self', 1]] },
  深梦低语: { main: [['scry', 2, 1], ['dream', 'self', 1]] },
  梦貘: { main: [['tap', 0], ['tapOrDestroy', 0]] },
  梦境洪流: { main: [['createToken', 'self', 3], ['extraTokenIfGeneral', 'self', 1]] },
  织梦机: { activate: [['dream', 'self', 1]], tokenEnter: [['untapEssence', 1]] },
  回廊之门: { static: [] },

  // ── 绿 ─────────────────────────────────────────────
  幼苗守望者: { enter: [['handToEssence', 'self', 0]] },
  藤蔓编织者: { activate: [['buff', 0, 0, 0, 1000, 'permanent']] },
  森林守卫者: { activate: [['mana', 'self', '绿', 1]], LT: [['selfToEssence']] },
  部落祭司: { enter: [['handToEssence', 'self', 0]], CT: [['buffAll', 'self', 500, 500, 0, 'permanent']] },
  古树牧者: { static: [] },
  森林狼王: { static: [] },
  自然生长: { main: [['deckToEssence', 'self', 1]] },
  生命灌注: { main: [['buff', 0, 0, 0, 1500, 'permanent']], MT: [['buff', 0, 0, 0, 1000, 'permanent']] },
  力量灌注: { main: [['buff', 0, 1500, 0, 0, 'permanent']], MT: [['buff', 0, 1000, 0, 0, 'permanent']] },
  全面成长: { main: [['buff', 0, 1000, 1, 1000, 'permanent']], CT: [['buff', 0, 500, 0, 500, 'permanent']] },
  根须缠绕: { main: [['tap', 0], ['lockUntap', 0]] },
  丰收: { main: [['deckToEssence', 'self', 2], ['untapEssence', 2]] },
  根脉网络: { static: [] },
  世界树苗: { activate: [['handToEssence', 'self', 0], ['draw', 'self', 1]] },

  // ── 黄 ─────────────────────────────────────────────
  雷铸工匠: { enter: [['activate', 'self', 2]], MT: [['buff', 0, 500, 0, 500, 'permanent'], ['buff', 1, 500, 0, 500, 'permanent']] },
  共鸣武士: { enter: [['activate', 'self', 2]], activate: [['activate', 'self', 1]], CT: [['buff', 0, 500, 1, 0, 'permanent']] },
  雷鸣侍从: { activate: [['buff', 0, 500, 0, 0, 'permanent']] },
  钟塔守卫: {},
  共鸣祭司: { enter: [['buffAll', 'self', 500, 0, 0, 'permanent']] },
  雷霆战将: { enter: [['activate', 'self', 3]], activate: [['activate', 'self', 2]], CT: [['buff', 0, 500, 1, 0, 'permanent']] },
  雷云巨像: { enter: [['activate', 'self', 3]] },
  万雷之主: { triggerFired: [['randomDamage', 'opp', 1000]] },
  雷霆打击: { main: [['damage', 0, 2000]], MT: [['damage', 0, 2000]] },
  共鸣充能: { main: [['activateToHand', 'self', 1]], CT: [['draw', 'self', 1]] },
  力量共鸣: { main: [['buffAll', 'self', 500, 0, 0, 'permanent']], ST: [['buffAll', 'self', 500, 0, 0, 'permanent']] },
  生命共鸣: { main: [['buffAll', 'self', 0, 0, 500, 'permanent']], ST: [['buffAll', 'self', 0, 0, 500, 'permanent']] },
  雷铸天兵: { main: [['buff', 0, 1000, 1, 0, 'permanent']], CT: [['buff', 0, 500, 0, 0, 'permanent']] },
  连锁雷鸣: { main: [['damage', 0, 3000], ['damagePerTrigger', 0, 1000]] },
  雷鸣穹顶: {},
  共鸣之环: { activate: [['activate', 'self', 1], ['drawIfActivatedTrigger', 'self', 1]] },

  // ── 灰 ─────────────────────────────────────────────
  荒原商队: { enter: [['draw', 'self', 1], ['discard', 'self', 1]] },
  临阵磨枪: { main: [['buff', 0, 1000, 0, 0, 'permanent']] },
  荒原法则: { main: [['destroy', 0], ['draw', 'opp', 1]] },
  篝火营地: { end: [['deckToLife', 'self', 1]] },
  旧路标: { activate: [['scry', 1, 0]] },

  // ── 混色 ───────────────────────────────────────────
  渡魂人: { enter: [['lifeToGrave', 'self', 1], ['heal', 0, 3000]] },
  生死逆转: { main: [['destroy', 0], ['deckToLife', 'self', 2]] },
  炽焰学者: { enter: [['draw', 'self', 1]], activate: [['lifeDamage', 'opp', 1]] },
  预案引燃: { main: [['draw', 'self', 1], ['damage', 0, 2000]] },
  梦藤巨像: { enter: [['deckToEssence', 'self', 1], ['createToken', 'self', 1]] },
  根须入梦: { main: [['deckToEssence', 'self', 1], ['dream', 'self', 1]] },
  荒原雷兽: { enter: [['activate', 'self', 2]] },
  雷鸣余波: { main: [['damage', 0, 2000], ['damageIfGreyEssence', 0, 1000]] },
  守林圣骑士: { enter: [['healAll', 'self', 1000]] },
  生命之泉: { main: [['heal', 0, 3000], ['deckToEssence', 'self', 1]] },
  血焰狂徒: { activate: [['destroy', 0], ['selfBuff', 2000, 1, 0]] },
  燃魂: { main: [['destroy', 0], ['lifeDamage', 'opp', 2]] },
};

/** 需要指定目标的卡；未列出的卡不需要目标。 */
export const SE01_TARGETS = {
  晨祷侍从: { enter: [{ kind: 'unit', side: 'own', count: 1 }] },
  白塔裁决者: { enter: [{ kind: 'unit', side: 'opp', count: 1, tappedOnly: true }] },
  圣疗: { main: [{ kind: 'unit', side: 'any', count: 1 }], CT: [{ kind: 'unit', side: 'any', count: 1 }] },
  净化仪式: { main: [{ kind: 'unit', side: 'opp', count: 2, min: 1 }] },
  深渊引路人: { enter: [{ kind: 'grave', side: 'own', count: 1, color: '黑', maxCost: 4, unitOnly: true }] },
  灵魂交易: { main: [{ kind: 'grave', side: 'own', count: 1, min: 0 }] },
  腐朽王座: { activate: [{ kind: 'unit', side: 'opp', count: 1 }] },
  熔岩投手: { activate: [{ kind: 'unit', side: 'any', count: 1 }] },
  爆燃: { main: [{ kind: 'unit', side: 'any', count: 1 }] },
  血怒: { main: [{ kind: 'unit', side: 'own', count: 1 }] },
  焚尽: { main: [] },
  静默法师: { activate: [{ kind: 'unit', side: 'opp', count: 1 }] },
  梦貘: { main: [{ kind: 'unit', side: 'opp', count: 1 }] },
  藤蔓编织者: { activate: [{ kind: 'unit', side: 'own', count: 1 }] },
  生命灌注: { main: [{ kind: 'unit', side: 'own', count: 1 }], MT: [{ kind: 'unit', side: 'own', count: 1 }] },
  力量灌注: { main: [{ kind: 'unit', side: 'own', count: 1 }], MT: [{ kind: 'unit', side: 'own', count: 1 }] },
  全面成长: { main: [{ kind: 'unit', side: 'own', count: 1 }], CT: [{ kind: 'unit', side: 'own', count: 1 }] },
  根须缠绕: { main: [{ kind: 'unit', side: 'opp', count: 1 }] },
  雷铸工匠: { MT: [{ kind: 'unit', side: 'own', count: 2, min: 1 }] },
  共鸣武士: { CT: [{ kind: 'unit', side: 'own', count: 1 }] },
  雷鸣侍从: { activate: [{ kind: 'unit', side: 'own', count: 1 }] },
  雷霆打击: { main: [{ kind: 'unit', side: 'any', count: 1 }], MT: [{ kind: 'unit', side: 'any', count: 1 }] },
  雷铸天兵: { main: [{ kind: 'unit', side: 'own', count: 1 }], CT: [{ kind: 'unit', side: 'own', count: 1 }] },
  连锁雷鸣: { main: [{ kind: 'unit', side: 'opp', count: 1 }] },
  荒原法则: { main: [{ kind: 'unit', side: 'any', count: 1 }] },
  临阵磨枪: { main: [{ kind: 'unit', side: 'own', count: 1 }] },
  渡魂人: { enter: [{ kind: 'unit', side: 'own', count: 1, min: 0 }] },
  生死逆转: { main: [{ kind: 'unit', side: 'own', count: 1 }] },
  预案引燃: { main: [{ kind: 'unit', side: 'opp', count: 1 }] },
  雷鸣余波: { main: [{ kind: 'unit', side: 'opp', count: 1 }] },
  生命之泉: { main: [{ kind: 'unit', side: 'own', count: 1 }] },
  血焰狂徒: { activate: [{ kind: 'unit', side: 'own', count: 1 }] },
  燃魂: { main: [{ kind: 'unit', side: 'own', count: 1 }] },
  火种祭坛: { activate: [{ kind: 'unit', side: 'own', count: 1 }] },
};

/**
 * 静态加成：返回 { atk, imp, hp } 影响自身，或 { aura: {...} } 影响己方全体。
 * 这些是「回响」类持续效果，直接参与面板计算，不写入 mods，避免每回合重算漂移。
 */
export const SE01_STATIC = {
  古树牧者(g, side) {
    const n = greenEssence(g, side);
    return n ? { atk: n * 250, imp: 0, hp: n * 250 } : null;
  },
  森林狼王(g, side) {
    const n = Math.floor(greenEssence(g, side) / 3);
    return n ? { atk: n * 500, imp: 0, hp: n * 500 } : null;
  },
  根脉网络(g, side) {
    const n = Math.floor(greenEssence(g, side) / 3);
    return n ? { aura: { atk: n * 250, imp: 0, hp: n * 250 } } : null;
  },
  钟塔守卫(g, side) {
    const n = triggersThisTurn(g, side);
    return n ? { atk: n * 250, imp: 0, hp: n * 250 } : null;
  },
  雷霆战将(g, side) {
    const n = triggersThisTurn(g, side);
    return n ? { aura: { atk: n * 500, imp: 0, hp: n * 500 } } : null;
  },
  雷鸣穹顶(g, side) {
    const n = Math.min(2, triggersThisTurn(g, side));
    return n ? { aura: { atk: n * 250, imp: 0, hp: 0 } } : null;
  },
};

function greenEssence(g, side) {
  let n = 0;
  for (const uid of g.players[side].essence) {
    const c = g.cards[uid];
    if (!c) continue;
    const def = BY_ID.get(c.id);
    if (def && def.color === '绿') n++;
  }
  return n;
}

export function triggersThisTurn(g, side) {
  return g.players[side].stats.triggersThisTurn || 0;
}

export function hasSE01Effect(name) {
  return Object.prototype.hasOwnProperty.call(SE01_EFFECTS, name)
    || Object.prototype.hasOwnProperty.call(SE01_SPIRIT_EFFECTS, name);
}

export function isNoEffect(name) {
  return NO_EFFECT.has(name);
}

export function se01Targets(name, event) {
  const spec = SE01_TARGETS[name];
  if (!spec) return null;
  return spec[event] || null;
}

/** 计算某张卡的静态加成；返回 { self:{...}, aura:{...} }，供 rules.js 汇总。 */
export function se01StaticBonus(g, side, uid) {
  const c = g.cards[uid];
  if (!c) return null;
  const def = BY_ID.get(c.id);
  if (!def) return null;
  const fn = SE01_STATIC[def.name];
  return fn ? fn(g, side, uid) : null;
}

/**
 * 解释器。ctx = { side, event, mode, targets, sourceUid }；api 由 rules.js 注入。
 * 返回 true 表示该卡在该时机有 SE01 效果并被处理。
 */
export function resolveSE01(g, name, ctx, api) {
  const table = SE01_EFFECTS[name] || SE01_SPIRIT_EFFECTS[name];
  if (!table) return false;
  const ops = table[ctx.event];
  if (!ops || !ops.length) return true;
  const self = ctx.side, opp = 1 - self;
  const T = (i) => (ctx.targets || [])[i];
  const sideOf = (s) => (s === 'opp' ? opp : self);
  const at = (i, n) => { const uid = T(i); if (uid && api.validTarget(uid)) api.damageUnit(uid, n, name); };
  const heal = (i, n) => { const uid = T(i); if (uid && api.validTarget(uid)) api.healUnit(uid, n); };
  const kill = (i) => { const uid = T(i); if (uid && api.validTarget(uid)) api.destroy(uid, name); };

  for (const [k, ...a] of ops) {
    switch (k) {
      case 'damage': at(a[0], a[1]); break;
      case 'heal': heal(a[0], a[1]); break;
      case 'destroy': kill(a[0]); break;
      case 'tap': { const uid = T(a[0]); if (uid && api.validTarget(uid)) api.tapUnit(uid); break; }
      case 'lockUntap': { const uid = T(a[0]); if (uid && api.validTarget(uid)) api.lockUntap(uid); break; }
      case 'buff': { const uid = T(a[0]); if (uid && api.validTarget(uid)) api.modifyUnit(uid, a[1], a[2], a[3], a[4] || 'permanent'); break; }
      case 'buffAll': api.buffAll(sideOf(a[0]), a[1], a[2], a[3], a[4] || 'permanent'); break;
      case 'selfBuff': api.selfBuff(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0); break;
      case 'draw': api.draw(sideOf(a[0]), a[1]); break;
      case 'mill': api.mill(sideOf(a[0]), a[1]); break;
      case 'millLife': api.millLife(sideOf(a[0]), a[1]); break;
      case 'deckToLife': api.deckToLife(sideOf(a[0]), a[1]); break;
      case 'lifeToGrave': api.lifeToGrave(sideOf(a[0]), a[1]); break;
      case 'scry': api.scry(self, a[0], a[1]); break;
      case 'dream': api.dream(sideOf(a[0]), a[1]); break;
      case 'crit': api.addCrit(sideOf(a[0]), a[1]); break;
      case 'mana': api.addMana(sideOf(a[0]), a[1], a[2]); break;
      case 'untapEssence': api.untapEssence(self, a[0]); break;
      case 'createToken': api.createToken(sideOf(a[0]), a[1]); break;
      case 'bounce': { const uid = T(a[0]); if (uid && api.validTarget(uid)) api.bounce(uid); break; }
      case 'toHand': { const uid = T(a[0]); if (uid && api.validTarget(uid)) api.toHand(uid, self); break; }
      case 'summonFromGrave': api.summonFromGrave(T(a[0]), self); break;
      case 'lifeDamage': api.lifeDamage(sideOf(a[0]), a[1], name, 'direct'); break;
      case 'destroyAll': api.destroyAll(name); break;
      case 'graveToExile': api.graveToExile(sideOf(a[0]), a[1]); break;
      case 'graveToDeck': api.graveToDeck(sideOf(a[0]), a[1]); break;
      case 'graveToHand': { const uid = T(a[0]); if (uid && api.inGrave(uid, self)) api.toHand(uid, self); break; }
      case 'graveInspirationToHand': api.graveInspirationToHand(sideOf(a[0]), a[1]); break;
      case 'handToEssence': api.handToEssence(sideOf(a[0]), a[1]); break;
      case 'deckToEssence': api.deckToEssence(sideOf(a[0]), a[1]); break;
      case 'discard': api.discard(sideOf(a[0]), a[1]); break;
      case 'selfExile': api.exileSource(ctx.sourceUid); break;
      case 'selfToLife': api.sourceToLife(ctx.sourceUid, self); break;
      case 'selfToGrave': api.selfToGrave(ctx.sourceUid); break;
      case 'selfToEssence': api.selfToEssence(ctx.sourceUid); break;
      case 'activate': api.activate(sideOf(a[0]), a[1]); break;
      case 'activateToHand': api.activateToHand(sideOf(a[0]), a[1]); break;
      case 'randomDamage': api.randomDamage(sideOf(a[0]), a[1]); break;
      case 'healAll': api.healAll(sideOf(a[0]), a[1]); break;
      case 'damageIfHurt': { const uid = T(a[0]); if (uid && api.validTarget(uid) && api.isDamaged(uid)) api.damageUnit(uid, a[1], name); break; }
      case 'buffIfHurt': { const uid = T(a[0]); if (uid && api.validTarget(uid) && api.isDamaged(uid)) api.modifyUnit(uid, a[1], a[2], a[3], a[4] || 'permanent'); break; }
      case 'destroyIfFragile': { const uid = T(a[0]); if (uid && api.validTarget(uid) && api.isFragile(uid)) kill(a[1] ?? a[0]); break; }
      case 'lifeDamageIfEmptyField': if (!api.fieldCount(self)) api.lifeDamage(sideOf(a[0]), a[1], name, 'direct'); break;
      case 'damageIfGreyEssence': { const uid = T(a[0]); if (uid && api.validTarget(uid) && api.hasGreyEssence(self)) api.damageUnit(uid, a[1], name); break; }
      case 'damagePerTrigger': { const uid = T(a[0]); const n = triggersThisTurn(g, self); if (uid && api.validTarget(uid) && n) api.damageUnit(uid, a[1] * n, name); break; }
      case 'drawIfFewLife': if (api.lifeCount(sideOf(a[0])) < a[1]) api.draw(sideOf(a[0]), a[2]); break;
      case 'tapOrDestroy': { const uid = T(a[0]); if (uid && api.validTarget(uid) && api.spendDream(self, 1)) api.destroy(uid, name); break; }
      case 'extraTokenIfGeneral': if (api.hasOnField(self, '幻梦战将')) api.createToken(sideOf(a[0]), a[1]); break;
      case 'drawIfActivatedTrigger': api.draw(sideOf(a[0]), a[1]); break;
      default: break;
    }
  }
  return true;
}

/**
 * 八色灵体的专属启动能力。通用能力（横置检视顶牌、付同色 1 可揭示）由 rules.js 的
 * spiritDraw 单独处理；这里只登记「另一项」专属能力，二者共用横置，一回合二选一。
 */
export const SE01_SPIRIT_EFFECTS = {
  圣所守夜人: { spiritActivate: [['heal', 0, 2000]], targets: [{ kind: 'unit', side: 'own', count: 1, min: 0 }] },
  陵园看守者: { spiritActivate: [['graveToExile', 'self', 3], ['summonFromGrave', 0]], targets: [{ kind: 'grave', side: 'own', count: 1, color: '黑', maxCost: 3, unitOnly: true }] },
  根脉育苗者: { spiritActivate: [['handToEssence', 'self', 0], ['draw', 'self', 1]], targets: [] },
  余烬执火者: { spiritActivate: [['buff', 0, 1000, 1, 0, 'end']], targets: [{ kind: 'unit', side: 'own', count: 1 }] },
  卷册抄录者: { spiritActivate: [['scry', 2, 1]], targets: [] },
  雷鸣司钟人: { spiritActivate: [['activate', 'self', 1]], targets: [] },
  织梦引路人: { spiritActivate: [['dream', 'self', 1]], targets: [] },
  荒原旅人: { spiritActivate: [['scry', 1, 0]], targets: [] },
};

export function se01Spirit(name) {
  return SE01_SPIRIT_EFFECTS[name] || null;
}
