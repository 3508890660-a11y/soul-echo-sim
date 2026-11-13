import { playMatch, ENGINE_INFO } from '../js/engine/rules.js';
import { PRECONS, DECK_GOALS } from '../js/engine/precons.js';
import { TACTICIAN } from '../js/ai/builtin.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = Object.keys(PRECONS);
const colors = { 灰色基准: '灰', 红色快攻: '红', 白色回复: '白', 紫色铺场: '紫', 蓝色灵感: '蓝', 黑色回收: '黑' };
const phaseNames = { main1: '主要阶段一', main2: '主要阶段二', combat: '战斗阶段', end: '结束步骤', start: '开始阶段', setup: '设置' };
const S = { steps: [], idx: 0, playing: false, timer: null, speed: 1, busy: false, config: null };

for (const id of ['#deck-a', '#deck-b']) {
  $(id).innerHTML = names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
}
$('#deck-a').value = '灰色基准';
$('#deck-b').value = '红色快攻';
$('#deck-a').title = DECK_GOALS[$('#deck-a').value];
$('#deck-b').title = DECK_GOALS[$('#deck-b').value];
for (const id of ['#deck-a', '#deck-b']) $(id).addEventListener('change', (e) => { e.target.title = DECK_GOALS[e.target.value]; });

function setStatus(text) { $('#status').textContent = text; }
function pause() {
  S.playing = false;
  clearTimeout(S.timer);
  $('#btn-play span').textContent = '播放';
  $('#btn-play svg').innerHTML = '<path d="m8 5 11 7-11 7Z"/>';
}
function play() {
  if (!S.steps.length) return;
  if (S.idx >= S.steps.length - 1) render(0);
  S.playing = true;
  $('#btn-play span').textContent = '暂停';
  $('#btn-play svg').innerHTML = '<path d="M8 5v14M16 5v14"/>';
  const tick = () => {
    if (!S.playing) return;
    if (S.idx >= S.steps.length - 1) { pause(); return; }
    render(S.idx + 1, true);
    S.timer = setTimeout(tick, Math.max(45, 620 / S.speed));
  };
  S.timer = setTimeout(tick, Math.max(45, 620 / S.speed));
}

function startMatch() {
  if (S.busy) return;
  pause(); S.busy = true;
  const a = $('#deck-a').value, b = $('#deck-b').value;
  const seed = Number.parseInt($('#seed').value, 10);
  if (!Number.isFinite(seed)) { setStatus('种子须为整数。'); S.busy = false; return; }
  const firstValue = $('#first').value;
  S.config = { preconA: a, preconB: b, seed, first: firstValue === 'random' ? undefined : Number(firstValue), randomFirst: firstValue === 'random' };
  $('#btn-start').disabled = true;
  setStatus(`正在计算 ${a} vs ${b}，种子 ${seed}…`);
  setTimeout(() => {
    try {
      const result = playMatch({ ...S.config, scriptA: TACTICIAN, scriptB: TACTICIAN, nameA: a, nameB: b, colorA: colors[a], colorB: colors[b], spiritA: a === '黑色回收' ? '陵园看守者' : '测试灵体', spiritB: b === '黑色回收' ? '陵园看守者' : '测试灵体' });
      S.steps = result.steps; S.idx = 0; S.result = result;
      $('#timeline').max = Math.max(0, S.steps.length - 1);
      $('#timeline').value = 0;
      render(0);
      setStatus(`完成：${S.steps.length} 个快照，${result.actions} 个动作。相同配置与种子可完整复现。`);
      play();
    } catch (error) {
      console.error(error); setStatus(`生成失败：${error.message}`);
    } finally {
      S.busy = false; $('#btn-start').disabled = false;
    }
  }, 30);
}

function cardButton(c, extra = '') {
  if (!c) return '';
  const classes = ['game-card', c.tapped ? 'tapped' : '', extra].filter(Boolean).join(' ');
  const stats = c.zone === 'field' ? `${c.atk} / ${c.imp} / ${Math.max(0, c.hp - c.damage)}` : c.type === '灵像' ? `${c.attack} / ${c.impact} / ${c.vitality}` : c.type;
  const damage = c.damage ? `<span class="card-damage">伤害 ${c.damage}</span>` : `${c.color}色`;
  return `<button type="button" class="${classes}" data-color="${esc(c.color)}" data-card-uid="${esc(c.uid)}" aria-label="查看${esc(c.name)}详情">
    <span class="card-cost">${c.cost?.total ?? '—'}</span><span class="card-name">${esc(c.name)}</span>
    <span class="card-stats">${esc(stats)}</span><span class="card-meta">${damage}${c.tapped ? ' · 已横置' : ''}${c.status === 'approx' ? ' · 近似' : ''}</span>
  </button>`;
}

function renderPlayer(p, side, snap) {
  const root = $(`#player-${side}`);
  root.classList.toggle('active', snap.active === side && !snap.over);
  const attacking = snap.combat?.attackerUid;
  const blockers = snap.combat?.blockers || [];
  const fields = p.field.length ? p.field.map((c) => cardButton(c, c.uid === attacking ? 'attacking' : blockers.includes(c.uid) ? 'blocking' : '')).join('') : '<span class="empty">战场为空</span>';
  const essences = p.essence.length ? p.essence.map((c) => cardButton(c)).join('') : '<span class="empty">尚未设置灵质</span>';
  const hand = p.hand.length ? p.hand.map((c) => cardButton(c)).join('') : '<span class="empty">手牌为空</span>';
  root.innerHTML = `
    <div class="player-head"><div><div class="player-name"><i class="color-dot" style="background:var(--${p.color === '灰' ? 'grey' : p.color === '红' ? 'red' : p.color === '白' ? 'white' : p.color === '紫' ? 'purple' : p.color === '蓝' ? 'blue' : 'black'})"></i><h2>${esc(p.name)}</h2></div><div class="spirit">${esc(p.spiritName)} · ${p.spirit.tapped ? '已横置' : '未横置'} · 暴击 ${p.spirit.crit} · 梦境 ${p.spirit.dream}</div></div><div class="life"><strong>${p.life}</strong><span>生命卡组</span></div></div>
    <div class="stats"><span>主卡组 <b>${p.deck}</b></span><span>分解 <b>${p.grave.length}</b></span><span>消散 <b>${p.exileCount}</b></span><span>战斗伤害 <b>${p.stats.combatDamage}</b></span><span>直伤 <b>${p.stats.directDamage}</b></span><span>最大揭示 <b>${p.stats.maxReveal}</b></span></div>
    <div class="zone-label">战场 · ${p.field.length}</div><div class="card-row">${fields}</div>
    <div class="zone-label">灵质 · ${p.essence.length}${p.armor.length ? `｜护甲 · ${p.armor.length}` : ''}</div><div class="card-row essence-row">${essences}</div>
    <details class="hand"><summary>手牌 · ${p.handCount}（全知回放）</summary><div class="card-row">${hand}</div></details>`;
}

function combatText(snap) {
  if (snap.lifeDamage) return `生命伤害：${snap.P[snap.lifeDamage.side].name} 尚有 ${snap.lifeDamage.remaining} 点待结算${snap.lifeDamage.critAdded ? '；本段暴击已追加' : ''}。`;
  if (snap.inspect) return `${snap.P[snap.inspect.side].name} 正在决定是否支付同色灵能揭示【${snap.inspect.card.name}】。`;
  const cb = snap.combat;
  if (!cb) return '当前没有挂起的攻击。';
  const stage = { combat_start: '战斗开始', attackers: '宣告攻击者', support: '宣告支援', blockers: '宣告阻挡', order: '阻挡排序', response: '攻击响应', damage: '战斗伤害' }[cb.stage] || cb.stage;
  if (!cb.attackerUid) return `战斗步骤：${stage}。`;
  const attacker = snap.P.flatMap((p) => p.field).find((c) => c.uid === cb.attackerUid);
  return `${stage}：【${attacker?.name || '攻击者已离场'}】，阻挡者 ${cb.blockers?.length || 0}，支援加成 +${cb.supportAtk || 0}/+${cb.supportImp || 0}。`;
}

function render(i, fromPlayback = false) {
  if (!S.steps.length) return;
  if (!fromPlayback) pause();
  S.idx = Math.max(0, Math.min(i, S.steps.length - 1));
  const step = S.steps[S.idx], snap = step.snap;
  renderPlayer(snap.P[0], 0, snap); renderPlayer(snap.P[1], 1, snap);
  $('#turn-label').textContent = snap.turn ? `第 ${snap.turn} 回合 · ${snap.P[snap.active].name}` : '战斗准备';
  $('#phase-label').textContent = snap.over ? '对局结束' : `${phaseNames[snap.phase] || snap.phase} · ${snap.P[snap.priority].name} 优先权`;
  $('#winner-label').textContent = snap.over ? (snap.winner == null ? '平局' : `${snap.P[snap.winner].name} 获胜`) : '';
  $('#chain').innerHTML = snap.chain.length ? snap.chain.map((x) => {
    const tag = x.sourceUid ? 'button' : 'div';
    return `<${tag} ${x.sourceUid ? 'type="button"' : ''} class="chain-chip ${x.countered ? 'countered' : ''}" ${x.sourceUid ? `data-card-uid="${esc(x.sourceUid)}"` : ''}>${esc(x.name)}<br><small>${esc(snap.P[x.controller].name)} · ${esc(x.event)}</small></${tag}>`;
  }).join('') : '<span class="empty">连锁为空</span>';
  $('#combat').textContent = combatText(snap);
  $('#current-event').textContent = step.text;
  $('#event-number').textContent = `动作 ${step.action}`;
  $('#timeline').value = S.idx;
  $('#progress').textContent = `${S.idx} / ${S.steps.length - 1}`;
  const from = Math.max(0, S.idx - 30);
  $('#log').innerHTML = S.steps.slice(from, S.idx + 1).reverse().map((s) => `<button type="button" data-step="${s.index}" class="${s.index === S.idx ? 'current' : ''}"><span>${s.index}</span>${esc(s.text.split('\n')[0])}</button>`).join('');
  $('#btn-prev').disabled = S.idx === 0;
  $('#btn-next').disabled = S.idx >= S.steps.length - 1;
}

function findCard(uid) {
  if (!uid || !S.steps.length) return null;
  const snap = S.steps[S.idx].snap;
  for (const p of snap.P) {
    for (const zone of ['hand', 'essence', 'field', 'grave', 'armor']) {
      const c = zone === 'hand' ? p.hand : zone === 'grave' ? p.grave : zone === 'essence' ? p.essence : zone === 'field' ? p.field : p.armor;
      const found = c?.find((x) => x.uid === uid); if (found) return found;
    }
  }
  for (const item of snap.chain) if (item.card?.uid === uid) return item.card;
  if (snap.lifeDamage?.current?.uid === uid) return snap.lifeDamage.current;
  if (snap.inspect?.card?.uid === uid) return snap.inspect.card;
  return null;
}

function showCard(uid) {
  const c = findCard(uid);
  if (!c) return;
  $('#card-detail').innerHTML = `<div class="detail-head"><h2>${esc(c.name)}</h2><p>${esc(c.color)}色 · ${esc(c.type)} · 总费用 ${c.cost?.total ?? '—'}</p></div>
    <div class="detail-stats"><span>攻击 ${c.atk ?? c.attack ?? '—'}</span><span>冲击 ${c.imp ?? c.impact ?? '—'}</span><span>生命 ${c.hp ?? c.vitality ?? '—'}</span></div>
    <div class="detail-text">${esc(c.text || '无效果文本。')}</div>
    <div class="detail-meta">关键词：${esc(c.keywords?.join('、') || '无')}<br>触发：${esc(c.trigger || '—')}<br>当前区域：${esc(c.zone)}｜累计伤害：${c.damage || 0}${c.status === 'approx' ? '<br><span class="badge">近似结算</span>' : ''}</div>`;
  $('#card-dialog').showModal();
}

function showAbout() {
  $('#about-detail').innerHTML = `<div class="detail-head"><h2>引擎实现范围</h2><p>${ENGINE_INFO.cardCount} 种卡 · ${ENGINE_INFO.implemented} 种常规实现 · ${ENGINE_INFO.approx.length} 种文本近似</p></div>
    <div class="detail-text">真实状态机覆盖优先权、后进先出连锁、目标失效、灵质与颜色费用、灵体 ST、逐点生命伤害、LT／CT、多人阻挡、先攻、践踏、超冲击、区域复位、衍生物、灵感迸发、反制与墓地回收。AI 只能选择合法动作，观战 UI 不修改引擎结果。</div>
    <h3>测试口径与近似项</h3><ul class="approx-list">${Object.entries(ENGINE_INFO.approximations).map(([name, text]) => `<li><strong>${esc(name)}</strong><br>${esc(text)}</li>`).join('')}</ul>
    <p class="detail-meta">脚本对局用于发现引擎错误，不是人胜率或平衡评级。参考“灵枢战纪”的无头引擎／快照回放架构；规则、卡牌数据与代码均为本项目独立实现。</p>`;
  $('#about-dialog').showModal();
}

$('#btn-start').addEventListener('click', startMatch);
$('#btn-play').addEventListener('click', () => S.playing ? pause() : play());
$('#btn-prev').addEventListener('click', () => render(S.idx - 1));
$('#btn-next').addEventListener('click', () => render(S.idx + 1));
$('#btn-restart').addEventListener('click', startMatch);
$('#timeline').addEventListener('input', (e) => render(Number(e.target.value)));
$('#speed').addEventListener('change', (e) => { S.speed = Number(e.target.value); });
$('#btn-about').addEventListener('click', showAbout);
$('#btn-export').addEventListener('click', () => {
  if (!S.steps.length) { setStatus('请先生成对局，再导出回放。'); return; }
  const blob = new Blob([JSON.stringify({ engine: ENGINE_INFO.name, config: S.config, steps: S.steps, log: S.result.log }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `soul-echo-${S.config.preconA}-vs-${S.config.preconB}-${S.config.seed}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('回放 JSON 已导出，包含全部事件与快照。');
});
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-card-uid]'); if (card) showCard(card.dataset.cardUid);
  const step = e.target.closest('[data-step]'); if (step) render(Number(step.dataset.step));
  const close = e.target.closest('[data-close]'); if (close) $(`#${close.dataset.close}`).close();
});
for (const dialog of $$('dialog')) dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select') || $('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
  if (e.code === 'ArrowLeft') render(S.idx - 1);
  if (e.code === 'ArrowRight') render(S.idx + 1);
});
renderPlayerPlaceholder();
function renderPlayerPlaceholder() {
  for (const side of [0, 1]) $(`#player-${side}`).innerHTML = '<div class="player-head"><div class="player-name"><h2>等待对局</h2></div><div class="life"><strong>10</strong><span>生命卡组</span></div></div><span class="empty">生成后显示战场、灵质与手牌。</span>';
}
