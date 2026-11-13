/** 零依赖 CDP 浏览器验证；运行时自动启动并在 finally 中关闭服务器与 Chrome。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'verification');
const profile = path.join(root, '.browser-check');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(profile, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    try { if (await fn()) return; } catch { /* 页面导航期间重试 */ }
    await sleep(100);
  }
  throw new Error(`等待超时：${description}`);
}

try {
  server = spawn(process.execPath, ['server.mjs', '--host', '127.0.0.1', '--port', '7100'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverError = '';
  server.stderr.on('data', (x) => { serverError += x; });
  await waitFor(async () => {
    try { const r = await fetch('http://127.0.0.1:7100/'); return r.ok; } catch { return false; }
  }, '本地服务器');
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executable = candidates.find((x) => fs.existsSync(x));
  assert.ok(executable, '未找到 Chrome / Edge');
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=9224', '--remote-allow-origins=*', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
  let target;
  await waitFor(async () => {
    try { const list = await (await fetch('http://127.0.0.1:9224/json/list')).json(); target = list.find((x) => x.type === 'page'); return !!target; } catch { return false; }
  }, 'Chrome CDP');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const cdp = new Cdp(ws);
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const waitExpr = (expression, description) => waitFor(() => evaluate(`!!(${expression})`), description);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:7100/' });
  await waitExpr(`document.readyState === 'complete' && document.title.includes('Soul Echo') && document.querySelector('#deck-a')`, '页面与模块加载');
  assert.equal(await evaluate(`document.querySelectorAll('button').length >= 9`), true);
  await evaluate(`document.querySelector('#btn-start').click()`);
  await waitExpr(`document.querySelector('#status').textContent.includes('完成：')`, '完整对局生成', 30000);
  await evaluate(`document.querySelector('#btn-play').click()`); // 停止自动播放
  const initialStatus = await evaluate(`document.querySelector('#status').textContent`);
  const max = await evaluate(`Number(document.querySelector('#timeline').max)`);
  assert.ok(max > 50, '应产生足够的事件快照');
  await evaluate(`var t=document.querySelector('#timeline');t.value=0;t.dispatchEvent(new Event('input',{bubbles:true}))`);
  const firstEvent = await evaluate(`document.querySelector('#current-event').textContent`);
  await evaluate(`document.querySelector('#btn-next').click()`);
  assert.match(await evaluate(`document.querySelector('#progress').textContent`), /^1 \//);
  await evaluate(`document.querySelector('#btn-prev').click()`);
  assert.match(await evaluate(`document.querySelector('#progress').textContent`), /^0 \//);
  await evaluate(`document.querySelector('#btn-play').click()`);
  await sleep(800);
  await evaluate(`document.querySelector('#btn-play').click()`);
  assert.ok(Number(await evaluate(`document.querySelector('#timeline').value`)) > 0, '播放应推进快照');
  await evaluate(`document.querySelector('#btn-restart').click()`);
  await waitExpr(`document.querySelector('#status').textContent.includes('完成：')`, '同种子重开', 30000);
  await evaluate(`document.querySelector('#btn-play').click()`);
  assert.equal(await evaluate(`document.querySelector('#status').textContent`), initialStatus, '同种子应产生相同事件数');
  await evaluate(`var t=document.querySelector('#timeline');t.value=0;t.dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#current-event').textContent`), firstEvent, '同种子首个事件一致');
  await evaluate(`var t=document.querySelector('#timeline');t.value=Math.min(100,Number(t.max));t.dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.ok(await evaluate(`document.querySelectorAll('.game-card').length > 0`));
  await evaluate(`document.querySelector('.game-card').click()`);
  await waitExpr(`document.querySelector('#card-dialog').open`, '卡牌详情弹窗');
  await evaluate(`document.querySelector('[data-close="card-dialog"]').click()`);
  await evaluate(`document.querySelector('#btn-about').click()`);
  await waitExpr(`document.querySelector('#about-dialog').open`, '实现范围弹窗');
  await evaluate(`document.querySelector('[data-close="about-dialog"]').click()`);
  await evaluate(`document.querySelector('#btn-export').click()`);
  assert.match(await evaluate(`document.querySelector('#status').textContent`), /已导出/);
  const desktop = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(out, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  const desktopMetrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:document.querySelectorAll('button').length,resources:performance.getEntriesByType('resource').length})`);
  assert.ok(desktopMetrics.scroll <= desktopMetrics.width, '桌面不得横向溢出');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  const mobileMetrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,minButton:Math.min(...[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.getBoundingClientRect().height))})`);
  assert.ok(mobileMetrics.scroll <= mobileMetrics.width, `手机横向溢出：${mobileMetrics.scroll}/${mobileMetrics.width}`);
  assert.ok(mobileMetrics.minButton >= 43, '触控按钮高度应约 44px');
  const mobile = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(out, 'mobile.png'), Buffer.from(mobile.data, 'base64'));

  const consoleErrors = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  const httpErrors = cdp.events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map((e) => ({ status: e.params.response.status, url: e.params.response.url }));
  assert.deepEqual(httpErrors, [], '不得有 404 / HTTP 错误');
  assert.deepEqual(consoleErrors, [], '不得有浏览器脚本异常');
  const report = { ok: true, executable, maxSteps: max, desktop: desktopMetrics, mobile: mobileMetrics, httpErrors, consoleErrors: consoleErrors.length, checks: ['页面加载', '生成对局', '播放推进', '暂停', '上一步', '下一步', '同种子重开', '卡牌详情', '实现范围', '导出回放', '桌面无横向溢出', '手机无横向溢出', '触控目标', '零控制台错误', '零 HTTP 错误'] };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
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
