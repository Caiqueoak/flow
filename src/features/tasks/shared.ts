import path from 'node:path';
import { loadWorkItems } from '../../artifacts/work-items.mjs';
import { parseTasks } from '../../artifacts/tasks.mjs';
import { fail } from '../../shared/cli-io.mjs';
import { ID_PADDING, TASKS_FILE, TASK_ID_PREFIX } from '../../shared/domain/constants.js';
import type { Task, TaskCollection, TaskId } from '../../shared/domain/task.js';
import type { LoadedWorkItem } from '../../shared/domain/work-item.js';
import { readText } from '../../shared/filesystem/files.js';

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
}
