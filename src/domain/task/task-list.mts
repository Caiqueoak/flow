import { parseDocument } from 'yaml';
import { ArtifactValidationError } from '../work-item/backlog.mjs';
import {
  LIFECYCLE_STATES,
  TASKS_SCHEMA_VERSION,
  TASK_ID as TASK_ID_PATTERN,
  type LifecycleState,
  type QualifiedTaskId,
  type Task,
  type TaskCollection,
  type TaskId
} from './task.js';
import { WORK_ITEM_ID, type WorkItemId } from '../work-item/work-item.js';

const STATES = new Set(LIFECYCLE_STATES);
const TASK_ID = TASK_ID_PATTERN;

function fail(message: string): never {
  throw new ArtifactValidationError(message);
}
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a mapping.`);
  return value as Record<string, unknown>;
}
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}

export function parseTasks(
  text: string,
  { source = 'tasks.yaml', expectedWorkItem = null }: { source?: string; expectedWorkItem?: string | null } = {}
): TaskCollection {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) fail(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const value = requireObject(document.toJS(), source);
  if (value.schema_version !== TASKS_SCHEMA_VERSION) fail(`${source} schema_version must be ${TASKS_SCHEMA_VERSION}.`);
  const workItem = requireString(value.work_item, `${source} work_item`);
  if (!WORK_ITEM_ID.test(workItem)) fail(`${source} work_item must use W followed by a zero-padded numeric sequence.`);
  if (expectedWorkItem && workItem !== expectedWorkItem)
    fail(`${source} belongs to ${workItem}, expected ${expectedWorkItem}.`);
  if (!Array.isArray(value.tasks)) fail(`${source} tasks must be a list.`);
  const ids = new Set<string>();
  const tasks = value.tasks.map((raw: unknown, index: number): Task => {
    const label = `tasks[${index}]`;
    const task = requireObject(raw, label);
    const id = requireString(task.id, `${label}.id`);
    if (!TASK_ID.test(id)) fail(`${label}.id must use T followed by a zero-padded numeric sequence, e.g. T003.`);
    if (ids.has(id)) fail(`${source} contains duplicate task ID '${id}'.`);
    ids.add(id);
    const title = requireString(task.title, `${label}.title`);
    const state = task.state ?? task.status;
    if (typeof state !== 'string' || !STATES.has(state as LifecycleState))
      fail(`${label}.state must be pending, in_progress, or completed.`);
    if (!Array.isArray(task.depends_on ?? [])) fail(`${label}.depends_on must be a list.`);
    const rawDependencies = (task.depends_on ?? []) as unknown[];
    const dependencies = [...new Set(rawDependencies)];
    if (dependencies.length !== rawDependencies.length) fail(`${id} contains duplicate task dependencies.`);
    for (const dependency of dependencies) {
      if (typeof dependency !== 'string') fail(`${id} depends on invalid task ID '${String(dependency)}'.`);
      if (!TASK_ID.test(dependency)) fail(`${id} depends on invalid task ID '${dependency}'.`);
      if (dependency === id) fail(`${id} cannot depend on itself.`);
    }
    if (
      Object.hasOwn(task, 'traceability') ||
      Object.hasOwn(task, 'implementation') ||
      Object.hasOwn(task, 'commit_sha')
    )
      fail(`${id}: traceability, implementation and commit_sha are retired.`);
    if (task.provenance !== undefined && task.provenance !== 'legacy_migration')
      fail(`${id}.provenance must be legacy_migration when present.`);
    if (task.provenance === 'legacy_migration' && state !== 'completed')
      fail(`${id}: legacy_migration is reserved for completed migrated tasks.`);
    return {
      id: id as TaskId,
      title,
      state: state as LifecycleState,
      depends_on: dependencies as TaskId[],
      ...(task.provenance ? { provenance: 'legacy_migration' as const } : {}),
      ...(task.legacy_commit ? { legacy_commit: task.legacy_commit as string } : {})
    };
  });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks)
    for (const dependency of task.depends_on)
      if (!byId.has(dependency)) fail(`${task.id} depends on unknown task '${dependency}'.`);
  validateTaskDag(tasks);
  if (tasks.filter((task) => task.state === 'in_progress').length > 1)
    fail('Only one mutating task may be in_progress.');
  return { schema_version: TASKS_SCHEMA_VERSION, work_item: workItem as WorkItemId, tasks };
}

function validateTaskDag(tasks: Task[]): void {
  const indegree = new Map(tasks.map((task) => [task.id, task.depends_on.length]));
  const dependents = new Map<TaskId, TaskId[]>(tasks.map((task) => [task.id, []]));
  for (const task of tasks) for (const dependency of task.depends_on) dependents.get(dependency)?.push(task.id);
  const queue = tasks.filter((task) => task.depends_on.length === 0).map((task) => task.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    if (!id) break;
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (visited !== tasks.length) fail('tasks.yaml task dependencies contain a cycle.');
}

export function qualifiedTaskId(workItem: WorkItemId, task: TaskId): QualifiedTaskId {
  return `${workItem}-${task}` as QualifiedTaskId;
}
