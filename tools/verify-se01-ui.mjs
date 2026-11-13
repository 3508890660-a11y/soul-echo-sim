/** SE01 组卡器与双人对战的零依赖 CDP 验收；自动启停服务器与 Chrome。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'verification');
const profile = path.join(root, '.browser-check-se01');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(profile, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 7105, DEBUG = 9225;
let server, chrome, ws;

class Cdp {
  constructor(socket) {
    this.ws = socket; this.id = 0; this.pending = new Map(); this.events = [];
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}
async function waitFor(fn, description, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return; } catch { /* 导航期间重试 */ }
    await sleep(100);
  }
  throw new Error(`等待超时：${description}`);
}

const checks = [];
try {
  server = spawn(process.execPath, ['server.mjs', '--host', '127.0.0.1', '--port', String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${PORT}/deck.html`)).ok; } catch { return false; } }, '本地服务器');
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executable = candidates.find((x) => fs.existsSync(x));
  assert.ok(executable, '未找到 Chrome / Edge');
  chrome = spawn(executable, ['--headless=new', `--remote-debugging-port=${DEBUG}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
  let target;
  await waitFor(async () => {
    try { const list = await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json(); target = list.find((x) => x.type === 'page'); return !!target; } catch { return false; }
  }, 'Chrome CDP');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const cdp = new Cdp(ws);
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const waitExpr = (expr, desc, t) => waitFor(() => evaluate(`!!(${expr})`), desc, t);
  const goto = async (url, marker) => {
    await cdp.send('Page.navigate', { url });
    await waitExpr(`document.readyState === 'complete' && (${marker})`, `加载 ${url}`);
  };
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ── 组卡 ────────────────────────────────────────────
  await goto(`http://127.0.0.1:${PORT}/deck.html`, `document.querySelector('#pool')`);
  assert.equal(await evaluate(`document.querySelectorAll('.pool-card').length`), 140);
  checks.push('卡池渲染 140 名目');

  await evaluate(`document.querySelector('#filter-color [data-val="绿"]').click()`);
  await sleep(120);
  const greens = await evaluate(`document.querySelectorAll('.pool-card').length`);
  assert.ok(greens === 16, `绿色单色应有 16 张，实际 ${greens}`);
  checks.push(`绿色筛选 ${greens} 张`);

  await evaluate(`document.querySelector('#filter-color [data-val="混色"]').click()`);
  await sleep(120);
  const mixed = await evaluate(`document.querySelectorAll('.pool-card').length`);
  assert.equal(mixed, 12, `混色应有 12 张，实际 ${mixed}`);
  checks.push(`混色筛选 ${mixed} 张`);

  await evaluate(`document.querySelector('#filter-color [data-val="全部"]').click()`);
  await evaluate(`document.querySelector('#precon-list [data-precon="白色回复"]').click()`);
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('#deck-total').textContent`), '40');
  assert.equal(await evaluate(`document.querySelector('#deck-status').textContent`), '可对战');
  checks.push('预组载入 40 张且判定可对战');

  await evaluate(`document.querySelector('#filter-color [data-val="绿"]').click()`);
  await sleep(120);
  await evaluate(`document.querySelector('#pool .pool-card').click()`);
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector('#deck-total').textContent`), '41');
  checks.push('点击卡池 +1');

  await evaluate(`document.querySelector('#btn-save').click()`);
  await sleep(200);
  const saved = await evaluate(`JSON.parse(localStorage.getItem('soul-echo:decks:v1')||'[]').length`);
  assert.ok(saved >= 1, '应写入存档');
  checks.push('卡组写入 localStorage');

  await evaluate(`document.querySelector('#deck-spirit').value='根脉育苗者';document.querySelector('#deck-spirit').dispatchEvent(new Event('change',{bubbles:true}))`);
  checks.push('灵体切换');
  const deckShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'se01-deck.png'), Buffer.from(deckShot.data, 'base64'));

  // ── 双人对战 ────────────────────────────────────────
  await goto(`http://127.0.0.1:${PORT}/duel.html`, `document.querySelector('#deck-a')?.options.length > 0`);
  const deckOpts = await evaluate(`document.querySelector('#deck-a').options.length`);
  assert.ok(deckOpts >= 7, `卡组下拉应有预组＋存档，实际 ${deckOpts}`);
  checks.push(`对战卡组来源 ${deckOpts} 项`);

  await evaluate(`document.querySelector('#deck-a').value=[...document.querySelector('#deck-a').options].find(o=>o.value==='pre:绿色预组'||o.textContent.includes('白色回复')).value`);
  await evaluate(`document.querySelector('#deck-b').value=[...document.querySelector('#deck-b').options].find(o=>o.textContent.includes('红色快攻')).value`);
  await evaluate(`document.querySelector('#spirit-a').value='根脉育苗者'`);
  await evaluate(`document.querySelector('#spirit-b').value='余烬执火者'`);
  await evaluate(`document.querySelector('#privacy').checked=false;document.querySelector('#privacy').dispatchEvent(new Event('change',{bubbles:true}))`);
  await evaluate(`document.querySelector('#btn-start').click()`);
  await waitExpr(`!document.querySelector('#layout').hidden`, '对战界面展开');
  const cards0 = await evaluate(`document.querySelectorAll('#side-me .game-card').length`);
  assert.ok(cards0 > 0, '我方应有手牌渲染');
  assert.ok((await evaluate(`document.querySelector('#side-opp').textContent`)).includes('生命'));
  checks.push('开局渲染双方区域');
  const duelShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'se01-duel.png'), Buffer.from(duelShot.data, 'base64'));

  // 真正打出卡牌：逐张点手牌，出现「使用」按钮就执行；否则设灵质或让过。
  const played = [];
  for (let round = 0; round < 40 && played.length < 3; round++) {
    const label = await evaluate(`(()=>{
      const cards=[...document.querySelectorAll('#side-me .hand-row .game-card')];
      for(const c of cards){
        c.click();
        const b=[...document.querySelectorAll('#actionbar .ab-move')].find(x=>!x.textContent.includes('设为灵质'));
        if(b){ const t=b.textContent; b.click(); return t; }
      }
      return null;
    })()`);
    if (label) { played.push(label); await sleep(140); continue; }
    const set = await evaluate(`(()=>{
      const cards=[...document.querySelectorAll('#side-me .hand-row .game-card')];
      for(const c of cards){
        c.click();
        const b=[...document.querySelectorAll('#actionbar .ab-move')].find(x=>x.textContent.includes('设为灵质'));
        if(b){ b.click(); return true; }
      }
      return false;
    })()`);
    if (!set) await evaluate(`document.querySelector('#btn-pass').click()`);
    await sleep(90);
  }
  assert.ok(played.length >= 1, `应至少打出一张牌，实际 ${played.length}`);
  checks.push(`实际出牌 ${played.length} 张（示例：${played[0] || '—'}）`);

  let passes = 0, turns = new Set();
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!document.querySelector('#handoff').hidden`)) {
      await evaluate(`document.querySelector('#handoff-ok').click()`);
      await sleep(40);
    }
    const ok = await evaluate(`(()=>{const b=document.querySelector('#btn-pass');if(b.disabled||!b.offsetParent)return false;b.click();return true})()`);
    if (!ok) break;
    passes++;
    turns.add(await evaluate(`document.querySelector('#turn-label').textContent`));
    await sleep(45);
    if (await evaluate(`document.querySelector('#phase-label').textContent === '对局结束'`)) break;
  }
  assert.ok(passes > 10, `应能连续让过推进，实际 ${passes}`);
  assert.ok(turns.size >= 3, `应跨越多个回合，实际 ${turns.size}`);
  checks.push(`连续让过 ${passes} 次，跨越 ${turns.size} 个回合标签`);

  const logLines = await evaluate(`document.querySelectorAll('#log .logline').length`);
  assert.ok(logLines > 3, '对局日志应持续增长');
  checks.push(`日志 ${logLines} 条`);

  const duelMetrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);
  assert.ok(duelMetrics.scroll <= duelMetrics.width, '对战页不得横向溢出');
  checks.push('对战页无横向溢出');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  const mobile = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);
  assert.ok(mobile.scroll <= mobile.width, `手机横向溢出 ${mobile.scroll}/${mobile.width}`);
  checks.push('对战页手机无横向溢出');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(out, 'se01-duel-mobile.png'), Buffer.from(shot.data, 'base64'));

  const consoleErrors = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  const httpErrors = cdp.events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map((e) => ({ status: e.params.response.status, url: e.params.response.url }));
  assert.deepEqual(httpErrors, [], '不得有 HTTP 错误');
  assert.deepEqual(consoleErrors.map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.args?.[0]?.value || e.method), [], '不得有浏览器异常');
  checks.push('零 HTTP 错误、零控制台异常');

  const report = { ok: true, executable, checks };
  fs.writeFileSync(path.join(out, 'se01-ui.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await cdp.send('Browser.close').catch(() => {});
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (ws) try { ws.close(); } catch {}
  if (chrome && chrome.exitCode == null) chrome.kill();
  if (server && server.exitCode == null) server.kill();
  await sleep(400);
  fs.rmSync(profile, { recursive: true, force: true });
}
