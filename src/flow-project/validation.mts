// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stringify, parseDocument } from 'yaml';
import { loadWorkItems, derivedBacklog, lifecycle } from './work-items.mjs';
import { validateSpec } from '../artifacts/work-item-specification.mjs';
import { generateGraphMarkdown } from '../artifacts/backlog-graph.mjs';
export function validateProject(root, { preCommitTask = null, workItem = null } = {}) {
  const findings = [],
    error = (code, message) => findings.push({ level: 'error', code, message });
  let items;
  try {
    items = loadWorkItems(root);
  } catch (e) {
    error('WORK_ITEMS', e.message);
    return findings;
  }
  const by = new Map(items.map((i) => [i.id, i]));
  for (const item of items) {
    if (workItem && item.id !== workItem) continue;
    const spec = validateSpec(fs.readFileSync(path.join(item.base, 'spec.md'), 'utf8'), { expectedWorkItem: item.id });
    for (const message of spec.errors) error('SPEC', `${item.id}: ${message}`);
    if (item.maturity === 'outlined' && item.tasks.tasks.length)
      error('TASKS', `${item.id}: outlined work cannot have tasks.`);
    if (item.tasks.tasks.filter((t) => t.state === 'in_progress').length > 1)
      error('TASKS', `${item.id}: only one task can be in_progress.`);
    if (lifecycle(item, by).status === 'completed' && item.review.status !== 'approved')
      error('REVIEW', `${item.id}: completed work requires approved review.`);
  }
  if (preCommitTask) {
    try {
      const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean);
      if (staged.some((f) => f.replace(/\\/g, '/').startsWith('_flow/generated/')))
        error('SCOPE', `${preCommitTask}: generated projections cannot be committed.`);
    } catch (e) {
      error('SCOPE', e.message);
    }
  }
  const generated = path.join(root, '_flow', 'generated'),
    expected = derivedBacklog(items),
    backlog = stringify(expected, { lineWidth: 0 }),
    graph = generateGraphMarkdown(expected);
  for (const [name, text] of [
    ['backlog.yaml', backlog],
    ['graph.md', graph]
  ]) {
    const f = path.join(generated, name);
    if (!fs.existsSync(f)) error('PROJECTION_MISSING', `${name} is missing; run flow sync.`);
    else {
      const actual = fs.readFileSync(f, 'utf8');
      if (name.endsWith('.yaml') && parseDocument(actual, { prettyErrors: false }).errors.length)
        error('PROJECTION_INCONSISTENT', `${name} is malformed; run flow sync.`);
      else if (actual !== text) error('PROJECTION_STALE', `${name} differs from current canonical work-items.`);
    }
  }
  return findings;
}
