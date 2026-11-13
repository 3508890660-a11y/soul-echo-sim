/**
 * 卡牌效果 DSL 与专用结算。
 * 本文件只描述效果；区域、费用、目标、伤害和连锁合法性由 rules.js 统一执行。
 *
 * 第一弹（SE01）的 95 张新卡走 effects.se01.js 的声明式表；
 * 本文件的命令式分支只保留给第二版已实现的 53 张旧卡，两者通过 targetGroups /
 * resolveEffect 的两个入口分派，互不覆盖。
 */

import { se01Targets, se01Spirit, hasSE01Effect, resolveSE01 } from './effects.se01.js';

export const APPROXIMATIONS = Object.freeze({
  自动选择: '脚本为预知、自动触发目标、葬送、践踏溢出与结束弃牌做确定性选择；引擎仍验证合法性。',
  战斗分配: '多阻挡按宣告顺序分配恰好致命伤害；践踏剩余攻击力由脚本选择一个其他灵像，暂不提供人工逐点分配。',
  法师护甲: '每点生命伤害前由脚本自动使用一张护甲替代，不另开可选替代决策窗。',
  黑暗聚合体: '代替进入分解区实现为：质密启动后给目标一次自动替代，实际替代时机不另开响应窗。',
  亡魂役使者·伊可莱: '“黑色卡召唤至战场”仅枚举黑色灵像，避免灵感卡永久停留在战场。',
  陵园看守者: '灵体复活能力仅枚举总费用 3 以下的黑色灵像。',
  梦质处理师: '序曲的“消耗梦境 2、凝聚 2”在宣告时选择并减费，入场时消耗指示物；原文字面时序仍需设计者确认。',
  触发排序: '同一玩家的多个自动触发由脚本按战场顺序与卡牌价值排序，而非逐个人工点击。',
});

const group = (kind, side, count = 1, extra = {}) => ({ kind, side, count, min: count, ...extra });
const MAIN_TARGETS = {
  混沌打击: [group('unit', 'any')],
  回复灵光: [group('unit', 'any')],
  圣光打击: [group('unit', 'any')],
  烈焰之力: [group('unit', 'any')],
  奥术飞弹: [group('unit', 'any')],
  分解射线: [group('card', 'opp', 1, { modeCount: { destroy2: 2, both: 2 }, min: 0 })],
  法术反制: [group('chainInspiration', 'opp')],
  彩虹喷射: [group('card', 'opp', 1, { maxCost: 2 })],
  自杀式袭击: [group('unit', 'own'), group('card', 'opp')],
  灵质重聚: [group('grave', 'own', 2, { min: 0, color: '黑', maxCost: 1 })],
  劣质回复药剂: [group('grave', 'own', 1, { min: 0, ct: true })],
  梦境采集: [group('unit', 'own', 1, { min: 0, dream: true, onlyMode: 'sacrifice' })],
};

export function targetGroups(name, mode = 'main', event = 'main') {
  const se01 = se01Targets(name, event);
  if (se01) return se01.map((g) => ({ min: g.count, ...g }));
  const spirit = se01Spirit(name);
  if (spirit && event === 'spiritActivate') return (spirit.targets || []).map((g) => ({ min: g.count, ...g }));
  if (event === 'enter') {
    if (name === '圣光战将') return [group('unit', 'opp', 2, { min: 0 })];
    if (name === '暗夜战将') return [group('card', 'opp', 2, { min: 0 })];
  }
  if (event === 'final' && name === '蹒跚的僵尸') return [group('unit', 'opp', 1, { min: 0 })];
  if (event === 'LT' || event === 'MT' || event === 'ST') {
    if (name === '回复灵光') return [group('unit', 'any', 1, { min: 0 })];
    if (name === '圣光打击') return [group('unit', 'any', 1, { min: 0 })];
    return [];
  }
  if (event === 'activate') {
    if (name === '烈焰聚合体') return [group('unit', 'any')];
    if (name === '黑暗聚合体') return [group('card', 'own')];
    if (name === '幻梦战将' && mode === 'damage') return [group('unit', 'opp')];
    if (name === '亡魂役使者·伊可莱') return [group('grave', 'own', 1, { color: '黑', maxCost: 6, unitOnly: true })];
    if (name === '陵园看守者') return [group('grave', 'own', 1, { color: '黑', maxCost: 3, unitOnly: true })];
    return [];
  }
  if (name === '梦境采集者' && mode === 'extract') return MAIN_TARGETS.梦境采集;
  return MAIN_TARGETS[name] || [];
}

export function costReduction(g, side, name, mode, burst) {
  if (name === '次元超越') {
    let n = 0;
    if (burst >= 5) n += 3;
    if (burst >= 9) n += 4;
    if (burst >= 13) n += 5;
    return n; // 与规则书表 16：15／12／8／3 总费用一致，阈值累积。
  }
  if (name === '分解射线' && (mode === 'condense' || mode === 'both')) return 2;
  if (name === '梦质处理师' && mode === 'condense') return 2;
  return 0;
}

export function availableModes(g, side, name, burst) {
  if (name === '分解射线') {
    if (burst >= 7) return ['both'];
    if (burst >= 4) return ['destroy2', 'condense'];
  }
  if (name === '梦质处理师' && g.players[side].spirit.dream >= 2) return ['normal', 'condense'];
  if (name === '梦境采集者') return g.players[side].field.some((uid) => g.cards[uid]?.token) ? ['normal', 'extract', 'extract_sacrifice'] : ['normal', 'extract'];
  if (name === '灵质榨取') return ['normal', 'bury'];
  if (name === '梦境采集') return ['plain', 'sacrifice'];
  return ['main'];
}

export function effectTextFor(name, event) {
  if (event === 'CT') return '暴击触发';
  if (event === 'LT' || event === 'ST' || event === 'MT') return `${event} 揭示触发`;
  if (event === 'enter') return '序曲／进入战场';
  if (event === 'final') return '终曲';
  return '卡牌效果';
}

/** api 是 rules.js 提供的受控操作集，效果不能直接改写优先权或随意创造动作。 */
export function resolveEffect(name, ctx, api) {
  if (hasSE01Effect(name) && resolveSE01(api.game, name, ctx, api)) return;
  const { side, targets = [], mode = 'main', event = 'main', sourceUid } = ctx;
  const opp = 1 - side;
  const t = (i = 0) => targets[i];
  const valid = (i = 0) => api.validTarget(t(i));
  const damageUnit = (i, n) => { if (valid(i)) api.damageUnit(t(i), n, name); };
  const destroy = (i) => { if (valid(i)) api.destroy(t(i), name); };

  if (event === 'CT') {
    api.addCrit(side, 1);
    return;
  }
  if (event === 'LT' || event === 'ST' || event === 'MT') {
    if (name === '回复灵光' && valid()) api.healUnit(t(), 3000);
    else if (name === '圣光打击') damageUnit(0, 3000);
    else if (name === '迎宾入梦') api.createToken(side, 1);
    else if (name === '梦境采集') api.dream(side, 1);
    else if (name === '预言学徒') api.draw(side, 1, name);
    else if (name === '法师护甲' && event === 'ST' && api.payColored(side, '蓝', 1)) api.attachArmor(sourceUid, side);
    return;
  }
  if (event === 'enter') {
    if (name === '黑市商人') { api.draw(side, 2, name); api.draw(opp, 1, name); }
    else if (name === '圣光战将') targets.forEach((uid) => { if (api.validTarget(uid)) api.destroy(uid, name); });
    else if (name === '织梦学徒') api.createToken(side, 1);
    else if (name === '梦境巡逻员') api.dream(side, 2);
    else if (name === '梦质处理师' && mode === 'condense') api.dream(side, -2);
    else if (name === '幻梦战将') api.dream(side, 3);
    else if (name === '预言学徒') api.scry(side, 3, 1);
    else if (name === '暗夜战将') {
      api.mill(side, 3);
      targets.forEach((uid) => { if (api.validTarget(uid)) api.destroy(uid, name); });
    }
    return;
  }
  if (event === 'final') {
    if (name === '烈焰战将') api.lifeDamage(opp, 1, name, 'direct');
    else if (name === '蹒跚的僵尸') {
      api.millLife(side, 1);
      destroy(0);
    }
    return;
  }
  if (event === 'activate') {
    if (name === '混沌聚合体') { api.addMana(side, '灰', 1); api.exileSource(sourceUid); }
    else if (name === '圣光聚合体') api.sourceToLife(sourceUid, side);
    else if (name === '幻梦聚合体') { api.createToken(side, 2); api.exileSource(sourceUid); }
    else if (name === '水晶聚合体') { api.scry(side, 3, 1); api.exileSource(sourceUid); }
    else if (name === '烈焰聚合体') {
      if (valid()) { api.modifyUnit(t(), 2000, 0, 0, 'end'); api.doomAtEnd(t()); }
      api.exileSource(sourceUid);
    } else if (name === '黑暗聚合体') {
      if (valid()) api.addSubstitute(t(), sourceUid);
    } else if (name === '梦境巡逻员') api.dream(side, 1);
    else if (name === '梦质处理师') api.untapEssence(side, 1);
    else if (name === '梦境采集者') api.createToken(side, 1);
    else if (name === '幻梦战将') {
      if (mode === 'tokens') api.createToken(side, 2);
      else if (mode === 'damage') damageUnit(0, 2000);
      else api.untapEssence(side, 1);
    } else if (name === '亡魂役使者·伊可莱' || name === '陵园看守者') {
      if (valid()) api.summonFromGrave(t(), side);
    }
    return;
  }

  switch (name) {
    case '冒险准备': case '智慧之光': api.draw(side, 1, name); break;
    case '混沌打击': damageUnit(0, 2000); break;
    case '混沌冲击': api.lifeDamage(opp, 1, name, 'direct'); break;
    case '烈焰之力':
      if (valid()) { api.modifyUnit(t(), 2000, 1, 0, 'end'); api.doomAtEnd(t()); }
      break;
    case '火球术': api.lifeDamage(opp, 2, name, 'direct'); break;
    case '回复灵光': if (valid()) api.healUnit(t(), 3000); break;
    case '圣光打击': damageUnit(0, 5000); break;
    case '治愈灵光': api.deckToLife(side, 1); break;
    case '圣光肃清': api.destroyAll(name); break;
    case '迎宾入梦': api.createToken(side, 2); break;
    case '噩梦降临': api.modifyDreams(1000, 1, 0); break;
    case '梦境采集': {
      const amount = mode === 'sacrifice' && valid() ? 2 : 1;
      if (amount === 2) api.destroy(t(), name);
      api.dream(side, amount);
      break;
    }
    case '梦境采集者':
      if (mode === 'extract') {
        const amount = mode === 'sacrifice' && valid() ? 2 : 1;
        api.dream(side, amount);
      }
      break;
    case '奥术飞弹': damageUnit(0, 2000); api.draw(side, 1, name); break;
    case '命运的指引': api.scry(side, 3, 2); break;
    case '分解射线': {
      if (mode === 'destroy2' || mode === 'both' || mode === 'main') targets.forEach((uid) => { if (api.validTarget(uid)) api.destroy(uid, name); });
      // 凝聚已在宣告费用中处理；both 也同时获得减费。
      break;
    }
    case '法术反制': api.counterChain(t(), side); break;
    case '彩虹喷射': if (valid()) { api.bounce(t()); api.draw(side, 1, name); } else api.draw(side, 1, name); break;
    case '法师护甲': api.attachArmor(sourceUid, side); break;
    case '次元超越': {
      api.skipNextTurn(opp);
      const burst = api.burst(side);
      if (burst >= 9) api.exileInspirations(side, burst >= 13 ? 5 : 2);
      break;
    }
    case '自杀式袭击': destroy(0); destroy(1); break;
    case '灵质榨取': {
      const buried = mode === 'bury' && api.bury(side, 1);
      api.draw(side, buried ? 2 : 1, name);
      break;
    }
    case '自我献祭': api.drawLife(side, 1); break;
    case '灵质重聚': targets.forEach((uid) => { if (api.inGrave(uid, side)) api.toHand(uid, side); }); break;
    case '劣质回复药剂': if (api.inGrave(t(), side)) api.toLife(t(), side); break;
    default:
      if (!['新人冒险者', '黑市商人', '荒原狼', '岩石巨像', '巨石守卫', '山岭巨人', '混沌聚合体', '火焰鸟', '地狱犬', '烈焰斗士', '烈焰聚合体', '烈焰战将', '圣光聚合体', '光能守护者', '圣光祷告者', '圣光战将', '织梦学徒', '梦境巡逻员', '幻梦聚合体', '梦质处理师', '幻梦战将', '梦境采集者', '预言学徒', '水晶聚合体', '暗夜战将', '黑暗聚合体', '亡魂役使者·伊可莱', '蹒跚的僵尸'].includes(name)) {
        throw new Error(`未实现卡牌效果：${name}`);
      }
  }
}

export function implementationStatus(name) {
  if (name === '黑暗聚合体' || name === '亡魂役使者·伊可莱' || name === '梦质处理师') return 'approx';
  return 'implemented';
}
