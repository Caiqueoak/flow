import path from 'node:path';
import { projectRoot, recordOutput as info } from '../../command-runtime.js';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { lifecycle } from '../../../domain/work-item/lifecycle.js';
import { parseState } from '../../../domain/workflow/execution-state.mjs';
import { fileExists, readText } from '../../../infrastructure/filesystem/index.js';
import { isWorkItemSpecApproved } from '../../../domain/work-item/specification.mjs';
import { validateImplementationPlan } from '../../../domain/project/implementation-plan-validation.mjs';
import { IMPLEMENTATION_PLAN_FILE, SPEC_FILE, TASKS_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';

interface RouteResult {
  action: 'continue' | 'stop';
  phase?: string;
  instruction?: string;
  reason?: string;
  work_item?: string;
  task?: string;
}

const step = (phase: string, instruction: string, extra: Partial<RouteResult> = {}): RouteResult => ({
  action: 'continue',
  phase,
  instruction,
  ...extra
});

function migrationRoute(root: string): RouteResult | null {
  const file = path.join(root, '_flow', 'state.yaml');
  if (!fileExists(file)) return null;
  const state = parseState(readText(file));
  return state.migration.status === 'pending_reconciliation'
    ? step('reconcile', 'migration/step-01-reconcile.md')
    : null;
}

function hasCurrentImplementationBrief(root: string, item: LoadedWorkItem): boolean {
  const planFile = path.join(item.base, IMPLEMENTATION_PLAN_FILE);
  const engineeringFile = path.join(root, '_flow', 'docs', 'engineering.md');
  if (!fileExists(planFile) || !fileExists(engineeringFile)) return false;

  const result = validateImplementationPlan(readText(planFile), {
    workItem: item.id,
    engineeringText: readText(engineeringFile),
    specText: readText(path.join(item.base, SPEC_FILE)),
    tasksText: readText(path.join(item.base, TASKS_FILE))
  });

  return result.errors.length === 0;
}

export function routeProject(root: string): RouteResult {
  const migration = migrationRoute(root);
  if (migration) return migration;

  const items = loadWorkItems(root),
    by = new Map(items.map((i) => [i.id, i]));
  const active = items.find((i) => lifecycle(i, by).status === 'in_progress');
  if (active) {
    const task = active.tasks.tasks.find((t) => t.state === 'in_progress');
    return step('implementation', 'build/step-01-execute-task.md', {
      work_item: active.id,
      task: `${active.id}-${task!.id}`
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
  if (!isWorkItemSpecApproved(readText(path.join(candidate.base, SPEC_FILE)), { expectedWorkItem: candidate.id }))
    return {
      action: 'stop',
      reason: 'consequential_decision',
      phase: 'specification',
      instruction: 'specification/step-02-await-approval.md',
      work_item: candidate.id
    };
  if (state === 'review') return step('review', 'review/step-01-review-work-item.md', { work_item: candidate.id });
  if (!candidate.tasks.tasks.length)
    return step('planning', 'planning/step-01-create-tasks.md', { work_item: candidate.id });
  if (!hasCurrentImplementationBrief(root, candidate))
    return step('planning', 'planning/step-02-prepare-plan.md', { work_item: candidate.id });
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
export function runRoute({ args }: { args: string[] }): void {
  const r = routeProject(projectRoot(args));
  info(
    args.includes('--json')
      ? JSON.stringify(r, null, 2)
      : `${r.action}: ${r.phase ?? r.reason}${r.work_item ? ` ${r.work_item}` : ''}`
  );
}
