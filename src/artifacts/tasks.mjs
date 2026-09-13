import { parseDocument } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';

const STATES = new Set(['pending', 'in_progress', 'completed']);
const TASK_ID = /^T\d{3,}$/;

function fail(message) {
  throw new ArtifactValidationError(message);
}
function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a mapping.`);
  return value;
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}

export function parseTasks(text, { source = 'tasks.yaml', expectedWorkItem = null } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) fail(`${source} is invalid: ${document.errors[0].message}`);
  const value = requireObject(document.toJS(), source);
  if (value.schema_version !== 1) fail(`${source} schema_version must be 1.`);
  const workItem = requireString(value.work_item, `${source} work_item`);
  if (expectedWorkItem && workItem !== expectedWorkItem)
    fail(`${source} belongs to ${workItem}, expected ${expectedWorkItem}.`);
  if (!Array.isArray(value.tasks)) fail(`${source} tasks must be a list.`);
  const ids = new Set();
  const tasks = value.tasks.map((raw, index) => {
    const label = `tasks[${index}]`;
    const task = requireObject(raw, label);
    const id = requireString(task.id, `${label}.id`);
    if (!TASK_ID.test(id)) fail(`${label}.id must use T followed by a zero-padded numeric sequence, e.g. T003.`);
    if (ids.has(id)) fail(`${source} contains duplicate task ID '${id}'.`);
    ids.add(id);
    const title = requireString(task.title, `${label}.title`);
    const state = task.state ?? task.status;
    if (!STATES.has(state)) fail(`${label}.state must be pending, in_progress, or completed.`);
    if (!Array.isArray(task.depends_on ?? [])) fail(`${label}.depends_on must be a list.`);
    const dependencies = [...new Set(task.depends_on ?? [])];
    if (dependencies.length !== (task.depends_on ?? []).length) fail(`${id} contains duplicate task dependencies.`);
    for (const dependency of dependencies) {
      if (!TASK_ID.test(dependency)) fail(`${id} depends on invalid task ID '${dependency}'.`);
      if (dependency === id) fail(`${id} cannot depend on itself.`);
    }
    const implementation = task.implementation ?? 'commit';
    if (!['commit', 'none', 'legacy'].includes(implementation))
      fail(`${id}.implementation must be commit, none or legacy.`);
    if (implementation === 'legacy' && state !== 'completed')
      fail(`${id}: legacy is reserved for completed migrated tasks.`);
    return {
      id,
      title,
      state,
      depends_on: dependencies,
      implementation,
      ...(task.legacy_commit ? { legacy_commit: task.legacy_commit } : {})
    };
  });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks)
    for (const dependency of task.depends_on)
      if (!byId.has(dependency)) fail(`${task.id} depends on unknown task '${dependency}'.`);
  validateTaskDag(tasks);
  if (tasks.filter((task) => task.state === 'in_progress').length > 1)
    fail('Only one mutating task may be in_progress.');
  return { schema_version: 1, work_item: workItem, tasks };
}

function validateTaskDag(tasks) {
  const indegree = new Map(tasks.map((task) => [task.id, task.depends_on.length]));
  const dependents = new Map(tasks.map((task) => [task.id, []]));
  for (const task of tasks) for (const dependency of task.depends_on) dependents.get(dependency).push(task.id);
  const queue = tasks.filter((task) => task.depends_on.length === 0).map((task) => task.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    for (const dependent of dependents.get(id)) {
      const next = indegree.get(dependent) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (visited !== tasks.length) fail('tasks.yaml task dependencies contain a cycle.');
}

export function qualifiedTaskId(workItem, task) {
  return `${workItem}-${task}`;
}
