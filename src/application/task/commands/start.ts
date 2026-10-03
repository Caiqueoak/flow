import { fail, projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import type { Task, TaskCollection } from '../../../domain/task/task.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { writeYaml } from '../../../infrastructure/filesystem/index.js';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { loadExecutionState, writeExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';
import { lifecycle } from '../../../domain/work-item/lifecycle.js';
import { validateConcurrentTaskState } from '../../../domain/work-item/concurrency.mjs';
import { inspectRecovery } from '../../recovery/recovery.mjs';
import { findTask, loadTaskContext } from '../task-context.js';

export function runStart(target: string | undefined, args: readonly string[]): void {
  const root = projectRoot(args);
  const context = loadTaskContext(root, target);
  const task = findTask(context.tasks.tasks, target);

  ensureWorkItemIsNotBlocked(root, context.item);
  ensureDependenciesAreCompleted(context.item, task, context.tasks);
  ensureRecoveryAllowsExecution(root);

  const state = loadExecutionState(root);
  const effectiveWorkItem = state.active.work_item ?? context.item.id;
  const allItems = loadWorkItems(root) as LoadedWorkItem[];
  const prospective = prospectiveItems(allItems, context.item.id, context.tasks, task);
  const issues = validateConcurrentTaskState(prospective, effectiveWorkItem, { checkpointActive: false });
  if (issues.length) {
    fail(`Cannot start ${context.item.id}-${task.id}: ${issues.map((issue) => issue.message).join(' ')}`);
  }

  const previousWorkItem = state.active.work_item;
  state.active.work_item = effectiveWorkItem;
  writeExecutionState(root, state);

  try {
    task.state = 'in_progress';
    writeYaml(context.tasksFile, context.tasks);
  } catch (error) {
    state.active.work_item = previousWorkItem;
    writeExecutionState(root, state);
    throw error;
  }

  writeOutput(`${target} started.`);
}

function ensureWorkItemIsNotBlocked(root: string, item: LoadedWorkItem): void {
  const allItems = loadWorkItems(root) as LoadedWorkItem[];
  const workItemsById = new Map(allItems.map((candidate) => [candidate.id, candidate]));

  if (lifecycle(item, workItemsById).status === 'blocked') {
    fail(`${item.id} is blocked.`);
  }
}

function ensureRecoveryAllowsExecution(root: string): void {
  const recovery = inspectRecovery(root);
  if (recovery.classification !== 'resumable' || recovery.checkpoint) {
    fail('Task execution is blocked until the active recovery/checkpoint state is resolved.');
  }
}

function prospectiveItems(
  items: LoadedWorkItem[],
  workItemId: LoadedWorkItem['id'],
  tasks: TaskCollection,
  task: Task
): LoadedWorkItem[] {
  return items.map((item) =>
    item.id === workItemId
      ? {
          ...item,
          tasks: {
            ...tasks,
            tasks: tasks.tasks.map((candidate) =>
              candidate.id === task.id ? { ...candidate, state: 'in_progress' as const } : candidate
            )
          }
        }
      : item
  );
}

function ensureDependenciesAreCompleted(item: LoadedWorkItem, task: Task, tasks: TaskCollection): void {
  const dependenciesCompleted = task.depends_on.every(
    (dependencyId) => tasks.tasks.find((candidate) => candidate.id === dependencyId)?.state === 'completed'
  );

  if (!dependenciesCompleted) {
    fail(`${item.id}-${task.id} has incomplete dependencies.`);
  }
}
