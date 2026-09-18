import path from 'node:path';
import { validateImplementationPlan } from '../../../domain/project/implementation-plan-validation.mjs';
import { fail, projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import { IMPLEMENTATION_PLAN_FILE, SPEC_FILE, TASKS_FILE } from '../../../domain/project/project.js';
import type { Task, TaskCollection } from '../../../domain/task/task.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { readText, writeYaml } from '../../../infrastructure/filesystem/index.js';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { lifecycle } from '../../../domain/work-item/lifecycle.js';
import { findTask, loadTaskContext } from '../task-context.js';

export function runStart(target: string | undefined, args: readonly string[]): void {
  const root = projectRoot(args);
  const context = loadTaskContext(root, target);
  const task = findTask(context.tasks.tasks, target);

  ensureWorkItemIsNotBlocked(root, context.item);
  ensureNoTaskIsInProgress(context.tasks);
  ensureDependenciesAreCompleted(context.item, task, context.tasks);
  ensureCurrentImplementationPlan(root, context.item);

  task.state = 'in_progress';
  writeYaml(context.tasksFile, context.tasks);
  writeOutput(`${target} started.`);
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

function ensureCurrentImplementationPlan(root: string, item: LoadedWorkItem): void {
  const planFile = path.join(item.base, IMPLEMENTATION_PLAN_FILE);
  const engineeringFile = path.join(root, '_flow', 'docs', 'engineering.md');
  const result = validateImplementationPlan(readText(planFile), {
    workItem: item.id,
    engineeringText: readText(engineeringFile),
    specText: readText(path.join(item.base, SPEC_FILE)),
    tasksText: readText(path.join(item.base, TASKS_FILE))
  });
  if (result.errors.length) fail(`${item.id} requires a current implementation plan: ${result.errors.join(', ')}.`);
}
