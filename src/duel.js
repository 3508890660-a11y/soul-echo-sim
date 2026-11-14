import { createGame, legalMoves, applyMove, progressAutomatic, makeView, validateDeck } from '../js/engine/rules.js';
import { SPIRIT_DATA, BY_NAME, BY_ID, CARD_DATA } from '../js/engine/cards.js';
import { PRECONS, PRECON_COLORS } from '../js/engine/precons.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'soul-echo:decks:v1';
const COLOR_VAR = { 白: 'white', 黑: 'black', 绿: 'green', 红: 'red', 蓝: 'blue', 黄: 'yellow', 紫: 'purple', 灰: 'grey' };
const PHASE = { main1: '主要阶段一', main2: '主要阶段二', combat: '战斗阶段', end: '结束步骤', start: '开始阶段', setup: '设置' };
const STAGE = { combat_start: '战斗开始', attackers: '宣告攻击者', support: '宣告支援', blockers: '宣告阻挡', order: '伤害顺序', response: '攻击响应', damage: '战斗伤害' };

const S = { g: null, view: 0, privacy: true, shown: false, started: false, draft: null };

const deckName = (uid) => { const c = S.g.cards[uid]; const d = c ? BY_ID.get(c.id) : null; return d ? d.name : '？'; };
const defOf = (uid) => { const c = S.g.cards[uid]; return c ? BY_ID.get(c.id) : null; };

// ── 卡组来源 ─────────────────────────────────────────
function savedDecks() {
  try { return JSON.parse(localStorage.getItem(STORE) || '') || []; } catch { return []; }
}
function spiritForColor(color) {
  return (SPIRIT_DATA.find((s) => s.color === color) || SPIRIT_DATA[0]).name;
}
function deckOptions() {
  // 预组按自身主色配一个同色灵体：同色 60% 生效后，白灵体配红预组会直接不合法。
  const out = Object.entries(PRECONS).map(([name, cards]) => ({ key: `pre:${name}`, label: `预组 · ${name}`, cards, spirit: spiritForColor(PRECON_COLORS[name]) }));
  for (const d of savedDecks()) out.push({ key: `save:${d.id}`, label: `我的 · ${d.name}`, cards: d.cards, spirit: d.spirit });
  return out;
}
function dominantColor(cards) {
  const tally = {};
  for (const [name, n] of Object.entries(cards || {})) {
    const c = BY_NAME.get(name); if (!c) continue;
    tally[c.color] = (tally[c.color] || 0) + n;
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || '灰';
}

// ── 开局 ─────────────────────────────────────────────
function fillSetup() {
  const options = deckOptions();
  const html = options.map((o) => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join('');
  $('#deck-a').innerHTML = html;
  $('#deck-b').innerHTML = html;
  const pre = options.filter((o) => o.key.startsWith('pre:'));
  $('#deck-a').value = options[0].key;
  $('#deck-b').value = (options[1] || pre[0] || options[0]).key;
  const spirits = SPIRIT_DATA.map((s) => `<option value="${esc(s.name)}">${esc(s.color)}·${esc(s.name)}</option>`).join('');
  $('#spirit-a').innerHTML = spirits;
  $('#spirit-b').innerHTML = spirits;
  syncSpirit('#deck-a', '#spirit-a');
  syncSpirit('#deck-b', '#spirit-b');
  $('#deck-a').onchange = () => syncSpirit('#deck-a', '#spirit-a');
  $('#deck-b').onchange = () => syncSpirit('#deck-b', '#spirit-b');
}

/** 选中的卡组自带推荐灵体时，把灵体下拉同步过去，避免默认组合就不合法。 */
function syncSpirit(deckSel, spiritSel) {
  const opt = deckOptions().find((o) => o.key === $(deckSel).value);
  if (opt?.spirit) $(spiritSel).value = opt.spirit;
}

function pickDeck(key) {
  const opt = deckOptions().find((o) => o.key === key);
  if (!opt) return null;
  return { cards: opt.cards, spirit: opt.spirit };
}

function start() {
  const a = pickDeck($('#deck-a').value);
  const b = pickDeck($('#deck-b').value);
  if (!a || !b) { status('请选择双方卡组。'); return; }
  const spiritA = $('#spirit-a').value;
  const spiritB = $('#spirit-b').value;
  const va = validateDeck(a.cards, undefined, { spirit: spiritA });
  const vb = validateDeck(b.cards, undefined, { spirit: spiritB });
  if (!va.ok || !vb.ok) { status(`卡组不合法：${[...va.errors, ...vb.errors].slice(0, 2).join('；')}`); return; }
  const seed = Number.parseInt($('#seed').value, 10);
  if (!Number.isFinite(seed)) { status('种子须为整数。'); return; }
  const firstRaw = $('#first').value;
  S.privacy = $('#privacy').checked;
  S.g = createGame({
    deckA: a.cards, deckB: b.cards,
    spiritA, spiritB,
    colorA: dominantColor(a.cards), colorB: dominantColor(b.cards),
    nameA: '玩家 A', nameB: '玩家 B',
    seed, first: firstRaw === 'random' ? undefined : Number(firstRaw), randomFirst: firstRaw === 'random',
  });
  S.view = S.g.priority;
  S.shown = false; S.started = true;
  $('#setup').hidden = true;
  $('#layout').hidden = false;
  status(`对局开始：种子 ${seed}。双方生命 10，起手 4。`);
  render(true);
}

function status(text) { $('#status').textContent = text; }

// ── 推进与渲染 ───────────────────────────────────────
function settle() {
  let guard = 0;
  while (!S.g.over && progressAutomatic(S.g) && guard++ < 3000) { /* 自动结算触发与状态检查 */ }
  if (guard >= 3000) status('自动结算步数过多，已停止推进。');
}

function currentSide() {
  const g = S.g;
  if (!g) return 0;
  if (g.inspect) return g.inspect.side;
  return g.priority;
}

function cardTile(c, own) {
  const zone = c.zone;
  const stat = c.type === '灵像'
    ? `${c.atk ?? c.attack} / ${c.imp ?? c.impact} / ${Math.max(0, (c.hp ?? c.vitality) - (c.damage || 0))}`
    : c.type === '灵性' ? `生命 ${Math.max(0, (c.hp ?? c.vitality) - (c.damage || 0))}` : c.type;
  const cls = ['game-card', c.tapped ? 'tapped' : '', own ? 'mine' : '', c.zone === 'field' ? 'field' : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-uid="${esc(c.uid)}" data-zone="${esc(zone)}" data-color="${esc(c.color)}" title="${esc(c.text || '无效果文本')}">
    <span class="card-cost">${c.cost?.total ?? '—'}</span>
    <span class="card-name">${esc(c.name)}</span>
    <span class="card-stats">${esc(stat)}</span>
    <span class="card-meta">${esc(c.color)}色${c.damage ? ` · 伤 ${c.damage}` : ''}${c.tapped ? ' · 横置' : ''}</span>
  </button>`;
}

function sidePanel(p, own, sideIdx) {
  const field = p.field.length ? p.field.map((c) => cardTile(c, own)).join('') : '<span class="empty">战场为空</span>';
  const essence = p.essence.length ? p.essence.map((c) => cardTile(c, own)).join('') : '<span class="empty">无灵质</span>';
  const hand = own
    ? (p.hand?.length ? p.hand.map((c) => cardTile(c, true)).join('') : '<span class="empty">手牌为空</span>')
    : `<span class="empty">手牌 ${p.handCount} 张（不可见）</span>`;
  const isTurn = S.g.active === sideIdx;
  return `
    <div class="duel-head">
      <div class="dh-left">
        <i class="color-dot" style="background:var(--${COLOR_VAR[p.color] || 'grey'})"></i>
        <h2>${esc(p.name)}</h2>
        <span class="dh-spirit">${esc(p.spiritName)}${p.spirit.tapped ? ' · 已横置' : ''} · 暴击 ${p.spirit.crit} · 梦境 ${p.spirit.dream}</span>
      </div>
      <div class="dh-right">
        ${isTurn ? '<span class="turn-badge">回合玩家</span>' : ''}
        <span class="life"><strong>${p.life}</strong> 生命</span>
        <span class="mini-stat">牌库 ${p.deck}</span>
        <span class="mini-stat">手牌 ${p.handCount}</span>
        <span class="mini-stat">分解 ${p.grave.length}</span>
      </div>
    </div>
    <div class="zone-label">战场 · ${p.field.length}</div>
    <div class="card-row">${field}</div>
    <div class="zone-label">灵质 · ${p.essence.length}${p.armor.length ? `｜护甲 ${p.armor.length}` : ''}</div>
    <div class="card-row essence-row">${essence}</div>
    ${own ? `<div class="zone-label">手牌 · ${p.handCount}</div><div class="card-row hand-row">${hand}</div>` : ''}`;
}

function render(force = false) {
  if (!S.g) return;
  settle();
  const side = currentSide();
  if (side !== S.view) {
    S.view = side;
    if (S.privacy && S.shown && !S.g.over) { showHandoff(side); return; }
  }
  S.shown = true;
  const v = makeView(S.g, S.view);
  $('#turn-label').textContent = v.turn ? `第 ${v.turn} 回合` : '战斗准备';
  $('#phase-label').textContent = S.g.over ? '对局结束' : `${PHASE[v.phase] || v.phase}${v.combat?.stage ? ` · ${STAGE[v.combat.stage] || v.combat.stage}` : ''}`;
  $('#who-label').textContent = S.g.over ? '' : `轮到 ${v.me.name}`;

  $('#side-opp').innerHTML = sidePanel(v.opp, false, 1 - S.view);
  $('#side-me').innerHTML = sidePanel(v.me, true, S.view);

  $('#chain').innerHTML = v.chain.length ? v.chain.map((x) =>
    `<span class="chain-chip ${x.countered ? 'countered' : ''}">${esc(x.name)}<br><small>${esc(S.g.players[x.controller].name)} · ${esc(x.event)}</small></span>`).join('') : '<span class="empty">连锁为空</span>';

  $('#combat').textContent = combatText(v);
  $('#log').innerHTML = S.g.log.slice(-40).reverse().map((l) => `<div class="logline">${esc(l)}</div>`).join('');
  $('#log-count').textContent = S.g.log.length;

  if (S.g.over) {
    status(S.g.winner == null ? `对局结束：平局（${S.g.reason}）` : `对局结束：${S.g.players[S.g.winner].name} 获胜（${S.g.reason}）`);
    $('#actionbar').hidden = true;
  }
  renderActions();
  if (force) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function combatText(v) {
  const g = S.g;
  if (g.lifeDamage) return `生命伤害结算中：${g.players[g.lifeDamage.side].name} 尚有 ${g.lifeDamage.remaining} 点。`;
  if (g.inspect) return `${g.players[g.inspect.side].name} 正在决定是否支付同色灵能揭示顶牌。`;
  if (!v.combat) return '当前没有挂起的攻击。';
  return `战斗：${STAGE[v.combat.stage] || v.combat.stage}｜阻挡者 ${v.combat.blockers?.length || 0}`;
}

// ── 交接遮罩 ─────────────────────────────────────────
function showHandoff(side) {
  $('#handoff-name').textContent = `请将设备交给 ${S.g.players[side].name}`;
  $('#handoff').hidden = false;
  $('#handoff').dataset.side = String(side);
}
$('#handoff-ok').addEventListener('click', () => {
  $('#handoff').hidden = true;
  S.shown = true;
  render();
});

// ── 动作面板 ─────────────────────────────────────────
function moveLabel(m) {
  const g = S.g;
  const names = (m.targets || []).map((uid) => defOf(uid)?.name || '？');
  switch (m.type) {
    case 'play': {
      const d = defOf(m.uid);
      const modeTag = { bury: '（葬送）', condense: '（凝聚）', destroy2: '（破坏 2）', both: '（破坏 2＋凝聚）', sacrifice: '（献祭衍生物）', extract: '（提取灵感）', extract_sacrifice: '（提取＋献祭）', tokens: '（召唤）', damage: '（伤害）', charge: '（充能）' }[m.mode] || '';
      return `使用【${d?.name}】${modeTag}${names.length ? ` → ${names.join('、')}` : ''}`;
    }
    case 'setEssence': return `将【${defOf(m.uid)?.name}】设为灵质`;
    case 'tapEssence': return `横置【${defOf(m.uid)?.name}】产 1 点灵能`;
    case 'ability': return `启动【${defOf(m.uid)?.name}】${m.mode ? `（${m.mode}）` : ''}${names.length ? ` → ${names.join('、')}` : ''}`;
    case 'spiritSpecial': return `灵体能力：${m.name}${names.length ? ` → ${names.join('、')}` : ''}`;
    case 'spiritDraw': return '灵体横置：检视顶牌';
    case 'attack': return `攻击 ${m.target === 'spirit' ? '对方灵体' : `【${defOf(m.target)?.name}】`}`;
    case 'block': return `用【${defOf(m.uid)?.name}】阻挡`;
    case 'orderBlockers': return '确定阻挡伤害顺序';
    case 'supportSpirit': return '暴击指示物支援（+1000/+1）';
    case 'inspectTake': return '不支付，直接加入手牌';
    case 'inspectReveal': return '支付 1 点同色灵能，揭示';
    case 'pass': return '让过';
    default: return m.type;
  }
}

function renderActions() {
  const bar = $('#actionbar');
  if (!S.g || S.g.over) { bar.hidden = true; return; }
  const moves = legalMoves(S.g);
  const useful = moves.filter((m) => m.type !== 'pass');
  const forced = !!S.g.inspect;
  const side = currentSide();
  bar.hidden = false;
  if (!forced) {
    bar.innerHTML = `<div class="ab-head"><span>${esc(S.g.players[side].name)}：点击手牌或场上卡选择动作</span>
      <small>${useful.length} 项可用</small>
      <button type="button" class="mini" id="ab-show" aria-label="展开全部动作">＋</button></div>`;
    $('#ab-show').addEventListener('click', () => showMoveList(useful, '全部可用动作'));
    return;
  }
  showMoveList(useful, S.g.inspect ? '灵体检视：选择是否支付同色灵能' : '可用动作');
}

function showMoveList(useful, title, uid = null) {
  const bar = $('#actionbar');
  bar.hidden = false;
  bar.innerHTML = `<div class="ab-head"><span>${esc(title)}</span><small>${useful.length} 项</small>
      ${uid ? '<button type="button" class="mini" id="ab-info" aria-label="查看卡牌详情">?</button>' : ''}
      <button type="button" class="mini" id="ab-close" aria-label="收起">×</button></div>
    <div class="ab-grid">${useful.slice(0, 80).map((m, i) =>
      `<button type="button" class="ab-move" data-move="${i}">${esc(moveLabel(m))}</button>`).join('') || '<span class="empty">当前没有可执行动作，只能让过。</span>'}</div>`;
  bar.querySelectorAll('[data-move]').forEach((b) => {
    b.addEventListener('click', () => doMove(useful[Number(b.dataset.move)]));
  });
  $('#ab-close').addEventListener('click', () => { bar.hidden = true; });
  const info = $('#ab-info');
  if (info && uid) info.addEventListener('click', () => showCardDetail(uid));
}

function showCardDetail(uid) {
  const c = S.g.cards[uid], d = c ? BY_ID.get(c.id) : null;
  if (!d) return;
  const stats = d.type === '灵像'
    ? `攻击 ${c.zone === 'field' ? (c.atk ?? d.attack) : d.attack}　冲击 ${d.impact}　生命 ${d.vitality}`
    : d.type === '灵性' ? `生命 ${d.vitality}` : '—';
  $('#card-detail').innerHTML = `<div class="detail-head"><h2>${esc(d.name)}</h2>
      <p>${esc(d.color)}色 · ${esc(d.type)} · ${d.cost.total} 费（${Object.entries(d.cost.colors || {}).map(([k, v]) => `${k}${v}`).join('') || (d.cost.colored ? '同色' + d.cost.colored : '')}${d.cost.grey ? `＋灰${d.cost.grey}` : ''}）· ${esc(d.rarity || '')}</p></div>
    <div class="detail-stats"><span>${esc(stats)}</span></div>
    <div class="detail-text">${esc(d.text || '无效果文本。')}</div>
    <div class="detail-meta">关键词：${esc((d.keywords || []).join('、') || '无')}<br>触发：${esc(d.trigger || '—')}${d.triggerText ? `（${esc(d.triggerText)}）` : ''}<br>编号：${esc(d.code || '')}</div>`;
  $('#card-dialog').showModal();
}

function doMove(move) {
  if (!move) return;
  try {
    applyMove(S.g, move);
    $('#actionbar').hidden = true;
    render();
  } catch (error) {
    status(`动作被拒绝：${error.message}`);
    renderActions();
  }
}

// ── 点击卡牌 ─────────────────────────────────────────
$('#side-me').addEventListener('click', (e) => {
  const el = e.target.closest('[data-uid]');
  if (!el) return;
  const uid = el.dataset.uid;
  const zone = el.dataset.zone;
  if (zone === 'hand') return openForHand(uid);
  if (zone === 'field') return openForField(uid);
  if (zone === 'essence') return quickTap(uid);
});

function openForHand(uid) {
  const moves = legalMoves(S.g).filter((m) => (m.type === 'play' || m.type === 'setEssence') && m.uid === uid);
  const bar = $('#actionbar');
  bar.hidden = false;
  if (!moves.length) {
    const why = S.g.phase !== 'main1' && S.g.phase !== 'main2'
      ? '当前不是主要阶段。'
      : '费用不足，或这张卡此刻不能使用。';
    bar.innerHTML = `<div class="ab-head"><span>【${esc(defOf(uid)?.name)}】${esc(why)}</span><button type="button" class="mini" id="ab-close">×</button></div>`;
    $('#ab-close').addEventListener('click', () => { bar.hidden = true; });
    return;
  }
  showMoveList(moves, `【${defOf(uid)?.name}】`, uid);
}

function openForField(uid) {
  const moves = legalMoves(S.g).filter((m) => ['ability', 'attack', 'block'].includes(m.type) && (m.uid === uid));
  if (!moves.length) { status('这张卡当前没有可用动作。'); return; }
  showMoveList(moves, `【${defOf(uid)?.name}】`, uid);
}

function quickTap(uid) {
  const m = legalMoves(S.g).find((x) => x.type === 'tapEssence' && x.uid === uid);
  if (m) doMove(m); else status('这张灵质已横置。');
}

// 灵体区与通用按钮
$('#side-me').addEventListener('click', (e) => {
  if (!e.target.closest('.dh-spirit')) return;
  const moves = legalMoves(S.g).filter((m) => m.type === 'spiritDraw' || m.type === 'spiritSpecial' || m.type === 'supportSpirit');
  if (!moves.length) { status('灵体本回合已横置或当前不能发动。'); return; }
  const bar = $('#actionbar');
  bar.hidden = false;
  bar.innerHTML = `<div class="ab-head"><span>灵体能力</span><button type="button" class="mini" id="ab-close">×</button></div>
    <div class="ab-grid">${moves.map((m, i) => `<button type="button" class="ab-move" data-move="${i}">${esc(moveLabel(m))}</button>`).join('')}</div>`;
  bar.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => doMove(moves[Number(b.dataset.move)])));
  $('#ab-close').addEventListener('click', () => { bar.hidden = true; });
});

// ── 顶部按钮 ─────────────────────────────────────────
$('#btn-pass').addEventListener('click', () => {
  const m = legalMoves(S.g).find((x) => x.type === 'pass');
  if (!m) return;
  doMove(m);
});
$('#btn-concede').addEventListener('click', () => {
  if (!S.g || S.g.over) return;
  const side = currentSide();
  S.g.over = true;
  S.g.winner = 1 - side;
  S.g.reason = `${S.g.players[side].name} 认输`;
  S.g.log.push(S.g.reason);
  render();
});
$('#btn-start').addEventListener('click', start);
$('#privacy').addEventListener('change', () => { S.privacy = $('#privacy').checked; });
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-card-uid]');
  if (el) return;
});
document.addEventListener('click', (e) => {
  const close = e.target.closest('[data-close]');
  if (close) $(`#${close.dataset.close}`).close();
});

fillSetup();
$('#layout').hidden = true;
