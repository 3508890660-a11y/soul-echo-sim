import assert from 'node:assert/strict';
import {
  createGame, legalMoves, applyMove, playMatch, validateDeck, _testing as T,
  unitHp, dealLifeDamage, ENGINE_INFO,
} from '../js/engine/rules.js';
import { PRECONS } from '../js/engine/precons.js';
import { TACTICIAN } from '../js/ai/builtin.js';
import { CARD_DATA, BY_NAME } from '../js/engine/cards.js';

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
  try { fn(); passed++; results.push({ name, ok: true }); console.log(`✓ ${name}`); }
  catch (error) { failed++; results.push({ name, ok: false, error: error.stack }); console.error(`✗ ${name}\n  ${error.message}`); }
}
function game(seed = 7) {
  const g = createGame({ seed, mulligan: false });
  T.setPhase(g, 'main1', 0);
  g.players[0].turnCount = 2; g.players[1].turnCount = 2; g.turn = 4;
  return g;
}
function settle(g, limit = 500) {
  for (let i = 0; i < limit && !g.over; i++) {
    if (T.progressAutomatic(g)) continue;
    if (!g.chain.length && !g.triggers.length && !g.lifeDamage) return;
    const moves = legalMoves(g);
    if (!moves.length) return;
    const pass = moves.find((m) => m.type === 'pass');
    if (!pass) return;
    applyMove(g, pass);
  }
  if (!g.over && (g.chain.length || g.lifeDamage)) throw new Error('结算未能收敛');
}
function fillLife(g, side, name = '新人冒险者', n = 10) {
  const p = g.players[side];
  for (const uid of [...p.life]) T.moveCard(g, uid, 'deck', side, { silent: true });
  for (let i = 0; i < n; i++) T.put(g, side, name, 'life');
}
function essence(g, side, name, n = 1) { return Array.from({ length: n }, () => T.put(g, side, name, 'essence')); }
function play(g, side, uid, mode = 'main', targets = []) {
  g.priority = side;
  const m = legalMoves(g).find((x) => x.type === 'play' && x.uid === uid && x.mode === mode && JSON.stringify(x.targets) === JSON.stringify(targets));
  assert.ok(m, `应能使用 ${uid}，模式 ${mode}`);
  applyMove(g, m);
  return m;
}

test('构筑：140 名目主卡池、40—60 张与同名 4 张限制', () => {
  assert.equal(CARD_DATA.length, 140);
  assert.equal(ENGINE_INFO.implemented + ENGINE_INFO.approx.length, 140);
  assert.throws(() => createGame({ deckA: Array(39).fill('新人冒险者'), deckB: Array(40).fill('新人冒险者') }), /40—60|同名/);
});

test('构筑：与灵体同色的卡牌须至少 60%，灰灵体才把灰卡计为同色', () => {
  const red6 = ['火焰鸟', '地狱犬', '烈焰斗士', '烈焰之力', '烈焰聚合体', '火球术'];
  const gray4 = ['新人冒险者', '冒险准备', '黑市商人', '混沌打击'];
  const deck24 = [...red6.flatMap((n) => Array(4).fill(n)), ...gray4.flatMap((n) => Array(4).fill(n))];
  assert.equal(deck24.length, 40);
  // 24/40 恰好 60%，是合法下界
  const edge = validateDeck(deck24, 'standard', { spirit: '余烬执火者' });
  assert.ok(edge.ok, edge.errors.join('；'));
  assert.equal(edge.sameColor, 24);
  assert.equal(edge.sameColorNeed, 24);
  // 少一张红多一张灰 → 23/40 = 57.5%，不合法
  const deck23 = [...deck24.slice(1), '混沌冲击'];
  const bad = validateDeck(deck23, 'standard', { spirit: '余烬执火者' });
  assert.equal(bad.ok, false);
  assert.equal(bad.sameColor, 23);
  assert.match(bad.errors.join('；'), /同色（红）/);
  // 同一套牌换成灰灵体：灰卡全部计入同色
  const graySpirit = validateDeck(deck23, 'standard', { spirit: '荒原旅人' });
  assert.equal(graySpirit.sameColor, 17);
  assert.equal(graySpirit.ok, false);
  // 未提供灵体时不校验，保持旧调用兼容
  assert.ok(validateDeck(deck23).ok);
  // 引擎在开局前拦截：灰卡组配红灵体
  assert.throws(() => createGame({ deckA: deck23, deckB: PRECONS['红色快攻'], spiritA: '余烬执火者' }), /同色（红）/);
});

test('先手第一回合不通常抽牌，双方第一回合禁止灵体抽牌', () => {
  const g = createGame({ seed: 11, mulligan: false });
  const before = g.players[0].hand.length;
  T.progressAutomatic(g);
  assert.equal(g.players[0].hand.length, before);
  assert.equal(g.players[0].turnCount, 1);
  assert.ok(!legalMoves(g).some((m) => m.type === 'spiritDraw'));
});

test('灰色灵能不能支付同色费，任意颜色可支付灰费', () => {
  const g = game();
  essence(g, 0, '新人冒险者', 2);
  essence(g, 0, '火焰鸟', 1);
  assert.equal(T.canPay(g, 0, '烈焰斗士'), false);
  essence(g, 0, '火焰鸟', 1);
  assert.equal(T.canPay(g, 0, '烈焰斗士'), true);
  assert.equal(T.payCost(g, 0, '烈焰斗士'), true);
});

test('生命卡组为空本身不败，仍有伤害才败', () => {
  const g = game(); g.players[1].life = [];
  T.stateCheck(g); assert.equal(g.over, false);
  dealLifeDamage(g, 1, 1, '测试');
  T.progressAutomatic(g);
  assert.equal(g.over, true); assert.equal(g.winner, 0);
});

test('主卡组空时从生命抽牌，不揭示且不触发 LT', () => {
  const g = game(), p = g.players[0];
  for (const uid of [...p.deck]) T.moveCard(g, uid, 'grave', 0, { silent: true });
  for (const uid of [...p.life]) T.moveCard(g, uid, 'deck', 0, { silent: true });
  p.deck = [];
  const uid = T.put(g, 0, '预言学徒', 'life');
  const hand = p.hand.length;
  T.drawCard(g, 0);
  assert.equal(p.hand.length, hand + 1);
  assert.equal(g.cards[uid].zone, 'hand');
  assert.equal(g.triggers.length, 0);
});

test('每段生命伤害最多由 CT 追加 1 点', () => {
  const g = game(); fillLife(g, 1, '地狱犬', 4);
  dealLifeDamage(g, 1, 1, '测试');
  settle(g);
  assert.equal(g.players[1].stats.lifeReveals, 2);
  assert.equal(g.players[1].life.length, 2);
});

test('CT 能力面放置指示物，支援无需横置并追加数值', () => {
  const g = game(); g.players[0].spirit.crit = 1;
  const a = T.put(g, 0, '烈焰斗士', 'field');
  T.setCombat(g, { stage: 'support', attacker: 0, attackerUid: a, target: 'spirit', blockers: [], supportAtk: 0, supportImp: 0, spiritSupported: false });
  g.priority = 0;
  const m = legalMoves(g).find((x) => x.type === 'supportSpirit');
  assert.ok(m); applyMove(g, m);
  assert.equal(g.players[0].spirit.crit, 0);
  assert.equal(g.players[0].spirit.tapped, false);
  assert.equal(g.combat.supportAtk, 1000); assert.equal(g.combat.supportImp, 1);
});

test('多阻挡按顺序分配致命伤害，攻击者承受合计反击', () => {
  const g = game();
  const a = T.put(g, 0, '山岭巨人', 'field');
  const b1 = T.put(g, 1, '新人冒险者', 'field');
  const b2 = T.put(g, 1, '荒原狼', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: 'spirit', blockers: [b1, b2], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.equal(g.cards[b1].zone, 'grave'); assert.equal(g.cards[b2].zone, 'grave');
  assert.equal(g.cards[a].damage, 4500);
});

test('已有伤害计入前一名阻挡者的致命分配', () => {
  const g = game();
  const a = T.put(g, 0, '山岭巨人', 'field');
  const b1 = T.put(g, 1, '荒原狼', 'field', { damage: 1000 });
  const b2 = T.put(g, 1, '新人冒险者', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: 'spirit', blockers: [b1, b2], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.equal(g.cards[b1].zone, 'grave'); assert.equal(g.cards[b2].zone, 'grave');
  assert.equal(g.cards[a].damage, 4500);
});

test('单方先攻破坏后不反击，双方先攻同时结算', () => {
  const g = game();
  const a = T.put(g, 0, '烈焰斗士', 'field'), b = T.put(g, 1, '荒原狼', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: b, blockers: [], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.equal(g.cards[b].zone, 'grave'); assert.equal(g.cards[a].damage, 0);
  const g2 = game(8);
  const x = T.put(g2, 0, '烈焰斗士', 'field'), y = T.put(g2, 1, '烈焰斗士', 'field');
  T.setCombat(g2, { stage: 'damage', attacker: 0, attackerUid: x, target: y, blockers: [], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g2);
  assert.equal(g2.cards[x].zone, 'grave'); assert.equal(g2.cards[y].zone, 'grave');
});

test('超冲击需至少一名阻挡者且全部受到致命伤害', () => {
  const g = game(); fillLife(g, 1, '新人冒险者', 10);
  const a = T.put(g, 0, '烈焰战将', 'field'), b = T.put(g, 1, '新人冒险者', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: 'spirit', blockers: [b], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g); settle(g);
  assert.equal(g.players[1].stats.lifeReveals, 2);
  assert.ok(g.log.some((x) => x.includes('超冲击')));
});

test('目标失效仅使相关部分失效，奥术飞弹仍抽牌', () => {
  const g = game(); essence(g, 0, '智慧之光', 2);
  const spell = T.put(g, 0, '奥术飞弹', 'hand'), target = T.put(g, 1, '新人冒险者', 'field');
  const before = g.players[0].hand.length;
  play(g, 0, spell, 'main', [target]);
  T.destroy(g, target, '测试移除');
  settle(g);
  assert.equal(g.players[0].hand.length, before);
  assert.equal(g.cards[spell].zone, 'grave');
});

test('反制不返还费用，被无效灵感仍进入分解区并计入迸发', () => {
  const g = game(); essence(g, 0, '烈焰斗士', 3); essence(g, 1, '智慧之光', 2);
  const burn = T.put(g, 0, '火球术', 'hand'), counter = T.put(g, 1, '法术反制', 'hand');
  play(g, 0, burn);
  applyMove(g, { type: 'pass' });
  const key = g.chain[0].key;
  play(g, 1, counter, 'main', [key]);
  settle(g);
  assert.equal(g.cards[burn].zone, 'grave'); assert.equal(g.cards[counter].zone, 'grave');
  assert.equal(g.players[0].stats.directDamage, 0);
  assert.equal(T.burst(g, 0), 1);
});

test('区域切换清除伤害与临时效果，衍生物不会进入手牌', () => {
  const g = game(); const u = T.put(g, 0, '新人冒险者', 'field', { damage: 500, mods: [{ atk: 2000, imp: 1, hp: 0, until: 'end' }] });
  T.moveCard(g, u, 'hand', 0);
  assert.equal(g.cards[u].damage, 0); assert.equal(g.cards[u].mods.length, 0);
  const token = T.token(g, 0); T.moveCard(g, token, 'hand', 0);
  assert.equal(g.cards[token].zone, 'removed');
  assert.ok(!g.players[0].hand.includes(token));
});

test('敏捷只能由敏捷或已横置守护阻挡', () => {
  const g = game(); const a = T.put(g, 0, '火焰鸟', 'field');
  T.put(g, 1, '新人冒险者', 'field');
  const agile = T.put(g, 1, '烈焰斗士', 'field');
  const guard = T.put(g, 1, '光能守护者', 'field', { tapped: true });
  T.setCombat(g, { stage: 'blockers', attacker: 0, attackerUid: a, target: 'spirit', blockers: [], supportAtk: 0, supportImp: 0 });
  g.priority = 1;
  const blocks = legalMoves(g).filter((m) => m.type === 'block').map((m) => m.uid);
  assert.deepEqual(new Set(blocks), new Set([agile, guard]));
});

test('攻击目标只能是灵像，灵性卡不在合法目标内', () => {
  const g = game();
  const a = T.put(g, 0, '烈焰斗士', 'field');
  const unit = T.put(g, 1, '新人冒险者', 'field');
  const relic = T.put(g, 1, '骸骨祭坛', 'field');
  T.setCombat(g, { stage: 'attackers', attackerUid: null, blockers: [] });
  g.active = 0; g.priority = 0;
  const targets = legalMoves(g).filter((m) => m.type === 'attack' && m.uid === a).map((m) => m.target);
  assert.ok(targets.includes('spirit'), '应可攻击灵体');
  assert.ok(targets.includes(unit), '应可攻击灵像');
  assert.ok(!targets.includes(relic), '灵性卡不是攻击目标');
});

test('践踏溢出只分配给灵像，不落到灵性卡', () => {
  const g = game();
  const a = T.put(g, 0, '焚城巨兵', 'field');
  const blocker = T.put(g, 1, '新人冒险者', 'field');
  const relic = T.put(g, 1, '骸骨祭坛', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: 'spirit', blockers: [blocker], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.equal(g.cards[blocker].zone, 'grave');
  assert.equal(g.cards[relic].zone, 'field');
  assert.equal(g.cards[relic].damage, 0);
});

test('单阻挡按正常交战结算，攻击者以全部攻击力打击阻挡者', () => {
  const g = game();
  const a = T.put(g, 0, '烈焰战将', 'field');
  const b = T.put(g, 1, '光能守护者', 'field');
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: a, target: 'spirit', blockers: [b], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.ok(g.log.some((x) => x.includes('【光能守护者】受到 6000 点伤害')),
    '应记录全部 6000 攻击力，而不是截断为 4000 致命值');
  assert.equal(g.cards[b].zone, 'grave');
});

test('一只灵像每回合只能阻挡一次，守护除外', () => {
  const g = game();
  const atk = T.put(g, 0, '烈焰战将', 'field');
  const plain = T.put(g, 1, '新人冒险者', 'field');
  const guard = T.put(g, 1, '光能守护者', 'field');
  const openBlockers = () => T.setCombat(g, { stage: 'blockers', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [], supportAtk: 0, supportImp: 0 });
  openBlockers(); g.priority = 1;
  assert.ok(legalMoves(g).some((m) => m.type === 'block' && m.uid === plain));
  applyMove(g, { type: 'block', uid: plain });
  assert.equal(g.cards[plain].blockCount, 1);
  openBlockers(); g.priority = 1;
  const moves = legalMoves(g);
  assert.ok(!moves.some((m) => m.type === 'block' && m.uid === plain), '普通灵像本回合已阻挡过');
  assert.ok(moves.some((m) => m.type === 'block' && m.uid === guard), '守护不受每回合一次限制');
});

test('先攻只属于带先攻的单位，不会传染给同队阻挡者', () => {
  const g = game();
  const atk = T.put(g, 0, '烈焰战将', 'field'); // 6000/6000，无先攻
  const first = T.put(g, 1, '烈焰斗士', 'field'); // 3500/2000，先攻
  const plain = T.put(g, 1, '守林圣骑士', 'field'); // 4000/5000，无先攻
  T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [first, plain], supportAtk: 0, supportImp: 0 });
  T.resolveCombat(g);
  assert.equal(g.cards[first].zone, 'grave', '先攻阻挡者应先造成伤害，再吃攻击者 2000');
  assert.equal(g.cards[plain].damage, 4000, '非先攻阻挡者在攻击者造成伤害后才反击');
  assert.equal(g.cards[atk].zone, 'grave', '两名阻挡者合计 7500 反击，攻击者应被破坏');
});

test('践踏不免疫毁灭，只有碾压免疫', () => {
  const g = game();
  const atk = T.put(g, 0, '焚城巨兵', 'field'); // 6500/7000，践踏，无碾压
  const def = T.put(g, 1, '雷云巨像', 'field'); // 6500/7000，双方都扛得住
  const defData = BY_NAME.get('雷云巨像');
  defData.keywords.push('毁灭');
  try {
    T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [def], supportAtk: 0, supportImp: 0 });
    T.resolveCombat(g);
    assert.equal(g.cards[def].zone, 'field', '阻挡者受 6500 后剩 500');
    assert.equal(g.cards[atk].zone, 'grave', '带践踏不带碾压的攻击者应被毁灭破坏');
  } finally { defData.keywords.pop(); }
});

test('碾压不会被毁灭破坏', () => {
  const g = game();
  const atk = T.put(g, 0, '焚城巨兵', 'field');
  const def = T.put(g, 1, '王牌巨象', 'field');
  const defData = BY_NAME.get('焚城巨兵');
  defData.keywords.push('毁灭');
  try {
    T.setCombat(g, { stage: 'damage', attacker: 0, attackerUid: atk, target: 'spirit', blockers: [def], supportAtk: 0, supportImp: 0 });
    T.resolveCombat(g);
    assert.equal(g.cards[atk].zone, 'field', '攻击者应存活');
    assert.equal(g.cards[def].zone, 'field', '碾压不受毁灭影响');
  } finally { defData.keywords.pop(); }
});

test('次元超越阈值累积减费且每玩家每局限一次', () => {
  const g = game(); essence(g, 0, '智慧之光', 11); essence(g, 0, '新人冒险者', 3);
  assert.equal(T.canPay(g, 0, '次元超越'), false);
  for (let i = 0; i < 5; i++) T.put(g, 0, '智慧之光', 'grave');
  assert.equal(T.canPay(g, 0, '次元超越'), true);
  for (let i = 0; i < 8; i++) T.put(g, 0, '智慧之光', 'grave');
  const dimension = T.put(g, 0, '次元超越', 'hand');
  play(g, 0, dimension); settle(g);
  assert.equal(g.players[0].usedDimension, 1);
  const second = T.put(g, 0, '次元超越', 'hand');
  assert.ok(!legalMoves(g).some((m) => m.type === 'play' && m.uid === second));
});

test('消耗梦境与墓地消散在启动时支付，不能跨连锁重复使用', () => {
  const g = game(); g.players[0].spirit.dream = 1;
  const a = T.put(g, 0, '梦质处理师', 'field');
  T.put(g, 0, '梦质处理师', 'field');
  const m = legalMoves(g).find((x) => x.type === 'ability' && x.uid === a);
  assert.ok(m); applyMove(g, m);
  assert.equal(g.players[0].spirit.dream, 0);
  assert.ok(!legalMoves(g).some((x) => x.type === 'ability' && x.name === '梦质处理师'));
});

test('提取灵感使用对应费用与效果，区域切换后恢复原类型', () => {
  const g = game(); essence(g, 0, '迎宾入梦', 1);
  const token = T.token(g, 0), u = T.put(g, 0, '梦境采集者', 'hand');
  play(g, 0, u, 'extract_sacrifice', [token]); settle(g);
  assert.equal(g.cards[token].zone, 'removed');
  assert.equal(g.players[0].spirit.dream, 2);
  assert.equal(g.cards[u].zone, 'grave');
  assert.equal(g.cards[u].useAs, null);
});

test('可指定后手玩家先行动，且仍跳过其首次通常抽牌', () => {
  const g = createGame({ seed: 19, first: 1, mulligan: false });
  const before = g.players[1].hand.length;
  T.progressAutomatic(g);
  assert.equal(g.active, 1); assert.equal(g.players[1].hand.length, before);
});

test('同种子同脚本完整复现，80 张非衍生物卡守恒且数值有限', () => {
  const opts = { preconA: '紫色铺场', preconB: '蓝色灵感', scriptA: TACTICIAN, scriptB: TACTICIAN, seed: 20261112, record: false };
  const a = playMatch(opts), b = playMatch(opts);
  assert.deepEqual(a.log, b.log); assert.equal(a.winner, b.winner); assert.equal(a.actions, b.actions);
  const cards = Object.values(a.game.cards).filter((c) => !c.token);
  assert.equal(cards.length, 80);
  for (const c of cards) {
    assert.ok(Number.isFinite(c.damage));
    assert.ok(['deck', 'life', 'hand', 'essence', 'field', 'grave', 'exile', 'reveal', 'armor', 'chain'].includes(c.zone), `${c.uid} 区域 ${c.zone}`);
  }
  for (const p of a.game.players) for (const value of Object.values(p.stats)) assert.ok(Number.isFinite(value));
  const serialized = JSON.parse(JSON.stringify(a.game));
  assert.equal(serialized.rng.state, a.game.rng.state);
  assert.equal(serialized.nextUid, a.game.nextUid);
  assert.equal(serialized.players[0].script, undefined);
});

console.log(`\n规则回归：${passed} 通过，${failed} 失败。`);
if (failed) process.exitCode = 1;
