import { BY_NAME, BY_ID, BY_SPIRIT, CARD_DATA } from './cards.js';
import { PRECONS, PRECON_COLORS } from './precons.js';
import {
  APPROXIMATIONS, targetGroups, costReduction, availableModes,
  resolveEffect, implementationStatus,
} from './effects.js';
import { se01StaticBonus, hasSE01Effect, SE01_EFFECTS, SE01_SPIRIT_EFFECTS } from './effects.se01.js';

const OPP = (side) => 1 - side;
const ZONE_NAMES = ['deck', 'life', 'hand', 'essence', 'field', 'grave', 'exile', 'reveal', 'armor'];
const clone = (x) => structuredClone(x);
const asArray = (deck) => Array.isArray(deck) ? deck : Object.entries(deck || {}).flatMap(([name, n]) => Array(n).fill(name));
const rawOf = (uidOrCard) => {
  if (!uidOrCard) return null;
  if (uidOrCard.token) return TOKEN_DEF;
  const id = typeof uidOrCard === 'string' ? uidOrCard : uidOrCard.id;
  return BY_ID.get(id) || BY_NAME.get(id) || null;
};

export const TOKEN_DEF = Object.freeze({
  id: 'token_dream', name: '幻梦衍生物', type: '灵像', color: '紫',
  cost: { total: 1, colored: 1, grey: 0 }, attack: 0, impact: 0, vitality: 1000,
  keywords: [], text: '紫色灵像衍生物。离开战场并处理区域移动后移出本局。', trigger: '—', token: true,
});

export class Rng {
  constructor(seed = 1) { this.state = (Number(seed) >>> 0) || 1; }
  next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.rngInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  rngInt(n) { return this.int(n); }
}

/**
 * 对局模式：只改「初始生命张数 / 起手张数 / 构筑上下限 / 颜色要求」，
 * 回合结构、费用、战斗、连锁一律不变。因此同一份脚本无需改动即可跨模式运行。
 */
export const MODES = Object.freeze({
  standard: Object.freeze({
    id: 'standard', name: '标准对局', life: 10, handStart: 4,
    deckMin: 40, deckMax: 60, requireColors: 0, colorMin: 0,
    desc: '生命 10、起手 4、主卡组 40—60 张。基准模式。',
  }),
  blitz: Object.freeze({
    id: 'blitz', name: '速攻对局', life: 6, handStart: 4,
    deckMin: 40, deckMax: 60, requireColors: 0, colorMin: 0,
    desc: '生命 6、起手 4、主卡组 40—60 张。生命线低，直伤与前压曲线的价值上升，8 回合内多见决胜。',
  }),
  grand: Object.freeze({
    id: 'grand', name: '长局', life: 15, handStart: 5,
    deckMin: 50, deckMax: 60, requireColors: 0, colorMin: 0,
    desc: '生命 15、起手 5、主卡组 50—60 张。每回合稳定收益与资源引擎权重上升，牌库耗尽成为真实风险。',
  }),
  duo: Object.freeze({
    id: 'duo', name: '双色对局', life: 12, handStart: 4,
    deckMin: 40, deckMax: 60, requireColors: 2, colorMin: 10,
    desc: '生命 12、起手 4、主卡组 40—60 张，且须恰好含 2 种非灰色颜色、每种覆盖不少于 10 张。',
  }),
});

export const MODE_IDS = Object.freeze(Object.keys(MODES));
export const DEFAULT_MODE = 'standard';

/**
 * 全局构筑硬约束：与模式无关，任何模式都生效。
 * 同色比例只按卡牌自身的颜色字段计：混色卡按其主色计，灰是中性色，
 * 只有灵体本身为灰时，灰卡才算同色。
 */
export const DECK_RULES = Object.freeze({
  sameNameMax: 4,
  spiritColorRatio: 0.6,
});

/** 灵体卡的颜色；名称不是八色灵体之一时返回 null。 */
export function spiritColorOf(spiritName) {
  return BY_SPIRIT.get(spiritName)?.color || null;
}

/** 统计卡组覆盖到的非灰色颜色（按「包含该色的卡牌张数」计，混色卡同时计入两色）。 */
export function deckColors(deck) {
  const tally = {};
  for (const name of asArray(deck)) {
    const d = BY_NAME.get(name) || BY_ID.get(name);
    if (!d) continue;
    const set = new Set(Object.keys(d.cost?.colors || {}));
    if (!set.size && d.color && d.color !== '灰') set.add(d.color);
    for (const c of set) tally[c] = (tally[c] || 0) + 1;
  }
  return tally;
}

/**
 * 卡组合法性。
 * @param {object|string[]} deck 卡名数组或「卡名 → 张数」
 * @param {string} mode 模式 id
 * @param {object|string} [opts] 传字符串等价于 { spirit }；也可传 { spirit } 或 { spiritColor } / { color }
 *   ——同色 60% 需要知道灵体颜色，未提供时跳过该条（引擎内部路径都会提供）。
 */
export function validateDeck(deck, mode = DEFAULT_MODE, opts = {}) {
  const m = MODES[mode] || MODES[DEFAULT_MODE];
  const list = asArray(deck);
  const options = typeof opts === 'string' ? { spirit: opts } : (opts || {});
  const spiritColor = options.spiritColor || spiritColorOf(options.spirit) || options.color || null;
  const errors = [];
  if (list.length < m.deckMin || list.length > m.deckMax) errors.push(`主卡组须为 ${m.deckMin}—${m.deckMax} 张，当前 ${list.length}`);
  const counts = {};
  for (const name of list) {
    const c = BY_NAME.get(name) || BY_ID.get(name);
    if (!c) errors.push(`未知卡牌：${name}`);
    else if (c.type === '灵体') errors.push(`灵体不能投入主卡组：${name}`);
    counts[name] = (counts[name] || 0) + 1;
  }
  for (const [name, n] of Object.entries(counts)) if (n > DECK_RULES.sameNameMax) errors.push(`${name} 超过同名 ${DECK_RULES.sameNameMax} 张：${n}`);
  const sameColor = spiritColor
    ? list.filter((name) => {
      const c = BY_NAME.get(name) || BY_ID.get(name);
      return c && c.color === spiritColor;
    }).length
    : 0;
  const sameColorNeed = list.length ? Math.ceil(list.length * DECK_RULES.spiritColorRatio) : 0;
  if (spiritColor && list.length && sameColor < sameColorNeed) {
    errors.push(`主卡组中与灵体同色（${spiritColor}）的卡牌须至少 ${Math.round(DECK_RULES.spiritColorRatio * 100)}%：当前 ${sameColor}/${list.length}，至少需要 ${sameColorNeed} 张`);
  }
  if (m.requireColors) {
    const tally = deckColors(list);
    const colors = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (colors.length !== m.requireColors) {
      errors.push(`【${m.name}】主卡组须恰好含 ${m.requireColors} 种非灰色颜色，当前 ${colors.length} 种${colors.length ? `（${colors.map(([c, n]) => `${c}${n}`).join('、')}）` : ''}`);
    }
    for (const [c, n] of colors) if (n < m.colorMin) errors.push(`【${m.name}】${c}色覆盖 ${n} 张，少于 ${m.colorMin} 张`);
  }
  return { ok: errors.length === 0, errors, list, mode: m.id, spiritColor, sameColor, sameColorNeed };
}

function newPlayer(g, side, name, deck, color, spiritName) {
  const p = {
    idx: side, name, color, spiritName,
    spirit: { tapped: false, crit: 0, dream: 0 },
    deck: [], life: [], hand: [], essence: [], field: [], grave: [], exile: [], reveal: [], armor: [],
    mana: { 灰: 0, 红: 0, 白: 0, 紫: 0, 蓝: 0, 黑: 0, 绿: 0, 黄: 0 },
    turnCount: 0, essenceSetTurn: -1, usedDimension: 0, skipTurns: 0,
    firstDrawUsed: false, firstInspUsed: false, hookCounts: {},
    stats: { combatDamage: 0, directDamage: 0, lifeReveals: 0, maxReveal: 0, draws: 0, tokens: 0, triggersThisTurn: 0, triggersTotal: 0 },
  };
  for (const cardName of asArray(deck)) {
    const def = BY_NAME.get(cardName) || BY_ID.get(cardName);
    if (!def) throw new Error(`未知卡牌 ${cardName}`);
    const uid = `c${g.nextUid++}`;
    g.cards[uid] = {
      uid, id: def.id, owner: side, controller: side, zone: 'deck', damage: 0,
      tapped: false, enteredTurn: -1, mods: [], doomed: false, substituteUid: null,
    };
    p.deck.push(uid);
  }
  return p;
}

export function createGame(opts = {}) {
  const modeId = MODES[opts.mode] ? opts.mode : DEFAULT_MODE;
  const mode = MODES[modeId];
  const preconA = opts.preconA || '灰色基准';
  const preconB = opts.preconB || '红色快攻';
  const deckA = opts.deckA || PRECONS[preconA];
  const deckB = opts.deckB || PRECONS[preconB];
  // 预组用通用灵体（「测试灵体（色）」），灵体名不带颜色，故同色基准取预组主色。
  const spiritA = opts.spiritA || '测试灵体';
  const spiritB = opts.spiritB || '测试灵体';
  // 灵体颜色优先：八色灵体直接用其颜色，通用灵体才回落到显式 color / 预组主色。
  const colorA = spiritColorOf(spiritA) || opts.colorA || PRECON_COLORS[preconA] || '灰';
  const colorB = spiritColorOf(spiritB) || opts.colorB || PRECON_COLORS[preconB] || '红';
  // 同色 60% 为硬约束：没有绕过开关，旧构筑规则已于 2026-11-14 废除。
  const va = validateDeck(deckA, modeId, { spiritColor: colorA });
  const vb = validateDeck(deckB, modeId, { spiritColor: colorB });
  if (!va.ok || !vb.ok) throw new Error([...va.errors, ...vb.errors].join('；'));
  const g = {
    version: 'soul-echo-engine-0.2.0', seed: opts.seed ?? 20261112,
    mode: modeId, modeSpec: { ...mode },
    rng: new Rng(opts.seed ?? 20261112), nextUid: 1, cards: {}, players: [],
    active: 0, first: 0, priority: 0, passCount: 0, phase: 'setup', turn: 0,
    chain: [], triggers: [], combat: null, lifeDamage: null, inspect: null,
    over: false, winner: null, reason: null, losers: [], log: [], actions: 0,
    approximations: Object.values(APPROXIMATIONS),
  };
  const first = opts.first ?? (opts.randomFirst ? g.rng.int(2) : 0);
  g.first = first; g.active = first; g.priority = first;
  g.players.push(newPlayer(g, 0, opts.nameA || '玩家 A', deckA, colorA, spiritA));
  g.players.push(newPlayer(g, 1, opts.nameB || '玩家 B', deckB, colorB, spiritB));
  for (const p of g.players) {
    g.rng.shuffle(p.deck);
    for (let i = 0; i < mode.life; i++) moveCard(g, p.deck[0], 'life', p.idx, { silent: true });
    for (let i = 0; i < mode.handStart; i++) drawCard(g, p.idx, { silent: true });
    if (opts.mulligan !== false) autoMulligan(g, p.idx);
    Object.defineProperty(p, 'script', { value: p.idx === 0 ? opts.scriptA : opts.scriptB, writable: true, enumerable: false });
  }
  g.phase = 'start';
  g.needsStart = true;
  g.log.push(`开局【${mode.name}】：种子 ${g.seed}；双方生命 ${mode.life}，起手 ${mode.handStart}。`);
  return g;
}

function autoMulligan(g, side) {
  const p = g.players[side];
  const keep = [], back = [];
  for (const uid of p.hand) (effectiveBaseCost(g, side, rawOf(g.cards[uid]).name, 'main').total >= 6 ? back : keep).push(uid);
  if (!back.length) return;
  p.hand = keep;
  for (const uid of back) moveCard(g, uid, 'deck', side, { silent: true });
  g.rng.shuffle(p.deck);
  for (let i = 0; i < back.length; i++) drawCard(g, side, { silent: true });
  g.log.push(`${p.name} 调度 ${back.length} 张高费起手。`);
}

export function card(g, uid) { return g.cards[uid] || null; }
export function playerFor(g, uid) { const c = card(g, uid); return c ? g.players[c.controller] : null; }

/** SE01 的「回响」静态加成：自身加成只作用于本卡，aura 作用于己方全体。 */
function se01Bonus(g, c, key) {
  if (!c || !c.id) return 0;
  const side = c.controller;
  let total = 0;
  for (const uid of g.players[side].field) {
    const b = se01StaticBonus(g, side, uid);
    if (!b) continue;
    if (b.aura) total += b.aura[key] || 0;
    else if (uid === c.uid) total += b[key] || 0;
  }
  return total;
}

export function unitAtk(g, uid, combat = g.combat) {
  const c = card(g, uid), d = rawOf(c); if (!c || !d) return 0;
  let n = d.attack || 0;
  for (const m of c.mods || []) n += m.atk || 0;
  n += se01Bonus(g, c, 'atk');
  if (combat?.attackerUid === uid) n += combat.supportAtk || 0;
  return Math.max(0, n);
}
export function unitImp(g, uid, combat = g.combat) {
  const c = card(g, uid), d = rawOf(c); if (!c || !d) return 0;
  let n = d.impact || 0;
  for (const m of c.mods || []) n += m.imp || 0;
  n += se01Bonus(g, c, 'imp');
  if (combat?.attackerUid === uid) n += combat.supportImp || 0;
  return Math.max(0, n);
}
export function unitHp(g, uid) {
  const c = card(g, uid), d = rawOf(c); if (!c || !d) return 0;
  const base = (d.vitality || 0) + (c.mods || []).reduce((n, m) => n + (m.hp || 0), 0);
  return Math.max(0, base + se01Bonus(g, c, 'hp'));
}
export function keywords(g, uid) { return rawOf(card(g, uid))?.keywords || []; }
const isDream = (c) => !!c?.token;
const onField = (g, uid) => card(g, uid)?.zone === 'field';

function removeUid(p, uid) {
  for (const z of ZONE_NAMES) {
    const i = p[z].indexOf(uid);
    if (i >= 0) { p[z].splice(i, 1); return z; }
  }
  return null;
}

function resetBattleState(c) {
  c.damage = 0; c.tapped = false; c.mods = []; c.doomed = false;
  c.substituteUid = null; c.enteredTurn = -1; c.useAs = null;
}

export function moveCard(g, uid, dest, side = null, options = {}) {
  const c = card(g, uid); if (!c) return false;
  const old = c.zone;
  const owner = side ?? c.controller;
  const p = g.players[owner];
  if (old === 'field' && dest !== 'field') {
    const name = rawOf(c).name;
    if (name === '圣光祷告者') dest = 'life';
    if (c.substituteUid) {
      const other = card(g, c.substituteUid);
      if (other) other.substituteFor = null;
    }
  }
  if (c.token && !['field', 'grave', 'removed'].includes(dest)) dest = 'grave';
  removeUid(g.players[c.controller], uid);
  if (old === 'chain') c.zone = 'chain';
  c.controller = owner;
  if (dest !== 'field') resetBattleState(c);
  c.zone = dest;
  if (dest === 'field') {
    c.damage = 0; c.tapped = false; c.mods = []; c.doomed = false; c.enteredTurn = g.turn; c.blockCount = 0;
    p.field.push(uid);
  } else if (dest === 'removed') {
    // 衍生物在终曲入链后移出本局；实例保留供事件快照核查。
  } else if (p[dest]) {
    if (options.bottom) p[dest].unshift(uid); else p[dest].push(uid);
  } else if (dest !== 'chain') throw new Error(`未知区域 ${dest}`);
  if (!options.silent) g.log.push(`【${rawOf(c).name}】${old} → ${dest}。`);
  if (dest === 'grave' && old !== 'grave') { fireHook(g, 0, 'cardToGrave'); fireHook(g, 1, 'cardToGrave'); }
  if (old === 'field' && dest !== 'field') {
    const name = rawOf(c).name;
    // 终曲按关键词判定，不按卡名白名单：卡面写了终曲就必须入链。
    // 圣光祷告者的「终曲」是替代去向（上面已把 dest 改为 life），不再入触发队列。
    const kw = rawOf(c).keywords || [];
    if (name !== '圣光祷告者' && kw.includes('终曲')) queueTrigger(g, owner, uid, 'final', name);
  }
  if (dest === 'field' && old !== 'field') {
    const name = rawOf(c).name;
    if (['黑市商人', '圣光战将', '织梦学徒', '梦境巡逻员', '梦质处理师', '幻梦战将', '预言学徒', '暗夜战将'].includes(name)) {
      queueTrigger(g, owner, uid, 'enter', name, { mode: c.pendingMode || 'main' });
    }
    if (isDream(c)) {
      for (const pl of g.players) {
        for (const source of [...pl.field]) {
          if (source === uid) continue;
          const n = rawOf(card(g, source)).name;
          if (pl.idx === owner && n === '幻梦战将') queueTrigger(g, pl.idx, source, 'echoBuff', n);
          if (pl.idx === owner && n === '梦境采集者') queueTrigger(g, pl.idx, source, 'echoDream', n);
        }
      }
    }
  }
  if (c.token && dest === 'grave') {
    removeUid(p, uid); c.zone = 'removed';
  }
  return true;
}

function queueTrigger(g, side, sourceUid, event, name, extra = {}) {
  g.triggers.push({ side, sourceUid, event, name, mode: extra.mode || 'main' });
}

function candidateForGroup(g, side, spec, event) {
  const opp = OPP(side);
  let pool = [];
  if (spec.kind === 'unit' || spec.kind === 'card') {
    const sides = spec.side === 'any' ? [0, 1] : [spec.side === 'own' ? side : opp];
    pool = sides.flatMap((s) => g.players[s].field.filter((uid) => {
      const c = card(g, uid), d = rawOf(c);
      if (spec.kind === 'unit' && d.type !== '灵像' && !c.token) return false;
      if (spec.dream && !isDream(c)) return false;
      if (spec.maxCost != null && d.cost.total > spec.maxCost) return false;
      if (s !== side && keywords(g, uid).includes('灵气')) return false;
      return true;
    }));
    const decoys = pool.filter((uid) => g.players[OPP(side)].field.includes(uid) && keywords(g, uid).includes('诱饵'));
    if (decoys.length && spec.side !== 'own') pool = decoys;
  } else if (spec.kind === 'grave') {
    pool = g.players[spec.side === 'own' ? side : opp].grave.filter((uid) => {
      const c = card(g, uid), d = rawOf(c);
      if (spec.color && d.color !== spec.color) return false;
      if (spec.maxCost != null && d.cost.total > spec.maxCost) return false;
      if (spec.ct && !String(d.trigger).includes('CT')) return false;
      if (spec.unitOnly && d.type !== '灵像') return false;
      return true;
    });
  } else if (spec.kind === 'chainInspiration') {
    pool = g.chain.filter((x) => x.kind === 'card' && x.controller !== side && x.effectiveType === '灵感' && !x.countered).map((x) => x.key);
  }
  return pool;
}

function combinations(pool, count, min = count) {
  const out = [];
  const target = Math.min(count, pool.length);
  if (target < min) return out;
  const visit = (start, picked) => {
    if (picked.length === target) { out.push(picked); return; }
    for (let i = start; i <= pool.length - (target - picked.length); i++) visit(i + 1, [...picked, pool[i]]);
  };
  visit(0, []);
  return out;
}

export function enumerateTargets(g, side, name, mode = 'main', event = 'main') {
  let groups = targetGroups(name, mode, event);
  if (name === '梦境采集者' && mode.startsWith('extract')) groups = targetGroups('梦境采集', mode === 'extract_sacrifice' ? 'sacrifice' : 'plain', 'main');
  if (!groups.length) return [[]];
  let results = [[]];
  for (const spec of groups) {
    const comparisonMode = name === '梦境采集者' && mode === 'extract_sacrifice' ? 'sacrifice' : mode;
    if (spec.onlyMode && spec.onlyMode !== comparisonMode) {
      if (!['main', 'normal', 'extract', 'plain'].includes(comparisonMode)) return [];
      continue;
    }
    const pool = candidateForGroup(g, side, spec, event);
    const wanted = spec.modeCount?.[mode] ?? spec.count;
    const combos = combinations(pool, wanted, Math.min(spec.min ?? wanted, pool.length));
    if (!combos.length) return [];
    results = results.flatMap((prefix) => combos.map((x) => [...prefix, ...x]));
  }
  return results;
}

function autoTriggerTargets(g, side, name, mode, event) {
  const all = enumerateTargets(g, side, name, mode, event);
  if (!all.length) return [];
  const score = (targets) => targets.reduce((sum, uid) => {
    const c = card(g, uid); if (!c) return sum;
    if (name.includes('回复') || name === '圣光打击') return sum + c.damage;
    if (c.controller !== side) return sum + unitAtk(g, uid) + unitHp(g, uid) / 1000;
    return sum + 1;
  }, 0);
  return all.sort((a, b) => score(b) - score(a))[0];
}

function flushTriggers(g) {
  if (!g.triggers.length) return false;
  const rank = (t) => {
    const c = card(g, t.sourceUid);
    return (t.side === g.active ? 0 : 1000) + (c?.zone === 'field' ? g.players[t.side].field.indexOf(t.sourceUid) : 100);
  };
  const pending = g.triggers.splice(0).sort((a, b) => rank(a) - rank(b));
  for (const t of pending) {
    const targets = autoTriggerTargets(g, t.side, t.name, t.mode, t.event);
    const key = `k${g.nextUid++}`;
    g.chain.push({ key, kind: t.event === 'lifeCrit' ? 'lifeCrit' : 'trigger', controller: t.side, sourceUid: t.sourceUid, name: t.name, event: t.event, mode: t.mode, targets, countered: false });
    g.log.push(`${g.players[t.side].name} 的【${t.name}】${t.event} 触发加入连锁。`);
  }
  g.priority = g.active; g.passCount = 0;
  return true;
}

export function burst(g, side) { return g.players[side].grave.filter((uid) => rawOf(card(g, uid)).type === '灵感').length; }

/** 把卡的 cost 归一成 { 颜色: 点数 }；单色卡没有 colors 字段时用卡面颜色补齐。 */
function costColors(d) {
  const c = d.cost || {};
  if (c.colors && !c.colors.__single) return { ...c.colors };
  const n = c.colors?.__single ?? c.colored ?? 0;
  return n > 0 ? { [d.color]: n } : {};
}

function effectiveBaseCost(g, side, name, mode) {
  let d = BY_NAME.get(name);
  if (name === '梦境采集者' && mode.startsWith('extract')) d = BY_NAME.get('梦境采集');
  const b = burst(g, side);
  const reduction = costReduction(g, side, name, mode, b);
  const colors = costColors(d);
  let left = reduction;
  for (const k of Object.keys(colors)) {
    if (!left) break;
    const take = Math.min(left, colors[k]);
    colors[k] -= take; left -= take;
    if (!colors[k]) delete colors[k];
  }
  const colored = Object.values(colors).reduce((a, x) => a + x, 0);
  return { colors, colored, grey: d.cost.grey || 0, total: colored + (d.cost.grey || 0), reduction };
}

function manaPlan(g, side, colors, grey, commit = false) {
  const p = g.players[side];
  const pool = { ...p.mana };
  const untapped = p.essence.filter((uid) => !card(g, uid).tapped);
  const tapFor = (color) => {
    const i = untapped.findIndex((uid) => rawOf(card(g, uid)).color === color);
    if (i < 0) return false;
    const uid = untapped.splice(i, 1)[0];
    if (commit) card(g, uid).tapped = true;
    pool[color] = (pool[color] || 0) + 1;
    return true;
  };
  const spend = (color, n) => {
    let left = n;
    while (left > 0 && (pool[color] || 0) > 0) { pool[color]--; if (commit) p.mana[color]--; left--; }
    while (left > 0) {
      if (!tapFor(color)) return false;
      pool[color]--; if (commit) p.mana[color]--;
      left--;
    }
    return true;
  };
  for (const [color, n] of Object.entries(colors)) if (n > 0 && !spend(color, n)) return false;
  let left = grey;
  while (left > 0) {
    const color = Object.keys(pool).find((c) => pool[c] > 0);
    if (color) { pool[color]--; if (commit) p.mana[color]--; left--; continue; }
    if (!untapped.length) return false;
    const uid = untapped.shift();
    if (commit) card(g, uid).tapped = true;
    left--;
  }
  return true;
}

export function canPay(g, side, name, mode = 'main') {
  const cost = effectiveBaseCost(g, side, name, mode);
  return manaPlan(g, side, cost.colors, cost.grey, false);
}
export function payCost(g, side, name, mode = 'main') {
  const cost = effectiveBaseCost(g, side, name, mode);
  const ok = manaPlan(g, side, cost.colors, cost.grey, true);
  if (ok) {
    const parts = Object.entries(cost.colors).map(([c, n]) => `${n} 点${c}色`);
    g.log.push(`${g.players[side].name} 支付 ${parts.join('＋') || '0 点同色'}${cost.grey ? `＋${cost.grey} 点灰` : ''}。`);
  }
  return ok;
}
function payColored(g, side, color, n) { return manaPlan(g, side, { [color]: n }, 0, true); }

export function drawCard(g, side, options = {}) {
  const p = g.players[side];
  const source = p.deck.length ? 'deck' : p.life.length ? 'life' : null;
  if (!source) { markLoser(g, side, '无牌可抽'); return null; }
  const uid = p[source][p[source].length - 1];
  moveCard(g, uid, 'hand', side, { silent: true });
  p.stats.draws++;
  if (!options.silent) g.log.push(`${p.name} 从${source === 'deck' ? '主卡组' : '生命卡组（不揭示）'}抽 1 张。`);
  if (!options.silent && !p.firstDrawUsed) { p.firstDrawUsed = true; fireHook(g, side, 'firstDraw'); }
  return { uid, source };
}
function drawLife(g, side, n) {
  const p = g.players[side];
  for (let i = 0; i < n && p.life.length; i++) moveCard(g, p.life[p.life.length - 1], 'hand', side);
}
function drawN(g, side, n) { for (let i = 0; i < n && !g.over; i++) drawCard(g, side); }

function addChain(g, entry, actor) {
  g.chain.push({ key: `k${g.nextUid++}`, countered: false, targets: [], mode: 'main', ...entry });
  g.priority = actor; g.passCount = 0;
}

function playCard(g, side, move) {
  const p = g.players[side], c = card(g, move.uid);
  if (!c || c.zone !== 'hand' || c.controller !== side) return false;
  const original = rawOf(c), name = original.name;
  const mode = move.mode || 'main';
  const extracted = name === '梦境采集者' && mode.startsWith('extract');
  const effectiveType = extracted ? '灵感' : original.type;
  const effectName = extracted ? '梦境采集' : name;
  const effectMode = extracted ? (mode === 'extract_sacrifice' ? 'sacrifice' : 'plain') : mode;
  if (name === '次元超越' && p.usedDimension >= 1) return false;
  if (mode === 'bury' && p.hand.length < 2) return false;
  if (!payCost(g, side, name, mode)) return false;
  p.hand.splice(p.hand.indexOf(move.uid), 1);
  c.zone = 'chain'; c.controller = side; c.pendingMode = mode;
  if (name === '次元超越') p.usedDimension++;
  addChain(g, { kind: 'card', controller: side, sourceUid: move.uid, name: effectName, originalName: name, effectiveType, event: 'main', mode: effectMode, targets: move.targets || [] }, side);
  g.log.push(`${p.name} 使用【${extracted ? '梦境采集（提取灵感）' : name}】，加入连锁 ${g.chain.length}。`);
  if (effectiveType === '灵感' && !p.firstInspUsed) { p.firstInspUsed = true; fireHook(g, side, 'firstInspiration'); }
  return true;
}

function setEssence(g, side, uid) {
  const p = g.players[side], c = card(g, uid);
  if (!c || c.zone !== 'hand' || p.essenceSetTurn === g.turn) return false;
  moveCard(g, uid, 'essence', side, { silent: true });
  c.tapped = false; p.essenceSetTurn = g.turn;
  g.log.push(`${p.name} 将【${rawOf(c).name}】设置为${rawOf(c).color}色灵质。`);
  return true;
}

function tapEssence(g, side, uid) {
  const p = g.players[side], c = card(g, uid);
  if (!c || c.zone !== 'essence' || c.tapped) return false;
  c.tapped = true; p.mana[rawOf(c).color]++;
  g.log.push(`${p.name} 横置【${rawOf(c).name}】，产生 1 点${rawOf(c).color}色灵能。`);
  return true;
}

function canTapActivated(g, uid, side, essenceOnly = false) {
  const c = card(g, uid); if (!c || c.controller !== side || c.tapped) return false;
  if (essenceOnly) return c.zone === 'essence';
  if (c.zone !== 'field') return false;
  return c.enteredTurn < g.turn || keywords(g, uid).includes('预制');
}

function activationMoves(g, side) {
  const p = g.players[side], out = [];
  for (const uid of p.essence) {
    const name = rawOf(card(g, uid)).name;
    if (!keywords(g, uid).includes('质密') || !canTapActivated(g, uid, side, true)) continue;
    if (name === '幻梦战将') continue;
    for (const targets of enumerateTargets(g, side, name, 'main', 'activate')) out.push({ type: 'ability', uid, name, targets });
  }
  for (const uid of p.field) {
    const name = rawOf(card(g, uid)).name;
    if (!canTapActivated(g, uid, side)) continue;
    // 第一弹：任何在 SE01_EFFECTS 里登记了 activate 的卡都能横置启动。
    if (SE01_EFFECTS[name]?.activate) {
      for (const targets of enumerateTargets(g, side, name, 'main', 'activate')) out.push({ type: 'ability', uid, name, targets });
      continue;
    }
    if (name === '梦境巡逻员' || name === '梦境采集者') out.push({ type: 'ability', uid, name, targets: [] });
    if (name === '梦质处理师' && p.spirit.dream >= 1) out.push({ type: 'ability', uid, name, targets: [] });
    if (name === '幻梦战将' && p.spirit.dream >= 1) {
      for (const mode of ['tokens', 'damage', 'charge']) {
        for (const targets of enumerateTargets(g, side, name, mode, 'activate')) out.push({ type: 'ability', uid, name, mode, targets });
      }
    }
    if (name === '亡魂役使者·伊可莱' && p.grave.length >= 7) {
      for (const targets of enumerateTargets(g, side, name, 'main', 'activate')) out.push({ type: 'ability', uid, name, targets });
    }
  }
  // 灵体专属能力：与通用抽牌共用横置，一回合只能二选一。
  const spirit = BY_SPIRIT.get(p.spiritName);
  if (spirit && !p.spirit.tapped && SE01_SPIRIT_EFFECTS[spirit.name]) {
    const ready = spirit.name !== '陵园看守者' || p.grave.filter((x) => rawOf(card(g, x)).color === '黑').length >= 3;
    if (ready) for (const targets of enumerateTargets(g, side, spirit.name, 'main', 'spiritActivate')) out.push({ type: 'spiritSpecial', name: spirit.name, targets });
  }
  return out;
}

function payExileCost(g, side, n, color, protectedUid) {
  const p = g.players[side];
  const picked = p.grave.filter((uid) => uid !== protectedUid && (!color || rawOf(card(g, uid)).color === color)).slice(0, n);
  if (picked.length < n) return false;
  for (const uid of picked) moveCard(g, uid, 'exile', side);
  g.log.push(`${p.name} 支付启动费用：消散分解区 ${n} 张卡。`);
  return true;
}

function activate(g, side, move) {
  const p = g.players[side];
  if (move.type === 'spiritSpecial') {
    if (p.spirit.tapped) return false;
    const spirit = BY_SPIRIT.get(p.spiritName);
    const def = spirit ? SE01_SPIRIT_EFFECTS[spirit.name] : null;
    if (!def) return false;
    p.spirit.tapped = true;
    addChain(g, { kind: 'ability', controller: side, sourceUid: null, name: spirit.name, event: 'spiritActivate', targets: move.targets || [] }, side);
    g.log.push(`${p.name} 启动【${spirit.name}】的专属能力。`);
    return true;
  }
  const c = card(g, move.uid), name = rawOf(c).name;
  if (!canTapActivated(g, move.uid, side, c.zone === 'essence')) return false;
  if (['梦质处理师', '幻梦战将'].includes(name)) {
    if (p.spirit.dream < 1) return false;
    p.spirit.dream--;
    g.log.push(`${p.name} 支付 1 个梦境指示物，剩余 ${p.spirit.dream}。`);
  }
  if (name === '亡魂役使者·伊可莱' && !payExileCost(g, side, 6, null, move.targets?.[0])) return false;
  c.tapped = true;
  addChain(g, { kind: 'ability', controller: side, sourceUid: move.uid, name, event: 'activate', mode: move.mode || 'main', targets: move.targets || [] }, side);
  g.log.push(`${p.name} 横置【${name}】启动能力。`);
  return true;
}

function spiritDraw(g, side) {
  const p = g.players[side];
  if (p.spirit.tapped || p.turnCount <= 1 || g.inspect) return false;
  p.spirit.tapped = true;
  const source = p.deck.length ? 'deck' : p.life.length ? 'life' : null;
  if (!source) { markLoser(g, side, '无牌可抽'); return true; }
  const uid = p[source][p[source].length - 1];
  if (source === 'life') {
    drawCard(g, side);
    g.log.push(`${p.name} 的灵体检视来自生命卡组的卡，直接加入手牌，不能支付揭示。`);
  } else {
    g.inspect = { side, uid, source };
    g.log.push(`${p.name} 的灵体检视主卡组顶卡，选择直接加入或支付 1 点${p.color}色灵能揭示。`);
  }
  return true;
}

function resolveInspect(g, move) {
  const ins = g.inspect; if (!ins) return false;
  const p = g.players[ins.side], c = card(g, ins.uid), name = rawOf(c).name;
  if (move.type === 'inspectReveal') {
    if (!payColored(g, ins.side, p.color, 1)) return false;
    moveCard(g, ins.uid, 'reveal', ins.side, { silent: true });
    g.log.push(`${p.name} 揭示【${name}】，处理 ST。`);
    const trig = revealTrigger(rawOf(c), 'ST');
    if (trig) queueTrigger(g, ins.side, ins.uid, trig, name);
    moveCard(g, ins.uid, 'hand', ins.side, { silent: true });
  } else {
    moveCard(g, ins.uid, 'hand', ins.side, { silent: true });
    g.log.push(`${p.name} 不支付揭示费用，将卡加入手牌。`);
  }
  g.inspect = null; g.priority = g.active; g.passCount = 0;
  return true;
}

function revealTrigger(d, source) {
  const t = String(d.trigger || '');
  if (source === 'ST') {
    if (t.includes('CT')) return 'CT';
    if (t.includes('MT') || t.includes('ST')) return t.includes('MT') ? 'MT' : 'ST';
  }
  if (source === 'LT') {
    if (t.includes('CT')) return 'lifeCrit';
    if (t.includes('MT') || t.includes('LT')) return t.includes('MT') ? 'MT' : 'LT';
  }
  return null;
}

function markLoser(g, side, reason) {
  if (!g.losers.includes(side)) g.losers.push(side);
  g.log.push(`${g.players[side].name} 因「${reason}」落败。`);
  if (g.losers.length >= 2) { g.over = true; g.winner = null; g.reason = '双方同时落败'; }
  else { g.over = true; g.winner = OPP(side); g.reason = reason; }
}

export function dealLifeDamage(g, side, amount, source = '效果', kind = 'direct') {
  if (amount <= 0 || g.over) return;
  if (g.lifeDamage) {
    // 当前伤害事件完整结算后才开启下一段；正常效果不会走到此分支。
    g.lifeDamage.queued = (g.lifeDamage.queued || 0) + amount;
    return;
  }
  const resumeChain = g.chain.splice(0);
  g.lifeDamage = { side, remaining: amount, initial: amount, critAdded: false, source, kind, current: null, reveals: 0, resumeChain, queued: 0 };
  g.priority = g.active; g.passCount = 0;
  g.log.push(`${g.players[side].name} 受到 ${amount} 点生命伤害（${source}），逐点处理。`);
}

function processLifeDamage(g) {
  const ev = g.lifeDamage; if (!ev || g.over) return false;
  const p = g.players[ev.side];
  if (ev.current) {
    if (g.chain.length || g.triggers.length) return false;
    const uid = ev.current;
    moveCard(g, uid, 'grave', ev.side, { silent: true });
    g.log.push(`生命揭示【${rawOf(card(g, uid)).name}】进入分解区。`);
    ev.current = null;
    if (ev.remaining > 0) return true;
  }
  if (ev.remaining <= 0) {
    p.stats.maxReveal = Math.max(p.stats.maxReveal, ev.reveals);
    g.log.push(`${ev.source} 的生命伤害事件结束，共揭示 ${ev.reveals} 张。`);
    const queued = ev.queued || 0;
    g.chain = ev.resumeChain || [];
    g.lifeDamage = null; g.priority = g.active; g.passCount = 0;
    if (queued > 0) dealLifeDamage(g, ev.side, queued, ev.source, ev.kind);
    return true;
  }
  if (p.armor.length) {
    const armor = p.armor[p.armor.length - 1];
    moveCard(g, armor, 'grave', ev.side);
    ev.remaining--;
    g.log.push(`${p.name} 以【法师护甲】代替 1 点生命伤害。`);
    return true;
  }
  if (!p.life.length) { markLoser(g, ev.side, '生命卡组为空且仍需结算生命伤害'); return true; }
  const uid = p.life[p.life.length - 1];
  moveCard(g, uid, 'reveal', ev.side, { silent: true });
  ev.current = uid; ev.remaining--; ev.reveals++;
  p.stats.lifeReveals++; p.stats[ev.kind === 'combat' ? 'combatDamage' : 'directDamage']++;
  const d = rawOf(card(g, uid));
  g.log.push(`${p.name} 揭示生命卡【${d.name}】，待结算 ${ev.remaining} 点。`);
  const trig = revealTrigger(d, 'LT');
  if (trig) queueTrigger(g, ev.side, uid, trig, d.name);
  g.priority = g.active; g.passCount = 0;
  return true;
}

function validTarget(g, uid) {
  if (typeof uid === 'string' && uid.startsWith('k')) return g.chain.some((x) => x.key === uid && !x.countered);
  return onField(g, uid) || card(g, uid)?.zone === 'grave';
}

function damageUnit(g, uid, amount, source = '效果') {
  const c = card(g, uid); if (!c || c.zone !== 'field' || amount <= 0) return 0;
  const remaining = Math.max(0, unitHp(g, uid) - c.damage);
  if (keywords(g, uid).includes('碾压') && amount < remaining) {
    g.log.push(`【${rawOf(c).name}】的碾压防止 ${amount} 点非致命伤害。`); return 0;
  }
  c.damage += amount;
  g.log.push(`【${rawOf(c).name}】受到 ${amount} 点伤害（${source}），累计 ${c.damage}/${unitHp(g, uid)}。`);
  return amount;
}

function destroy(g, uid, source = '效果') {
  const c = card(g, uid); if (!c || c.zone !== 'field') return false;
  if (c.substituteUid) {
    const sub = card(g, c.substituteUid);
    if (sub?.zone === 'essence') {
      const targetName = rawOf(c).name;
      c.substituteUid = null; c.damage = 0;
      moveCard(g, sub.uid, 'grave', sub.controller);
      g.log.push(`【${rawOf(sub).name}】代替【${targetName}】进入分解区。`);
      return false;
    }
  }
  g.log.push(`【${rawOf(c).name}】被${source}破坏。`);
  const moved = moveCard(g, uid, 'grave', c.controller);
  if (moved) fireHook(g, c.controller, 'unitDestroyed');
  return moved;
}

function stateCheck(g) {
  if (g.over) return false;
  const dying = g.players.flatMap((p) => p.field.filter((uid) => card(g, uid).damage >= unitHp(g, uid)));
  if (!dying.length) return false;
  for (const uid of dying) if (onField(g, uid)) destroy(g, uid, '状态检查');
  return true;
}

function createToken(g, side, n = 1) {
  const p = g.players[side];
  for (let i = 0; i < n; i++) {
    const uid = `t${g.nextUid++}`;
    g.cards[uid] = { uid, id: TOKEN_DEF.id, token: true, owner: side, controller: side, zone: 'outside', damage: 0, tapped: false, enteredTurn: -1, mods: [] };
    moveCard(g, uid, 'field', side, { silent: true });
    p.stats.tokens++;
    g.log.push(`${p.name} 召唤 1 个幻梦衍生物。`);
    fireHook(g, side, 'tokenEnter');
  }
}

/** 激活：揭示主卡组顶至多 n 张并发动 ST；近似为不改变卡组顺序（见 APPROXIMATIONS）。 */
function activateCards(g, side, n) {
  const p = g.players[side];
  const picked = [];
  for (let i = 0; i < n && i < p.deck.length; i++) picked.push(p.deck[p.deck.length - 1 - i]);
  for (const uid of [...picked].reverse()) {
    const def = rawOf(card(g, uid));
    if (def.trigger === 'ST' || def.trigger === 'MT') queueTrigger(g, side, uid, 'ST', def.name);
  }
  if (picked.length) g.log.push(`${p.name} 激活 ${picked.length} 张（近似：结算后保持原顺序）。`);
  return picked;
}

function activateToHand(g, side, n) {
  const p = g.players[side];
  for (let i = 0; i < n && p.deck.length; i++) {
    const uid = p.deck[p.deck.length - 1];
    const def = rawOf(card(g, uid));
    if (def.trigger === 'ST' || def.trigger === 'MT') queueTrigger(g, side, uid, 'ST', def.name);
    moveCard(g, uid, 'hand', side, { silent: true });
  }
  if (n > 0) g.log.push(`${p.name} 激活 ${n} 张并加入手牌。`);
}

function effectApi(g, ctx) {
  const side = ctx.side;
  return {
    validTarget: (uid) => validTarget(g, uid),
    draw: (s, n) => drawN(g, s, n),
    drawLife: (s, n) => drawLife(g, s, n),
    damageUnit: (uid, n, source) => damageUnit(g, uid, n, source),
    destroy: (uid, source) => destroy(g, uid, source),
    lifeDamage: (s, n, source, kind) => dealLifeDamage(g, s, n, source, kind),
    addCrit: (s, n) => { g.players[s].spirit.crit += n; g.log.push(`${g.players[s].name} 的灵体获得 ${n} 个暴击指示物。`); },
    dream: (s, n) => { g.players[s].spirit.dream = Math.max(0, g.players[s].spirit.dream + n); g.log.push(`${g.players[s].name} 的梦境指示物 ${n >= 0 ? '+' : ''}${n}，现有 ${g.players[s].spirit.dream}。`); },
    healUnit: (uid, n) => { const c = card(g, uid); if (c) { const old = c.damage; c.damage = Math.max(0, c.damage - n); g.log.push(`【${rawOf(c).name}】回复 ${old - c.damage} 点伤害。`); } },
    createToken: (s, n) => createToken(g, s, n),
    modifyUnit: (uid, atk, imp, hp, until) => { const c = card(g, uid); if (c) { c.mods.push({ atk, imp, hp, until }); g.log.push(`【${rawOf(c).name}】获得 ${atk >= 0 ? '+' : ''}${atk}/+${imp}/+${hp}。`); } },
    modifyDreams: (atk, imp, hp) => { for (const p of g.players) for (const uid of p.field) if (isDream(card(g, uid))) card(g, uid).mods.push({ atk, imp, hp, until: 'permanent' }); g.log.push('当前所有幻梦衍生物获得强化。'); },
    doomAtEnd: (uid) => { if (card(g, uid)) card(g, uid).doomed = true; },
    addMana: (s, color, n) => { g.players[s].mana[color] += n; g.log.push(`${g.players[s].name} 获得 ${n} 点${color}色灵能。`); },
    payColored: (s, color, n) => payColored(g, s, color, n),
    attachArmor: (uid, s) => { if (card(g, uid)) { moveCard(g, uid, 'armor', s); g.log.push(`【法师护甲】置于${g.players[s].name}的灵体旁。`); } },
    exileSource: (uid) => { if (card(g, uid)) moveCard(g, uid, 'exile', card(g, uid).controller); },
    sourceToLife: (uid, s) => moveCard(g, uid, 'life', s),
    untapEssence: (s, n) => { let left = n; for (const uid of [...g.players[s].essence].reverse()) if (card(g, uid).tapped && left-- > 0) card(g, uid).tapped = false; g.log.push(`${g.players[s].name} 重置至多 ${n} 张灵质。`); },
    addSubstitute: (uid, sub) => { if (card(g, uid)) { card(g, uid).substituteUid = sub; g.log.push(`【${rawOf(card(g, uid)).name}】获得一次黑暗聚合体替代。`); } },
    scry: (s, x, y) => scry(g, s, x, y),
    mill: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.deck.length; i++) moveCard(g, p.deck[p.deck.length - 1], 'grave', s); },
    millLife: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.life.length; i++) moveCard(g, p.life[p.life.length - 1], 'grave', s); },
    deckToLife: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.deck.length; i++) moveCard(g, p.deck[p.deck.length - 1], 'life', s); },
    destroyAll: (source) => { const all = g.players.flatMap((p) => [...p.field]); for (const uid of all) destroy(g, uid, source); },
    bounce: (uid) => moveCard(g, uid, 'hand', card(g, uid).owner),
    toHand: (uid, s) => moveCard(g, uid, 'hand', s),
    toLife: (uid, s) => moveCard(g, uid, 'life', s),
    inGrave: (uid, s) => card(g, uid)?.zone === 'grave' && card(g, uid)?.controller === s,
    counterChain: (key, s) => { const item = g.chain.find((x) => x.key === key); if (item && item.controller !== s && item.effectiveType === '灵感') { item.countered = true; g.log.push(`【${item.name}】被无效；费用不返还，结算后进入分解区。`); } },
    skipNextTurn: (s) => { g.players[s].skipTurns++; g.log.push(`${g.players[s].name} 的下一个回合将被跳过。`); },
    exileInspirations: (s, n) => { const p = g.players[s]; const list = p.grave.filter((uid) => rawOf(card(g, uid)).type === '灵感').slice(0, n); for (const uid of list) moveCard(g, uid, 'exile', s); },
    bury: (s, n) => { const p = g.players[s]; if (!p.hand.length) return false; const picked = [...p.hand].sort((a, b) => rawOf(card(g, a)).cost.total - rawOf(card(g, b)).cost.total).slice(0, n); if (picked.length < n) return false; for (const uid of picked) moveCard(g, uid, 'grave', s); return true; },
    exileGraveCost: (s, defaultN, actualN, color, protectedUid) => { const p = g.players[s]; const n = color ? actualN : defaultN; const list = p.grave.filter((uid) => uid !== protectedUid && (!color || rawOf(card(g, uid)).color === color)).slice(0, n); for (const uid of list) moveCard(g, uid, 'exile', s); },
    summonFromGrave: (uid, s) => moveCard(g, uid, 'field', s),
    burst: (s) => burst(g, s),
    game: g,

    // ── SE01 扩展：位置、指示物与资源 ──────────────────────────
    tapUnit: (uid) => { const c = card(g, uid); if (c) { c.tapped = true; g.log.push(`【${rawOf(c).name}】被横置。`); } },
    lockUntap: (uid) => { const c = card(g, uid); if (c) { c.lockUntap = true; g.log.push(`【${rawOf(c).name}】下个重置阶段不能重置。`); } },
    buffAll: (s, atk, imp, hp, until) => {
      for (const uid of g.players[s].field) { const c = card(g, uid); if (c) c.mods.push({ atk, imp, hp, until }); }
      g.log.push(`${g.players[s].name} 场上全体获得 +${atk}/+${imp}/+${hp}。`);
    },
    selfBuff: (atk, imp, hp) => {
      const c = card(g, ctx.sourceUid);
      if (c) { c.mods.push({ atk, imp, hp, until: 'permanent' }); g.log.push(`【${rawOf(c).name}】自身获得 +${atk}/+${imp}/+${hp}。`); }
    },
    healAll: (s, n) => {
      for (const uid of g.players[s].field) { const c = card(g, uid); if (c && c.damage) c.damage = Math.max(0, c.damage - n); }
      g.log.push(`${g.players[s].name} 场上全体回复 ${n} 点伤害。`);
    },
    lifeToGrave: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.life.length; i++) moveCard(g, p.life[p.life.length - 1], 'grave', s); },
    graveToExile: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.grave.length; i++) moveCard(g, p.grave[0], 'exile', s); },
    graveToDeck: (s, n) => { const p = g.players[s]; for (let i = 0; i < n && p.grave.length; i++) moveCard(g, p.grave[0], 'deck', s, { bottom: true }); },
    graveInspirationToHand: (s, n) => {
      const p = g.players[s];
      const picked = p.grave.filter((uid) => rawOf(card(g, uid)).type === '灵感' && rawOf(card(g, uid)).color === '红').slice(0, n);
      for (const uid of picked) moveCard(g, uid, 'hand', s);
      if (picked.length) g.log.push(`${p.name} 将分解区 ${picked.length} 张红色灵感卡加入手牌。`);
    },
    handToEssence: (s, idx = 0) => {
      const p = g.players[s];
      const list = [...p.hand].sort((a, b) => rawOf(card(g, a)).cost.total - rawOf(card(g, b)).cost.total);
      const uid = list[idx];
      if (!uid) return false;
      moveCard(g, uid, 'essence', s, { silent: true });
      card(g, uid).tapped = false;
      g.log.push(`${p.name} 将 1 张手牌置于灵质区。`);
      return true;
    },
    deckToEssence: (s, n) => {
      const p = g.players[s];
      for (let i = 0; i < n && p.deck.length; i++) {
        const uid = p.deck[p.deck.length - 1];
        moveCard(g, uid, 'essence', s, { silent: true });
        card(g, uid).tapped = false;
      }
      if (n > 0) g.log.push(`${p.name} 将主卡组顶 ${n} 张置于灵质区。`);
    },
    discard: (s, n) => {
      const p = g.players[s];
      const list = [...p.hand].sort((a, b) => rawOf(card(g, a)).cost.total - rawOf(card(g, b)).cost.total).slice(0, n);
      for (const uid of list) moveCard(g, uid, 'grave', s);
      return list.length === n;
    },
    selfToGrave: (uid) => moveCard(g, uid, 'grave', card(g, uid)?.controller ?? ctx.side),
    selfToEssence: (uid) => { const c = card(g, uid); if (!c) return; moveCard(g, uid, 'essence', c.controller, { silent: true }); c.tapped = false; g.log.push(`【${rawOf(c).name}】置于灵质区。`); },
    activate: (s, n) => activateCards(g, s, n),
    activateToHand: (s, n) => activateToHand(g, s, n),
    randomDamage: (s, n) => {
      const pool = g.players[s].field;
      if (!pool.length) return;
      const uid = pool[g.rng.int(pool.length)];
      damageUnit(g, uid, n, '万雷之主');
    },
    isDamaged: (uid) => (card(g, uid)?.damage || 0) > 0,
    isFragile: (uid) => { const d = rawOf(card(g, uid)); return !!d && (d.attack || 0) > (d.vitality || 0); },
    fieldCount: (s) => g.players[s].field.length,
    lifeCount: (s) => g.players[s].life.length,
    hasGreyEssence: (s) => g.players[s].essence.some((uid) => rawOf(card(g, uid)).color === '灰'),
    spendDream: (s, n) => {
      const p = g.players[s];
      if (p.spirit.dream < n) return false;
      p.spirit.dream -= n;
      g.log.push(`${p.name} 消耗 ${n} 个梦境指示物，剩余 ${p.spirit.dream}。`);
      return true;
    },
    hasOnField: (s, name) => g.players[s].field.some((uid) => rawOf(card(g, uid)).name === name),
  };
}

/**
 * SE01 事件钩子：只触发自己场上卡牌在 SE01_EFFECTS 里登记的对应时机。
 * 带每回合次数上限的卡（万雷之主 2 次、食魂者 2 次）在这里统一拦截。
 */
function fireHook(g, side, event, payload = {}) {
  if ((g.hookDepth || 0) > 3) return;
  g.hookDepth = (g.hookDepth || 0) + 1;
  try {
    for (const uid of [...g.players[side].field]) {
      const c = card(g, uid);
      if (!c || c.zone !== 'field') continue;
      const def = rawOf(c);
      const ops = SE01_EFFECTS[def?.name]?.[event];
      if (!ops || !ops.length) continue;
      const p = g.players[side];
      if (def.name === '万雷之主') {
        p.hookCounts.wanlei = p.hookCounts.wanlei || 0;
        if (p.hookCounts.wanlei >= 2) continue;
        p.hookCounts.wanlei++;
      }
      if (def.name === '食魂者') {
        p.hookCounts.soul = p.hookCounts.soul || 0;
        if (p.hookCounts.soul >= 2) continue;
        p.hookCounts.soul++;
      }
      resolveEffect(def.name, { side, sourceUid: uid, targets: payload.targets || [], mode: 'main', event }, effectApi(g, { side }));
    }
  } finally {
    g.hookDepth--;
  }
}

function resolveSpecialTrigger(g, item) {
  const side = item.controller;
  g.players[side].stats.triggersTotal++;
  g.players[side].stats.triggersThisTurn++;
  if (item.event === 'lifeCrit') {
    const ev = g.lifeDamage;
    if (ev && !ev.critAdded) { ev.critAdded = true; ev.remaining++; g.log.push('暴击生命触发：本伤害事件追加 1 点（已达每段上限）。'); }
    else g.log.push('本伤害事件已追加过暴击，不重复增加。');
    return;
  }
  if (item.event === 'echoBuff') {
    const c = card(g, item.sourceUid); if (c?.zone === 'field') { c.mods.push({ atk: 500, imp: 0, hp: 500, until: 'permanent' }); g.log.push('幻梦战将的回响：自身 +500 攻击力、+500 生命力。'); } return;
  }
  if (item.event === 'echoDream') {
    if (card(g, item.sourceUid)?.zone === 'field') effectApi(g, { side }).dream(side, 1); return;
  }
  resolveEffect(item.name, { side, sourceUid: item.sourceUid, targets: item.targets, mode: item.mode, event: item.event }, effectApi(g, { side }));
  fireHook(g, side, 'triggerFired');
}

function resolveTop(g) {
  const item = g.chain.pop(); if (!item) return false;
  g.log.push(`连锁 ${g.chain.length + 1} 结算：【${item.name}】。`);
  const source = card(g, item.sourceUid);
  if (item.kind === 'card') {
    if (item.countered) {
      if (source) moveCard(g, source.uid, 'grave', item.controller, { silent: true });
    } else if (item.effectiveType === '灵像' || item.effectiveType === '灵性') {
      if (source) { source.pendingMode = item.mode; moveCard(g, source.uid, 'field', item.controller, { silent: true }); g.log.push(`【${item.originalName}】进入战场。`); }
    } else {
      resolveEffect(item.name, { side: item.controller, sourceUid: item.sourceUid, targets: item.targets, mode: item.mode, event: 'main' }, effectApi(g, { side: item.controller }));
      if (source?.zone === 'chain') moveCard(g, source.uid, 'grave', item.controller, { silent: true });
    }
  } else if (item.kind === 'lifeCrit' || item.kind === 'trigger') resolveSpecialTrigger(g, item);
  else resolveSpecialTrigger(g, item);
  g.priority = g.active; g.passCount = 0;
  stateCheck(g);
  return true;
}

function scry(g, side, x, y) {
  const p = g.players[side];
  const look = p.deck.slice(-x).reverse();
  const picked = [...look].sort((a, b) => rawOf(card(g, b)).cost.total - rawOf(card(g, a)).cost.total).slice(0, Math.min(y, look.length));
  for (const uid of picked) moveCard(g, uid, 'hand', side, { silent: true });
  g.log.push(`${p.name} 预知 ${look.length}/${picked.length}：选择 ${picked.length} 张加入手牌，其余保持原顺序置于顶部。`);
}

function startTurn(g) {
  let next = g.active;
  if (g.turn > 0) next = OPP(next);
  if (g.players[next].skipTurns > 0) {
    g.players[next].skipTurns--;
    g.log.push(`跳过 ${g.players[next].name} 的回合。`);
    next = OPP(next);
  }
  g.active = next; g.turn++;
  const p = g.players[next]; p.turnCount++;
  g.needsStart = false; g.phase = 'main1'; g.priority = next; g.passCount = 0; g.combat = null;
  for (const pl of g.players) pl.mana = Object.fromEntries(Object.keys(pl.mana).map((k) => [k, 0]));
  p.stats.triggersThisTurn = 0;
  p.hookCounts = {};
  p.firstDrawUsed = false;
  p.firstInspUsed = false;
  for (const uid of [...p.field, ...p.essence]) {
    const c = card(g, uid);
    c.blockCount = 0;
    if (c.lockUntap) { c.lockUntap = false; g.log.push(`【${rawOf(c).name}】受根须缠绕，跳过本次重置。`); continue; }
    c.tapped = false;
  }
  p.spirit.tapped = false;
  if (!(next === g.first && p.turnCount === 1)) drawCard(g, next);
  else g.log.push(`${p.name} 是先手，第一回合跳过通常抽牌。`);
  g.log.push(`—— 第 ${g.turn} 回合：${p.name} 主要阶段一 ——`);
}

function nextPhaseAfterPass(g) {
  const p = g.players[g.active];
  for (const pl of g.players) pl.mana = Object.fromEntries(Object.keys(pl.mana).map((k) => [k, 0]));
  g.passCount = 0; g.priority = g.active;
  if (g.combat) {
    const stage = g.combat.stage;
    if (stage === 'combat_start') { g.combat.stage = 'attackers'; g.log.push('进入宣告攻击者步骤。'); return; }
    if (stage === 'support') { g.combat.stage = 'blockers'; g.priority = OPP(g.active); g.log.push('进入宣告阻挡者步骤。'); return; }
    if (stage === 'response') { g.combat.stage = 'damage'; g.log.push('双方让过，进入战斗伤害步骤。'); return; }
  }
  if (g.phase === 'main1') {
    g.phase = 'combat'; g.combat = { stage: 'combat_start', attackerUid: null, blockers: [] }; g.log.push('进入战斗阶段。');
  } else if (g.phase === 'combat' && g.combat?.stage === 'attackers') {
    g.phase = 'main2'; g.combat = null; g.log.push('战斗阶段结束，进入主要阶段二。');
  } else if (g.phase === 'main2') {
    g.phase = 'end';
    for (const pl of g.players) for (const uid of [...pl.field]) {
      const c = card(g, uid);
      if (c.doomed) destroy(g, uid, '回合结束效果');
      if (keywords(g, uid).includes('自愈') && c.damage) { c.damage = 0; g.log.push(`【${rawOf(c).name}】自愈，回复全部伤害。`); }
    }
    g.log.push('进入结束步骤。');
    fireHook(g, g.active, 'end');
  } else if (g.phase === 'end') {
    for (const pl of g.players) {
      while (pl.hand.length > 7) {
        const uid = [...pl.hand].sort((a, b) => rawOf(card(g, a)).cost.total - rawOf(card(g, b)).cost.total)[0];
        moveCard(g, uid, 'grave', pl.idx);
        g.log.push(`${pl.name} 结束弃牌至 7 张。`);
      }
      for (const uid of pl.field) { const c = card(g, uid); c.mods = c.mods.filter((m) => m.until !== 'end'); }
    }
    g.phase = 'start'; g.needsStart = true;
  }
}

function declareAttack(g, side, move) {
  const p = g.players[side], c = card(g, move.uid);
  if (!c || c.zone !== 'field' || c.tapped) return false;
  c.tapped = true;
  g.combat = { stage: 'support', attacker: side, attackerUid: move.uid, target: move.target, blockers: [], supportAtk: 0, supportImp: 0, spiritSupported: false };
  g.priority = side; g.passCount = 0;
  const targetName = move.target === 'spirit' ? '灵体' : `【${rawOf(card(g, move.target)).name}】`;
  g.log.push(`${p.name} 以【${rawOf(c).name}】攻击对方${targetName}。`);
  fireHook(g, side, 'attackDeclared', { targets: [move.uid] });
  return true;
}

function supportSpirit(g, side) {
  const p = g.players[side], cb = g.combat;
  if (!cb || cb.stage !== 'support' || cb.spiritSupported || p.spirit.crit < 1) return false;
  p.spirit.crit--; cb.spiritSupported = true; cb.supportAtk += 1000; cb.supportImp += 1;
  g.log.push(`${p.name} 移除 1 个暴击指示物支援：无需横置，本次 +1000 攻击力、+1 冲击力。`);
  return true;
}

function toggleBlock(g, side, uid) {
  const cb = g.combat, c = card(g, uid);
  if (!cb || cb.stage !== 'blockers' || cb.attacker === side || !c || c.zone !== 'field') return false;
  const i = cb.blockers.indexOf(uid);
  if (i >= 0) {
    cb.blockers.splice(i, 1);
    // 取消宣告＝这次阻挡未成立，把本回合的阻挡次数退回。
    c.blockCount = Math.max(0, (c.blockCount || 0) - 1);
    g.log.push(`【${rawOf(c).name}】取消阻挡。`); return true;
  }
  if ((c.blockCount || 0) >= 1 && !keywords(g, uid).includes('守护')) {
    g.log.push(`【${rawOf(c).name}】本回合已阻挡过，不能再次阻挡。`); return false;
  }
  c.blockCount = (c.blockCount || 0) + 1;
  cb.blockers.push(uid); g.log.push(`【${rawOf(c).name}】宣告阻挡。`); return true;
}

function permutations(a) {
  if (a.length <= 1) return [a];
  const out = [];
  for (let i = 0; i < a.length; i++) for (const rest of permutations([...a.slice(0, i), ...a.slice(i + 1)])) out.push([a[i], ...rest]);
  return out;
}

function resolveCombat(g) {
  const cb = g.combat; if (!cb) return false;
  const aSide = cb.attacker, dSide = OPP(aSide);
  const attacker = card(g, cb.attackerUid);
  if (!attacker || attacker.zone !== 'field') { g.combat = { stage: 'attackers', attackerUid: null, blockers: [] }; g.log.push('攻击者已离场，本次攻击结束。'); return true; }
  const aUid = attacker.uid;
  cb.blockers = cb.blockers.filter((uid) => onField(g, uid));
  if (!cb.blockers.length) {
    if (cb.target === 'spirit') {
      const imp = unitImp(g, aUid, cb);
      g.log.push(`攻击未被阻挡，以 ${imp} 点冲击力造成伤害。`);
      g.combat = { stage: 'attackers', attackerUid: null, blockers: [] };
      dealLifeDamage(g, dSide, imp, rawOf(attacker).name, 'combat');
      return true;
    }
    const target = card(g, cb.target);
    if (!target || target.zone !== 'field') { g.combat = { stage: 'attackers', attackerUid: null, blockers: [] }; g.log.push('目标灵像已离场且无人阻挡，本次攻击不造成伤害。'); return true; }
    strikeUnblockedUnit(g, cb, aUid, target.uid);
  } else strikeBlocked(g, cb);
  if (!g.over) {
    const a = card(g, aUid);
    // 词条「毁灭」：战斗结算后，破坏所有仍存在于战场上的本次阻挡者／被阻挡的攻击者。
    // 「碾压」可以防止此破坏（「践踏」不行）。已离场者不在破坏范围内。
    if (a?.zone === 'field' && keywords(g, aUid).includes('毁灭')) for (const uid of cb.blockers) if (onField(g, uid) && !keywords(g, uid).includes('碾压')) destroy(g, uid, '毁灭');
    for (const uid of cb.blockers) if (onField(g, uid) && keywords(g, uid).includes('毁灭') && a?.zone === 'field' && !keywords(g, aUid).includes('碾压')) destroy(g, aUid, '毁灭');
    if (a?.zone === 'field' && keywords(g, aUid).includes('超冲击') && cb.blockers.length) {
      const allLethal = cb.blockers.every((uid) => !onField(g, uid) || card(g, uid).damage >= unitHp(g, uid));
      if (allLethal) dealLifeDamage(g, dSide, unitImp(g, aUid, cb), `${rawOf(a).name}·超冲击`, 'combat');
      else g.log.push('仍有阻挡者未受致命伤害，不能发动超冲击。');
    }
  }
  g.combat = { stage: 'attackers', attackerUid: null, blockers: [] };
  g.priority = g.active; g.passCount = 0;
  stateCheck(g);
  return true;
}

function strikeUnblockedUnit(g, cb, aUid, tUid) {
  const aFirst = keywords(g, aUid).includes('先攻'), tFirst = keywords(g, tUid).includes('先攻');
  const aDmg = unitAtk(g, aUid, cb), tDmg = unitAtk(g, tUid, null);
  if (aFirst && !tFirst) {
    damageUnit(g, tUid, aDmg, '先攻战斗'); stateCheck(g);
    if (onField(g, tUid)) damageUnit(g, aUid, tDmg, '反击');
  } else if (tFirst && !aFirst) {
    damageUnit(g, aUid, tDmg, '先攻反击'); stateCheck(g);
    if (onField(g, aUid)) damageUnit(g, tUid, aDmg, '战斗');
  } else { damageUnit(g, tUid, aDmg, '战斗'); damageUnit(g, aUid, tDmg, '反击'); }
  stateCheck(g);
}

function strikeBlocked(g, cb) {
  const aUid = cb.attackerUid, blockers = [...cb.blockers];
  const aFirst = keywords(g, aUid).includes('先攻');
  const atkPower = unitAtk(g, aUid, cb);
  const trample = keywords(g, aUid).includes('践踏');
  let remaining = atkPower;
  const allocations = [];
  // 单阻挡且无践踏：按「阻挡者与被阻挡者进行一次正常交战」结算，
  // 攻击者以全部攻击力打击阻挡者（溢出浪费），而不是截断为「恰好致命」。
  // 多阻挡沿用 7.2 的分配制；有践踏时沿用「致命后剩余」的分配制。
  if (blockers.length === 1 && !trample) {
    allocations.push([blockers[0], atkPower]);
    remaining = 0;
  } else {
    for (const uid of blockers) {
      const lethal = Math.max(0, unitHp(g, uid) - card(g, uid).damage);
      const assigned = Math.min(lethal, remaining);
      allocations.push([uid, assigned]); remaining -= assigned;
    }
  }
  if (remaining > 0 && keywords(g, aUid).includes('践踏')) {
    const defender = g.players[OPP(cb.attacker)];
    // 践踏只能「分配给对手场上其他灵像」，不能落到灵性卡上。
    const others = defender.field.filter((uid) => !blockers.includes(uid) && rawOf(card(g, uid)).type === '灵像');
    if (others.length) {
      const target = others.sort((a, b) => (unitHp(g, a) - card(g, a).damage) - (unitHp(g, b) - card(g, b).damage))[0];
      allocations.push([target, remaining]); remaining = 0;
      g.log.push(`践踏将剩余攻击力分配给【${rawOf(card(g, target)).name}】，不直接伤害灵体。`);
    }
  }
  // 先攻只属于带「先攻」的单位本身，不会传染给同队的其他阻挡者。
  // 战斗中按两个伤害窗口结算：窗口一＝带先攻者造成伤害，窗口二＝其余单位造成伤害。
  // 同一窗口内的伤害同时施加（先快照来源，再一起结算），不因先后顺序改变结果。
  const firstBlockers = blockers.filter((uid) => keywords(g, uid).includes('先攻'));
  const normalBlockers = blockers.filter((uid) => !keywords(g, uid).includes('先攻'));
  const strikeWindow = (attackerActs, counterSubset) => {
    const counters = counterSubset.filter((uid) => onField(g, uid)).map((uid) => [uid, unitAtk(g, uid, null)]);
    if (attackerActs && onField(g, aUid)) for (const [uid, n] of allocations) if (onField(g, uid)) damageUnit(g, uid, n, '阻挡战斗');
    for (const [uid, n] of counters) damageUnit(g, aUid, n, '阻挡者反击');
  };
  if (aFirst) { strikeWindow(true, firstBlockers); stateCheck(g); strikeWindow(false, normalBlockers); }
  else { strikeWindow(false, firstBlockers); stateCheck(g); strikeWindow(true, normalBlockers); }
  stateCheck(g);
}

export function legalMoves(g) {
  if (g.over) return [];
  if (g.inspect) {
    const p = g.players[g.inspect.side], out = [{ type: 'inspectTake' }];
    if (manaPlan(g, p.idx, { [p.color]: 1 }, 0, false)) out.push({ type: 'inspectReveal' });
    return out;
  }
  if (g.lifeDamage && (g.lifeDamage.current || g.lifeDamage.remaining > 0) && !g.chain.length) return [];
  const side = g.priority, p = g.players[side], cb = g.combat;
  if (cb?.stage === 'blockers') {
    if (cb.attacker === side) return [{ type: 'pass' }];
    const attacker = card(g, cb.attackerUid);
    const agile = attacker && keywords(g, attacker.uid).includes('敏捷');
    const out = [];
    for (const uid of p.field) {
      const c = card(g, uid);
      if (cb.blockers.includes(uid)) { out.push({ type: 'block', uid }); continue; }
      if (rawOf(c).type !== '灵像') continue;
      if (c.tapped && !keywords(g, uid).includes('守护')) continue;
      // 规则 7.1-4：每只灵像每回合只能阻挡一次；「守护」不受此限。
      if ((c.blockCount || 0) >= 1 && !keywords(g, uid).includes('守护')) continue;
      if (agile && !keywords(g, uid).includes('敏捷') && !(c.tapped && keywords(g, uid).includes('守护'))) continue;
      out.push({ type: 'block', uid });
    }
    out.push({ type: 'pass' }); return out;
  }
  if (cb?.stage === 'order') return permutations(cb.blockers).map((order) => ({ type: 'orderBlockers', order }));
  if (cb?.stage === 'attackers') {
    if (side !== g.active) return [{ type: 'pass' }];
    const out = [];
    for (const uid of p.field) {
      const c = card(g, uid);
      if (rawOf(c).type !== '灵像') continue;
      if (c.tapped || (c.enteredTurn === g.turn && !keywords(g, uid).includes('预制'))) continue;
      out.push({ type: 'attack', uid, target: 'spirit' });
      for (const target of g.players[OPP(side)].field) {
        // 规则 7.1-2：攻击目标只能是「对方灵体或 1 只合法灵像」，灵性卡不是合法目标。
        if (rawOf(card(g, target)).type !== '灵像') continue;
        if (!keywords(g, target).includes('威慑')) out.push({ type: 'attack', uid, target });
      }
    }
    out.push({ type: 'pass' }); return out;
  }
  if (cb?.stage === 'support') {
    const out = [];
    if (side === g.active && p.spirit.crit > 0 && !cb.spiritSupported) out.push({ type: 'supportSpirit' });
    out.push({ type: 'pass' }); return out;
  }
  if (g.phase === 'start' || g.phase === 'setup' || cb?.stage === 'damage') return [{ type: 'pass' }];

  const out = [];
  const main = side === g.active && (g.phase === 'main1' || g.phase === 'main2') && !g.chain.length;
  for (const uid of p.hand) {
    const d = rawOf(card(g, uid)), name = d.name;
    if (name === '次元超越' && p.usedDimension >= 1) continue;
    const modes = availableModes(g, side, name, burst(g, side));
    for (let mode of modes) {
      const effectiveType = name === '梦境采集者' && mode.startsWith('extract') ? '灵感' : d.type;
      if (effectiveType !== '灵感' && !main) continue;
      if (name === '梦境采集者' && mode === 'normal') mode = 'main';
      if (name === '梦境采集' && mode === 'sacrifice' && !p.field.some(isDream)) continue;
      if (name === '灵质榨取' && mode === 'bury' && p.hand.length < 2) continue;
      if (!canPay(g, side, name, mode)) continue;
      for (const targets of enumerateTargets(g, side, name, mode, 'main')) out.push({ type: 'play', uid, mode, targets });
    }
  }
  if (main && p.essenceSetTurn !== g.turn) for (const uid of p.hand) out.push({ type: 'setEssence', uid });
  out.push(...activationMoves(g, side));
  if (!p.spirit.tapped && p.turnCount > 1 && (p.deck.length || p.life.length)) out.push({ type: 'spiritDraw' });
  for (const uid of p.essence) if (!card(g, uid).tapped) out.push({ type: 'tapEssence', uid });
  out.push({ type: 'pass' });
  return out;
}

function sameMove(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pass(g, side) {
  if (g.combat?.stage === 'blockers') {
    const cb = g.combat;
    if (!cb.blockers.length) { cb.stage = 'response'; g.priority = g.active; g.passCount = 0; g.log.push('无人阻挡，进入响应步骤。'); }
    else { cb.stage = 'order'; g.priority = g.active; g.passCount = 0; g.log.push('阻挡宣告完成，攻击方排列伤害分配顺序。'); }
    return true;
  }
  if (g.combat?.stage === 'order') {
    g.combat.stage = 'response'; g.priority = g.active; g.passCount = 0; return true;
  }
  g.passCount++;
  if (g.passCount < 2) { g.priority = OPP(side); return true; }
  g.passCount = 0;
  if (g.chain.length) return resolveTop(g);
  nextPhaseAfterPass(g);
  return true;
}

export function applyMove(g, move) {
  const legal = legalMoves(g);
  if (!legal.some((m) => sameMove(m, move))) throw new Error(`非法动作：${JSON.stringify(move)}；当前阶段 ${g.phase}/${g.combat?.stage || '—'}，优先权 ${g.priority}`);
  g.actions++;
  const side = g.inspect ? g.inspect.side : g.priority;
  if (move.type !== 'pass') g.passCount = 0;
  if (move.type === 'pass') return pass(g, side);
  if (move.type === 'inspectTake' || move.type === 'inspectReveal') return resolveInspect(g, move);
  if (move.type === 'play') return playCard(g, side, move);
  if (move.type === 'setEssence') return setEssence(g, side, move.uid);
  if (move.type === 'tapEssence') return tapEssence(g, side, move.uid);
  if (move.type === 'ability' || move.type === 'spiritSpecial') return activate(g, side, move);
  if (move.type === 'spiritDraw') return spiritDraw(g, side);
  if (move.type === 'attack') return declareAttack(g, side, move);
  if (move.type === 'supportSpirit') return supportSpirit(g, side);
  if (move.type === 'block') return toggleBlock(g, side, move.uid);
  if (move.type === 'orderBlockers') { g.combat.blockers = [...move.order]; g.combat.stage = 'response'; g.priority = g.active; g.passCount = 0; return true; }
  throw new Error(`未知动作 ${move.type}`);
}

export function progressAutomatic(g) {
  if (g.over) return false;
  if (stateCheck(g)) return true;
  if (flushTriggers(g)) return true;
  if (g.lifeDamage) return processLifeDamage(g);
  if (g.needsStart) { startTurn(g); return true; }
  if (g.combat?.stage === 'damage') return resolveCombat(g);
  if (g.combat?.stage === 'order' && g.combat.blockers.length <= 1) {
    g.combat.stage = 'response'; g.priority = g.active; g.passCount = 0; g.log.push('进入攻击响应步骤。'); return true;
  }
  return false;
}

function publicCard(g, uid, full = true) {
  const c = card(g, uid), d = rawOf(c);
  if (!c || !d) return null;
  return {
    uid, id: d.id, name: d.name, type: c.useAs || d.type, color: d.color, cost: d.cost,
    attack: d.attack, impact: d.impact, vitality: d.vitality, keywords: d.keywords,
    text: d.text, trigger: d.trigger, token: !!c.token, zone: c.zone, damage: c.damage,
    tapped: c.tapped, status: implementationStatus(d.name),
    atk: c.zone === 'field' ? unitAtk(g, uid) : d.attack,
    imp: c.zone === 'field' ? unitImp(g, uid) : d.impact,
    hp: c.zone === 'field' ? unitHp(g, uid) : d.vitality,
    doomed: c.doomed, substitute: !!c.substituteUid,
  };
}

export function makeView(g, side) {
  const me = g.players[side], opp = g.players[OPP(side)];
  const publicPlayer = (p, own) => ({
    idx: p.idx, name: p.name, color: p.color, spiritName: p.spiritName, spirit: clone(p.spirit),
    life: p.life.length, deck: p.deck.length, handCount: p.hand.length,
    hand: own ? p.hand.map((uid) => publicCard(g, uid)) : undefined,
    essence: p.essence.map((uid) => publicCard(g, uid)), field: p.field.map((uid) => publicCard(g, uid)),
    grave: p.grave.map((uid) => publicCard(g, uid)), exileCount: p.exile.length,
    armor: p.armor.map((uid) => publicCard(g, uid)), mana: clone(p.mana), stats: clone(p.stats),
    usedDimension: p.usedDimension, turnCount: p.turnCount,
  });
  return {
    seed: g.seed, turn: g.turn, active: g.active, priority: g.priority, phase: g.phase,
    mode: g.mode, modeSpec: { name: g.modeSpec?.name, life: g.modeSpec?.life, handStart: g.modeSpec?.handStart },
    me: publicPlayer(me, true), opp: publicPlayer(opp, false),
    chain: g.chain.map((x) => ({ key: x.key, name: x.name, controller: x.controller, countered: x.countered, event: x.event })),
    combat: g.combat ? { stage: g.combat.stage, attackerUid: g.combat.attackerUid, target: g.combat.target, blockers: [...g.combat.blockers] } : null,
    inspect: g.inspect?.side === side ? { uid: g.inspect.uid, card: publicCard(g, g.inspect.uid) } : g.inspect ? { hidden: true } : null,
    over: g.over, winner: g.winner,
  };
}

export function snapshot(g) {
  const view0 = makeView(g, 0), view1 = makeView(g, 1);
  return {
    seed: g.seed, turn: g.turn, active: g.active, priority: g.priority, phase: g.phase,
    passCount: g.passCount, over: g.over, winner: g.winner, reason: g.reason,
    P: [view0.me, { ...view1.me, hand: g.players[1].hand.map((uid) => publicCard(g, uid)) }],
    chain: g.chain.map((x) => ({ ...x, card: publicCard(g, x.sourceUid) })),
    combat: g.combat ? clone(g.combat) : null,
    lifeDamage: g.lifeDamage ? { side: g.lifeDamage.side, remaining: g.lifeDamage.remaining, critAdded: g.lifeDamage.critAdded, current: publicCard(g, g.lifeDamage.current), source: g.lifeDamage.source } : null,
    inspect: g.inspect ? { side: g.inspect.side, card: publicCard(g, g.inspect.uid) } : null,
    triggers: g.triggers.length,
    approximations: [...g.approximations],
  };
}

export function playMatch(opts = {}) {
  const g = createGame(opts), steps = [], record = opts.record !== false;
  const maxActions = opts.maxActions || 7000;
  const push = (before) => {
    if (!record) return;
    const text = g.log.slice(before).join('\n') || '状态推进';
    steps.push({ index: steps.length, action: g.actions, text, snap: snapshot(g) });
  };
  push(0);
  let idle = 0;
  while (!g.over && g.actions < maxActions && idle < 100) {
    const before = g.log.length, oldActions = g.actions;
    if (progressAutomatic(g)) { push(before); idle = g.log.length > before ? 0 : idle + 1; continue; }
    const moves = legalMoves(g);
    if (!moves.length) { idle++; if (idle >= 100) break; continue; }
    const side = g.inspect ? g.inspect.side : g.priority;
    const script = g.players[side].script;
    let chosen;
    try { chosen = script?.choose ? script.choose(makeView(g, side), clone(moves)) : moves[moves.length - 1]; }
    catch (error) { g.log.push(`脚本异常：${error.message}，改为让过。`); chosen = { type: 'pass' }; }
    if (!moves.some((m) => sameMove(m, chosen))) {
      g.log.push(`脚本返回非法动作，已回退：${JSON.stringify(chosen)}`);
      chosen = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
    }
    applyMove(g, chosen);
    if (g.actions === oldActions) idle++; else idle = 0;
    push(before);
  }
  if (!g.over) { g.over = true; g.winner = null; g.reason = `达到安全上限（${g.actions} 动作）判和`; g.log.push(g.reason); }
  if (record) {
    const text = g.log[g.log.length - 1];
    if (steps.length) steps[steps.length - 1].end = true;
    else steps.push({ index: 0, text, snap: snapshot(g), end: true });
  }
  return { steps, winner: g.winner, reason: g.reason, log: g.log, game: g, actions: g.actions };
}

export const ENGINE_INFO = {
  name: 'Soul Echo 第二版无头规则引擎', cardCount: CARD_DATA.length,
  implemented: CARD_DATA.filter((c) => implementationStatus(c.name) === 'implemented').length,
  approx: CARD_DATA.filter((c) => implementationStatus(c.name) === 'approx').map((c) => c.name),
  approximations: APPROXIMATIONS,
};

/** 测试专用受控夹具；正式对局仍只能经 legalMoves/applyMove 改状态。 */
export const _testing = {
  put(g, side, name, zone = 'field', extra = {}) {
    const d = BY_NAME.get(name); if (!d) throw new Error(name);
    const uid = `x${g.nextUid++}`;
    g.cards[uid] = { uid, id: d.id, owner: side, controller: side, zone: 'outside', damage: 0, tapped: false, enteredTurn: -1, mods: [], ...extra };
    moveCard(g, uid, zone, side, { silent: true });
    Object.assign(g.cards[uid], extra);
    return uid;
  },
  token: (g, side) => { const before = g.nextUid; createToken(g, side, 1); return `t${before}`; },
  moveCard, drawCard, dealLifeDamage, stateCheck, progressAutomatic, resolveTop, resolveCombat,
  damageUnit, destroy, payCost, canPay, burst, flushTriggers, startTurn,
  setPhase(g, phase, priority = g.active) { g.phase = phase; g.priority = priority; g.needsStart = false; g.combat = null; g.passCount = 0; },
  setCombat(g, combat) { g.phase = 'combat'; g.combat = combat; g.needsStart = false; },
  clearTriggers(g) { g.triggers = []; g.chain = []; },
};
