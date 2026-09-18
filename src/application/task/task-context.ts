import path from 'node:path';
import { loadWorkItems } from '../../infrastructure/persistence/work-items.mjs';
import { parseTasks } from '../../domain/task/task-list.mjs';
import { fail } from '../command-runtime.js';
import { ID_PADDING, TASKS_FILE } from '../../domain/project/project.js';
import { TASK_ID_PREFIX, type Task, type TaskCollection, type TaskId } from '../../domain/task/task.js';
import type { LoadedWorkItem } from '../../domain/work-item/work-item.js';
import { readText } from '../../infrastructure/filesystem/index.js';
import { isWorkItemSpecApproved } from '../../domain/work-item/specification.mjs';

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
