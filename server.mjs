import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const value = (key, fallback) => {
  const i = args.indexOf(key);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const inline = args.find((x) => x.startsWith(`${key}=`));
  return inline ? inline.slice(key.length + 1) : fallback;
};
const host = value('--host', '127.0.0.1');
const port = Number(value('--port', process.env.PORT || 7100));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad URL'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filename).pipe(res);
  });
});
server.on('error', (error) => { console.error(`观战台启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Soul Echo 观战台：http://${host}:${port}/`));
