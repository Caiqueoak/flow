import fs from 'node:fs';
import path from 'node:path';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { deriveExecutionStatus, parseBacklog } from '../artifacts/backlog.mjs';
import { routeProject } from './route.mjs';

export function runStatus({ args }) {
  const root = projectRoot(args);
  if (!fs.existsSync(path.join(root, '.flow', 'backlog.yaml')))
    return info(`Next: ${routeProject(root).phase ?? 'setup'}`);
  const backlog = parseBacklog(fs.readFileSync(path.join(root, '.flow', 'backlog.yaml'), 'utf8'));
  const byId = new Map(backlog.work_items.map((item) => [item.id, item]));
  const groups = new Map(['in_progress', 'ready', 'blocked', 'completed'].map((status) => [status, []]));
  for (const item of backlog.work_items) {
    const derived = deriveExecutionStatus(item, byId);
    groups.get(derived.status).push({ ...item, reasons: derived.reasons });
  }
  const lines = [];
  for (const [status, items] of groups) {
    if (!items.length) continue;
    lines.push(status.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()));
    for (const item of items) {
      const deps = item.reasons.filter((r) => r.type === 'dependency').map((r) => r.ref);
      lines.push(`  ${item.id} — ${item.title}${deps.length ? ` ← ${deps.join(', ')}` : ''}`);
      for (const reason of item.reasons.filter((reason) => reason.type !== 'dependency'))
        lines.push(`    ${reason.type}: ${reason.description} [${reason.id}]`);
    }
    lines.push('');
  }
  info(lines.join('\n').trim());
}
