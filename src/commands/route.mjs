import fs from 'node:fs';
import path from 'node:path';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { loadWorkItems, lifecycle } from '../artifacts/work-items.mjs';
import { parseState } from '../artifacts/state.mjs';

const step = (phase, instruction, extra = {}) => ({ action: 'continue', phase, instruction, ...extra });

function migrationRoute(root) {
  const file = path.join(root, '_flow', 'state.yaml');
  if (!fs.existsSync(file)) return null;
  const state = parseState(fs.readFileSync(file, 'utf8'));
  return state.migration.status === 'pending_reconciliation'
    ? step('reconcile', 'migration/step-01-reconcile.md')
    : null;
}

export function routeProject(root) {
  const migration = migrationRoute(root);
  if (migration) return migration;

  const items = loadWorkItems(root),
    by = new Map(items.map((i) => [i.id, i]));
  const active = items.find((i) => lifecycle(i, by).status === 'in_progress');
  if (active) {
    const task = active.tasks.tasks.find((t) => t.state === 'in_progress');
    return step('implementation', 'build/step-01-execute-task.md', {
      work_item: active.id,
      task: `${active.id}-${task.id}`
    });
  }
  const candidate = items
    .filter((i) => ['outlined', 'eligible', 'review'].includes(lifecycle(i, by).status))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))[0];
  if (!candidate)
    return {
      action: 'stop',
      reason:
        items.length && items.every((i) => lifecycle(i, by).status === 'completed') ? 'finished' : 'external_action'
    };
  const state = lifecycle(candidate, by).status;
  if (state === 'outlined')
    return step('specification', 'specification/step-01-deepen-spec.md', { work_item: candidate.id });
  if (state === 'review') return step('review', 'review/step-01-review-work-item.md', { work_item: candidate.id });
  if (!candidate.tasks.tasks.length)
    return step('planning', 'planning/step-01-create-tasks.md', { work_item: candidate.id });
  const task = candidate.tasks.tasks.find(
    (t) =>
      t.state === 'pending' &&
      t.depends_on.every((d) => candidate.tasks.tasks.find((x) => x.id === d)?.state === 'completed')
  );
  return task
    ? step('implementation', 'build/step-01-execute-task.md', {
        work_item: candidate.id,
        task: `${candidate.id}-${task.id}`
      })
    : step('reconcile', 'reconcile/step-01-reconcile.md', { work_item: candidate.id });
}
export function runRoute({ args }) {
  const r = routeProject(projectRoot(args));
  info(
    args.includes('--json')
      ? JSON.stringify(r, null, 2)
      : `${r.action}: ${r.phase ?? r.reason}${r.work_item ? ` ${r.work_item}` : ''}`
  );
}
