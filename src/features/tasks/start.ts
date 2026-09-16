import path from 'node:path';
import { lifecycle, loadWorkItems } from '../../artifacts/work-items.mjs';
import { fail } from '../../shared/cli-io.mjs';
import { IMPLEMENTATION_PLAN_FILE } from '../../shared/domain/constants.js';
import type { Task, TaskCollection } from '../../shared/domain/task.js';
import type { LoadedWorkItem } from '../../shared/domain/work-item.js';
import { isImplementationPlanApproved } from '../../shared/documents/implementation-plan.js';
import { readText, writeYaml } from '../../shared/filesystem/files.js';

export function startTask(
  root: string,
  item: LoadedWorkItem,
  tasksFile: string,
  tasks: TaskCollection,
  task: Task
): void {
  ensureWorkItemIsNotBlocked(root, item);
  ensureNoTaskIsInProgress(tasks);
  ensureDependenciesAreCompleted(item, task, tasks);
  ensureApprovedImplementationPlan(item);

  task.state = 'in_progress';
  writeYaml(tasksFile, tasks);
}

function ensureWorkItemIsNotBlocked(root: string, item: LoadedWorkItem): void {
  const allItems = loadWorkItems(root) as LoadedWorkItem[];
  const workItemsById = new Map(allItems.map((candidate) => [candidate.id, candidate]));

  if (lifecycle(item, workItemsById).status === 'blocked') {
    fail(`${item.id} is blocked.`);
  }
}

function ensureNoTaskIsInProgress(tasks: TaskCollection): void {
  if (tasks.tasks.some((candidate) => candidate.state === 'in_progress')) {
    fail('Another task is already in_progress.');
  }
}

function ensureDependenciesAreCompleted(item: LoadedWorkItem, task: Task, tasks: TaskCollection): void {
  const dependenciesCompleted = task.depends_on.every(
    (dependencyId) => tasks.tasks.find((candidate) => candidate.id === dependencyId)?.state === 'completed'
  );

  if (!dependenciesCompleted) {
    fail(`${item.id}-${task.id} has incomplete dependencies.`);
  }
}

function ensureApprovedImplementationPlan(item: LoadedWorkItem): void {
  const planFile = path.join(item.base, IMPLEMENTATION_PLAN_FILE);

  if (!isImplementationPlanApproved(readText(planFile))) {
    fail(`${item.id} requires an approved implementation plan.`);
  }
}
