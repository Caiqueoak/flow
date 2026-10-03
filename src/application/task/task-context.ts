import path from 'node:path';
import { loadWorkItems } from '../../infrastructure/persistence/work-items.mjs';
import { loadExecutionState, writeExecutionState } from '../../infrastructure/persistence/execution-state.mjs';
import { parseTasks } from '../../domain/task/task-list.mjs';
import { fail } from '../command-runtime.js';
import { ID_PADDING, TASKS_FILE } from '../../domain/project/project.js';
import { TASK_ID_PREFIX, type Task, type TaskCollection, type TaskId } from '../../domain/task/task.js';
import type { LoadedWorkItem } from '../../domain/work-item/work-item.js';
import { readText } from '../../infrastructure/filesystem/index.js';
import { isWorkItemSpecApproved } from '../../domain/work-item/specification.mjs';
import { inspectRecovery } from '../recovery/recovery.mjs';

const parseTasksBoundary = parseTasks as unknown as (
  text: string,
  options: { expectedWorkItem: string }
) => TaskCollection;

export interface TaskContext {
  item: LoadedWorkItem;
  tasksFile: string;
  tasks: TaskCollection;
}

export function loadTaskContext(root: string, target: string | undefined): TaskContext {
  const workItemId = workItemIdFromTaskTarget(target);
  const item = (loadWorkItems(root) as LoadedWorkItem[]).find((candidate) => candidate.id === workItemId);

  if (!item) {
    fail(`Unknown work-item '${workItemId}'.`);
  }

  ensureWorkItemReady(item!);

  const tasksFile = path.join(item!.base, TASKS_FILE);
  const tasks = parseTasksBoundary(readText(tasksFile), { expectedWorkItem: item!.id });

  return { item: item!, tasksFile, tasks };
}

export function beginTaskDecomposition(root: string, workItemId: LoadedWorkItem['id']): () => void {
  const recovery = inspectRecovery(root);
  if (recovery.classification !== 'resumable') {
    fail('Task decomposition is blocked until the active recovery state is resolved.');
  }
  if (recovery.continuation?.work_item && recovery.continuation.work_item !== workItemId) {
    fail(
      `Task decomposition for ${workItemId} is blocked while recovery is focused on ${recovery.continuation.work_item}.`
    );
  }

  const state = loadExecutionState(root);
  if (state.active.work_item && state.active.work_item !== workItemId) {
    fail(
      `Task decomposition for ${workItemId} is blocked while state.active.work_item is ${state.active.work_item}.`
    );
  }
  if (state.active.work_item === workItemId) return () => {};

  const previousActive = { ...state.active };
  state.active.work_item = workItemId;
  writeExecutionState(root, state);

  return () => {
    state.active = previousActive;
    writeExecutionState(root, state);
  };
}

export function findTask(tasks: readonly Task[], target: string | undefined): Task {
  const localTaskId = target?.match(/T\d{3,}$/)?.[0];
  const task = tasks.find((candidate) => candidate.id === localTaskId);

  if (!task) {
    fail(`Unknown task '${target}'.`);
  }

  return task!;
}

export function nextTaskId(tasks: readonly Task[]): TaskId {
  const highestId = tasks.reduce((highest, task) => Math.max(highest, Number(task.id.slice(1))), 0);
  return `${TASK_ID_PREFIX}${String(highestId + 1).padStart(ID_PADDING, '0')}` as TaskId;
}

function workItemIdFromTaskTarget(target: string | undefined): string {
  return (target ?? '').split('-T')[0] ?? '';
}

function ensureWorkItemReady(item: LoadedWorkItem): void {
  if (item.maturity !== 'ready') {
    fail(`${item.id} is outlined; promote its complete spec first.`);
  }
  if (!isWorkItemSpecApproved(readText(path.join(item.base, 'spec.md')), { expectedWorkItem: item.id })) {
    fail(`${item.id} requires an approved specification.`);
  }
}
