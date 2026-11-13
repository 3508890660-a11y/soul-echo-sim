import { CARD_DATA, SPIRIT_DATA, BY_NAME, COLORS, TYPES, RARITIES } from '../js/engine/cards.js';
import { PRECONS } from '../js/engine/precons.js';
import { validateDeck } from '../js/engine/rules.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'soul-echo:decks:v1';

const COLOR_VAR = { 白: 'white', 黑: 'black', 绿: 'green', 红: 'red', 蓝: 'blue', 黄: 'yellow', 紫: 'purple', 灰: 'grey' };
const RARITY_LABEL = { 微响: '微响', 叠响: '叠响', 共鸣: '共鸣', 绝响: '绝响' };

const state = {
  filter: { color: '全部', type: '全部', rarity: '全部', text: '' },
  deck: { id: null, name: '未命名卡组', spirit: SPIRIT_DATA[0].name, cards: {} },
};

// ── 存档 ─────────────────────────────────────────────
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || '') || []; } catch { return []; }
}
function saveStore(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { console.warn('存档失败', e); }
}
function uid() { return `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`; }

// ── 筛选条 ───────────────────────────────────────────
const FILTER_ROWS = [
  ['#filter-color', 'color', ['全部', ...COLORS, '混色']],
  ['#filter-type', 'type', ['全部', ...TYPES]],
  ['#filter-rarity', 'rarity', ['全部', ...RARITIES]],
];

function buildFilters() {
  for (const [sel, key, values] of FILTER_ROWS) {
    const host = $(sel);
    host.innerHTML = values.map((v) =>
      `<button type="button" class="chip${state.filter[key] === v ? ' on' : ''}" data-key="${key}" data-val="${esc(v)}">${esc(v)}</button>`).join('');
    for (const b of host.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        state.filter[b.dataset.key] = b.dataset.val;
        buildFilters();
        renderPool();
      });
    }
  }
}

// ── 卡池 ─────────────────────────────────────────────
function matches(c) {
  const f = state.filter;
  if (f.color !== '全部') {
    if (f.color === '混色' ? !c.mixed : (c.mixed || c.color !== f.color)) return false;
  }
  if (f.type !== '全部' && c.type !== f.type) return false;
  if (f.rarity !== '全部' && c.rarity !== f.rarity) return false;
  if (f.text) {
    const q = f.text.toLowerCase();
    if (!(`${c.name}${c.text}${c.keywords.join('')}${c.code}`.toLowerCase().includes(q))) return false;
  }
  return true;
}

function cardTile(c) {
  const owned = state.deck.cards[c.name] || 0;
  const stats = c.type === '灵像' ? `${c.attack}/${c.impact}/${c.vitality}` : c.type === '灵性' ? `—/—/${c.vitality}` : c.trigger !== '—' ? `触发 ${c.trigger}` : '灵感';
  return `<button type="button" class="pool-card${owned ? ' owned' : ''}" data-name="${esc(c.name)}" data-color="${esc(c.color)}" title="${esc(c.text || '无效果文本')}">
    <span class="pc-top"><i class="color-dot" style="background:var(--${COLOR_VAR[c.color] || 'grey'})"></i>
      <b>${esc(c.name)}</b><em class="pc-cost">${c.cost.total}</em></span>
    <span class="pc-mid">${esc(stats)}</span>
    <span class="pc-bot"><span class="pc-rar r-${esc(c.rarity)}">${esc(RARITY_LABEL[c.rarity] || c.rarity)}</span>
      <span class="pc-type">${esc(c.type)}${c.mixed ? ' · 混色' : ''}</span>
      ${owned ? `<span class="pc-owned">×${owned}</span>` : ''}</span>
  </button>`;
}

function renderPool() {
  const list = CARD_DATA.filter(matches);
  $('#pool').innerHTML = list.map(cardTile).join('') || '<p class="empty">没有符合条件的卡牌。</p>';
  $('#pool-count').textContent = `${list.length} / ${CARD_DATA.length} 名目 · 点击加入卡组，右键移除`;
}

// ── 卡组 ─────────────────────────────────────────────
function total() { return Object.values(state.deck.cards).reduce((a, b) => a + b, 0); }

function addCard(name) {
  const n = state.deck.cards[name] || 0;
  if (n >= 4) return flash(`${name} 已达同名 4 张上限`);
  state.deck.cards[name] = n + 1;
  renderAll();
}
function removeCard(name) {
  const n = state.deck.cards[name] || 0;
  if (!n) return;
  if (n <= 1) delete state.deck.cards[name];
  else state.deck.cards[name] = n - 1;
  renderAll();
}

function flash(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => el.classList.remove('on'), 1600);
}

function deckIssues() {
  return [...new Set(validateDeck(state.deck.cards).errors)];
}

function renderDeck() {
  const n = total();
  $('#deck-name').value = state.deck.name;
  $('#deck-spirit').value = state.deck.spirit;
  $('#deck-total').textContent = n;
  const issues = deckIssues();
  const pill = $('#deck-status');
  pill.textContent = !n ? '空' : issues.length ? '不合法' : '可对战';
  pill.className = `status-pill ${!n ? '' : issues.length ? 'bad' : 'ok'}`;
  $('#deck-issues').innerHTML = issues.length
    ? issues.slice(0, 4).map((i) => `<span>${esc(i)}</span>`).join('')
    : '<span class="ok-text">构筑合法，可在双人对战中使用。</span>';

  const groups = { 灵像: [], 灵感: [], 灵性: [] };
  for (const [name, count] of Object.entries(state.deck.cards)) {
    const c = BY_NAME.get(name);
    if (c) (groups[c.type] || groups.灵像).push({ c, count });
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.c.cost.total - b.c.cost.total || a.c.name.localeCompare(b.c.name, 'zh'));

  $('#deck-list').innerHTML = Object.entries(groups).map(([type, arr]) => {
    if (!arr.length) return '';
    const sum = arr.reduce((a, x) => a + x.count, 0);
    return `<div class="deck-group"><h4>${type}<span>${sum}</span></h4>${arr.map(({ c, count }) =>
      `<div class="deck-row" data-name="${esc(c.name)}">
        <i class="color-dot" style="background:var(--${COLOR_VAR[c.color] || 'grey'})"></i>
        <span class="dr-name">${esc(c.name)}</span>
        <span class="dr-cost">${c.cost.total}</span>
        <span class="dr-count">×${count}</span>
        <button type="button" class="mini" data-minus="${esc(c.name)}" aria-label="移除一张">−</button>
      </div>`).join('')}</div>`;
  }).join('') || '<p class="empty">卡组为空。从左侧卡池点击加入。</p>';
}

function renderCurve() {
  const buckets = Array.from({ length: 9 }, () => 0);
  for (const [name, n] of Object.entries(state.deck.cards)) {
    const c = BY_NAME.get(name);
    if (!c) continue;
    const i = Math.min(8, Math.max(0, c.cost.total));
    buckets[i] += n;
  }
  const max = Math.max(1, ...buckets);
  $('#curve').innerHTML = buckets.map((n, i) =>
    `<div class="curve-col" title="${i === 8 ? '8+' : i} 费：${n} 张"><span class="curve-bar" style="height:${Math.round((n / max) * 46)}px"></span><span class="curve-x">${i === 8 ? '8+' : i}</span></div>`).join('');
}

function renderAll() { renderPool(); renderDeck(); renderCurve(); }

// ── 存档与导入导出 ───────────────────────────────────
function pack() {
  return { name: state.deck.name, spirit: state.deck.spirit, cards: { ...state.deck.cards } };
}

function adopt(data) {
  if (!data || typeof data !== 'object') throw new Error('格式不对');
  const cards = {};
  for (const [name, n] of Object.entries(data.cards || {})) {
    const card = BY_NAME.get(name);
    if (!card) continue;
    const count = Math.max(0, Math.min(4, Math.floor(Number(n) || 0)));
    if (count) cards[name] = count;
  }
  if (!Object.keys(cards).length) throw new Error('没有任何可识别的卡名');
  state.deck = {
    id: data.id || null,
    name: String(data.name || '未命名卡组').slice(0, 24),
    spirit: SPIRIT_DATA.some((s) => s.name === data.spirit) ? data.spirit : SPIRIT_DATA[0].name,
    cards,
  };
  renderAll();
}

function save() {
  const list = loadStore();
  const data = pack();
  if (state.deck.id) {
    const i = list.findIndex((d) => d.id === state.deck.id);
    if (i >= 0) list[i] = { ...data, id: state.deck.id };
    else list.push({ ...data, id: state.deck.id });
  } else {
    state.deck.id = uid();
    list.push({ ...data, id: state.deck.id });
  }
  saveStore(list);
  renderSaved();
  flash('已保存');
}

function renderSaved() {
  const list = loadStore();
  $('#saved-list').innerHTML = list.length ? list.map((d) => {
    const n = Object.values(d.cards || {}).reduce((a, b) => a + b, 0);
    return `<div class="saved-row ${d.id === state.deck.id ? 'current' : ''}">
      <button type="button" class="saved-load" data-load="${d.id}"><b>${esc(d.name)}</b><span>${n} 张 · ${esc(d.spirit || '')}</span></button>
      <button type="button" class="mini" data-del="${d.id}" aria-label="删除">×</button>
    </div>`;
  }).join('') : '<p class="empty">还没有保存的卡组。</p>';
}

function renderPrecons() {
  $('#precon-list').innerHTML = Object.entries(PRECONS).map(([name]) =>
    `<button type="button" class="precon" data-precon="${esc(name)}">${esc(name)}<span>40 张</span></button>`).join('');
}

// ── 事件 ─────────────────────────────────────────────
$('#pool').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-name]'); if (!tile) return;
  addCard(tile.dataset.name);
});
$('#pool').addEventListener('contextmenu', (e) => {
  const tile = e.target.closest('[data-name]'); if (!tile) return;
  e.preventDefault(); removeCard(tile.dataset.name);
});
$('#deck-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-minus]'); if (btn) removeCard(btn.dataset.minus);
});
$('#search').addEventListener('input', (e) => { state.filter.text = e.target.value.trim(); renderPool(); });
$('#deck-name').addEventListener('input', (e) => { state.deck.name = e.target.value || '未命名卡组'; });
$('#deck-spirit').addEventListener('change', (e) => { state.deck.spirit = e.target.value; renderDeck(); });
$('#btn-save').addEventListener('click', save);
$('#btn-new').addEventListener('click', () => {
  state.deck = { id: null, name: '未命名卡组', spirit: SPIRIT_DATA[0].name, cards: {} };
  renderAll(); renderSaved();
});
$('#btn-copy').addEventListener('click', () => {
  state.deck = { ...state.deck, id: null, name: `${state.deck.name} 副本` };
  renderAll(); flash('已作为新卡组，保存后生效');
});
$('#btn-clear').addEventListener('click', () => { state.deck.cards = {}; renderAll(); });
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(pack(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${state.deck.name}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#btn-import').addEventListener('click', () => { $('#import-text').value = ''; $('#import-dialog').showModal(); });
$('#btn-import-confirm').addEventListener('click', () => {
  try { adopt(JSON.parse($('#import-text').value)); $('#import-dialog').close(); flash('已导入'); }
  catch (error) { flash(`导入失败：${error.message}`); }
});
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try { adopt(JSON.parse(await file.text())); $('#import-dialog').close(); flash('已导入'); }
  catch (error) { flash(`读取失败：${error.message}`); }
});
$('#saved-list').addEventListener('click', (e) => {
  const load = e.target.closest('[data-load]');
  if (load) {
    const d = loadStore().find((x) => x.id === load.dataset.load);
    if (d) { adopt(d); renderSaved(); }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    saveStore(loadStore().filter((x) => x.id !== del.dataset.del));
    if (state.deck.id === del.dataset.del) state.deck.id = null;
    renderSaved();
  }
});
$('#precon-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-precon]'); if (!b) return;
  const name = b.dataset.precon;
  state.deck = { id: null, name, spirit: SPIRIT_DATA[0].name, cards: { ...PRECONS[name] } };
  renderAll();
});
$$('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
});

// ── 启动 ─────────────────────────────────────────────
$('#deck-spirit').innerHTML = SPIRIT_DATA.map((s) =>
  `<option value="${esc(s.name)}">${esc(s.color)}·${esc(s.name)}</option>`).join('');
buildFilters();
renderPrecons();
renderSaved();
renderAll();
