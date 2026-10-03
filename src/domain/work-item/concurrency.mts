import type { Task, TaskCollection, TaskId } from '../task/task.js';
import type { WorkItemId } from './work-item.js';

export type ConcurrencyIssueCode =
  | 'ACTIVE_WORK_ITEM_CONFLICT'
  | 'ACTIVE_WORK_ITEM_REQUIRED'
  | 'CROSS_WORK_ITEM_ACTIVE_TASKS'
  | 'CHECKPOINT_CONFLICT'
  | 'MISSING_MUTATION_CLAIMS'
  | 'DEPENDENCY_CONFLICT'
  | 'SURFACE_CONFLICT'
  | 'RESOURCE_CONFLICT';

export interface ConcurrencyIssue {
  code: ConcurrencyIssueCode;
  message: string;
}

export interface WorkItemTaskState {
  id: WorkItemId;
  tasks: TaskCollection;
}

export function normalizeMutationSurface(surface: string): string {
  const trimmed = surface.trim();
  if (!trimmed) throw new Error('Mutation surface must be a non-empty repository-relative path.');
  if (/^[A-Za-z]:/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\'))
    throw new Error(`Mutation surface must be repository-relative: '${surface}'.`);
  if (/[*?\[\]{}]/.test(trimmed)) throw new Error(`Mutation surface cannot use glob syntax: '${surface}'.`);

  const segments = trimmed.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..'))
    throw new Error(`Mutation surface cannot contain traversal: '${surface}'.`);

  const normalized = segments.filter((segment) => segment && segment !== '.').join('/');
  if (!normalized) throw new Error(`Mutation surface is invalid: '${surface}'.`);
  return normalized;
}

export function normalizeMutationSurfaces(surfaces: readonly string[]): string[] {
  const normalized = surfaces.map(normalizeMutationSurface);
  if (new Set(normalized).size !== normalized.length)
    throw new Error('Mutation surfaces must be unique after normalization.');
  return normalized;
}

export function normalizeMutationResources(resources: readonly string[]): string[] {
  const normalized = resources.map((resource) => resource.trim());
  if (normalized.some((resource) => !resource)) throw new Error('Mutation resources must be non-empty tokens.');
  if (new Set(normalized).size !== normalized.length) throw new Error('Mutation resources must be unique.');
  return normalized;
}

export function hasCompleteMutationClaim(task: Task): boolean {
  return Boolean(task.mutation?.surfaces?.length && task.mutation.resources !== undefined);
}

export function validateConcurrentTaskState(
  items: readonly WorkItemTaskState[],
  activeWorkItem: WorkItemId | null,
  { checkpointActive = false }: { checkpointActive?: boolean } = {}
): ConcurrencyIssue[] {
  const active = items.flatMap((item) =>
    item.tasks.tasks
      .filter((task) => task.state === 'in_progress')
      .map((task) => ({ workItem: item.id, task, tasks: item.tasks.tasks }))
  );
  if (!active.length) return [];

  const issues: ConcurrencyIssue[] = [];
  const activeWorkItems = new Set(active.map((entry) => entry.workItem));

  if (activeWorkItems.size > 1) {
    issues.push({
      code: 'CROSS_WORK_ITEM_ACTIVE_TASKS',
      message: `In-progress tasks span multiple work items: ${[...activeWorkItems].sort().join(', ')}.`
    });
  }

  if (activeWorkItem && active.some((entry) => entry.workItem !== activeWorkItem)) {
    issues.push({
      code: 'ACTIVE_WORK_ITEM_CONFLICT',
      message: `In-progress task state conflicts with state.active.work_item '${activeWorkItem}'.`
    });
  }

  if (active.length === 1) return issues;

  if (!activeWorkItem) {
    issues.push({
      code: 'ACTIVE_WORK_ITEM_REQUIRED',
      message: 'Concurrent in-progress tasks require state.active.work_item.'
    });
  }

  if (checkpointActive) {
    issues.push({
      code: 'CHECKPOINT_CONFLICT',
      message: 'Concurrent task execution is unsafe while a workflow checkpoint is active.'
    });
  }

  for (const entry of active) {
    if (!hasCompleteMutationClaim(entry.task)) {
      issues.push({
        code: 'MISSING_MUTATION_CLAIMS',
        message: `${entry.workItem}-${entry.task.id} requires mutation.surfaces and mutation.resources before concurrent execution.`
      });
    }
  }

  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left]!;
      const b = active[right]!;
      if (a.workItem !== b.workItem) continue;

      if (dependsTransitively(a.tasks, a.task.id, b.task.id) || dependsTransitively(a.tasks, b.task.id, a.task.id)) {
        issues.push({
          code: 'DEPENDENCY_CONFLICT',
          message: `${a.workItem}-${a.task.id} and ${b.workItem}-${b.task.id} have a direct or transitive dependency.`
        });
      }

      const surfaceConflict = firstSurfaceConflict(a.task, b.task);
      if (surfaceConflict) {
        issues.push({
          code: 'SURFACE_CONFLICT',
          message: `${a.workItem}-${a.task.id} and ${b.workItem}-${b.task.id} overlap at mutation surface '${surfaceConflict}'.`
        });
      }

      const resource = firstSharedResource(a.task, b.task);
      if (resource) {
        issues.push({
          code: 'RESOURCE_CONFLICT',
          message: `${a.workItem}-${a.task.id} and ${b.workItem}-${b.task.id} share mutation resource '${resource}'.`
        });
      }
    }
  }

  return issues;
}

export function validateConcurrentCommitFiles(
  task: Task,
  otherActiveTasks: readonly Task[],
  files: readonly string[]
): string[] {
  if (!otherActiveTasks.length) return [];
  if (!hasCompleteMutationClaim(task)) return [`${task.id} has no complete mutation claim.`];

  const ownSurfaces = task.mutation!.surfaces!;
  const otherSurfaces = otherActiveTasks.flatMap((candidate) => candidate.mutation?.surfaces ?? []);
  const findings: string[] = [];

  for (const rawFile of files) {
    const file = normalizeMutationSurface(rawFile);
    if (!ownSurfaces.some((surface) => pathIsWithinSurface(file, surface))) {
      findings.push(`${file} is outside ${task.id}'s declared mutation surfaces.`);
    }
    const conflictingSurface = otherSurfaces.find((surface) => pathIsWithinSurface(file, surface));
    if (conflictingSurface) {
      findings.push(`${file} enters another active task's mutation surface '${conflictingSurface}'.`);
    }
  }

  return findings;
}

export function pathIsWithinSurface(file: string, surface: string): boolean {
  return file === surface || file.startsWith(`${surface}/`);
}

function dependsTransitively(tasks: readonly Task[], from: TaskId, target: TaskId): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const pending = [...(byId.get(from)?.depends_on ?? [])];
  const visited = new Set<TaskId>();

  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(byId.get(current)?.depends_on ?? []));
  }

  return false;
}

function firstSurfaceConflict(left: Task, right: Task): string | null {
  for (const leftSurface of left.mutation?.surfaces ?? []) {
    for (const rightSurface of right.mutation?.surfaces ?? []) {
      if (pathIsWithinSurface(leftSurface, rightSurface) || pathIsWithinSurface(rightSurface, leftSurface)) {
        return leftSurface.length <= rightSurface.length ? leftSurface : rightSurface;
      }
    }
  }
  return null;
}

function firstSharedResource(left: Task, right: Task): string | null {
  const resources = new Set(left.mutation?.resources ?? []);
  return (right.mutation?.resources ?? []).find((resource) => resources.has(resource)) ?? null;
}
