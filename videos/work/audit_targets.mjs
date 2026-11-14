/**
 * 对局体检：找出「需要己方灵像目标、但在己方战场为空时仍然打出」的动作。
 * 这类动作在卡面上不成立（成本是破坏／强化自己场上 1 张灵像），是引擎的目标数下限缺陷。
 * 用法：node videos/work/audit_targets.mjs <match.json> [more.json ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetGroups } from '../../js/engine/effects.js';
import { SE01_TARGETS } from '../../js/engine/effects.se01.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 需要「己方灵像」作为必需目标的卡：旧卡与第一弹共用一张表。 */
function requiresOwnUnit(name) {
  const groups = [
    ...(targetGroups(name, 'main', 'main') || []),
    ...Object.values(SE01_TARGETS[name] || {}).flat().filter((x) => x && typeof x === 'object'),
  ];
  return groups.some((spec) => spec && spec.kind === 'unit' && spec.side === 'own' && spec.min == null && !spec.dream);
}

const files = process.argv.slice(2);
for (const rel of files) {
  const match = JSON.parse(fs.readFileSync(path.resolve(ROOT, rel), 'utf8'));
  const hits = [];
  for (let i = 0; i < match.steps.length; i++) {
    const step = match.steps[i];
    const text = step.text || '';
    const before = i > 0 ? match.steps[i - 1].snap : step.snap;
    const m = text.match(/使用【(.+?)】/) || text.match(/横置【(.+?)】启动能力/);
    if (!m) continue;
    const card = m[1];
    if (!requiresOwnUnit(card)) continue;
    const owner = before.P.find((p) => text.startsWith(p.name));
    if (!owner) continue;
    if (owner.field.filter((c) => c.type === '灵像' || c.token).length === 0) {
      hits.push({ index: i, turn: step.snap.turn, who: owner.name, card, kind: text.includes('横置') ? '启动' : '使用' });
    }
  }
  console.log(rel, '｜步骤', match.steps.length, '｜空场目标缺失', hits.length);
  for (const h of hits) console.log('  ', h.index, 'T' + h.turn, h.who, h.kind + '【' + h.card + '】');
}
