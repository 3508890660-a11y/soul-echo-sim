/**
 * 子代理进度上报。
 * 用法：node tools/report-agent-progress.mjs <id> <status> <progress> <phase> <note>
 *   status：pending / running / completed / failed
 *   progress：0—100
 *   例：node tools/report-agent-progress.mjs hy4 running 40 "设计策略" "选定薄牌护城河"
 *
 * 只写 agent-progress/<id>.json；设计说明 agent-progress/<id>.md 由脚本作者自己撰写。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'agent-progress');
const [id, status = 'running', progress = '0', phase = '', note = ''] = process.argv.slice(2);

if (!id) {
  console.error('用法：node tools/report-agent-progress.mjs <id> <status> <progress> <phase> <note>');
  process.exit(2);
}

fs.mkdirSync(DIR, { recursive: true });
const file = path.join(DIR, `${id}.json`);
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

const payload = {
  ...prev,
  id,
  status,
  progress: Math.max(0, Math.min(100, Number(progress) || 0)),
  phase: phase || prev.phase || '',
  note: note || prev.note || '',
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`[${id}] ${status} ${payload.progress}% ${payload.phase}${payload.note ? ` — ${payload.note}` : ''}`);
