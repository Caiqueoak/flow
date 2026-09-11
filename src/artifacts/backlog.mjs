import { parseDocument } from 'yaml';

export class ArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArtifactValidationError';
  }
}

const KINDS = new Set(['feature', 'technical', 'maintenance']);
const STATES = new Set(['pending', 'in_progress', 'completed']);
const WORK_ITEM_ID = /^W\d{3,}$/;
const WORK_ITEM_FOLDER = /^w\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function parseBacklog(text, { source = 'backlog.yaml' } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) fail(`${source} is invalid: ${document.errors[0].message}`);
  const backlog = requireObject(document.toJS(), source);
  if (backlog.schema_version !== 1) fail(`${source} schema_version must be 1.`);
  if (!Array.isArray(backlog.work_items)) fail(`${source} work_items must be a list.`);

  const ids = new Set();
  const items = backlog.work_items.map((raw, index) => {
    const label = `work_items[${index}]`;
    const item = requireObject(raw, label);
    const id = requireString(item.id, `${label}.id`);
    if (!WORK_ITEM_ID.test(id)) fail(`${label}.id must use W followed by a zero-padded numeric sequence, e.g. W015.`);
    if (ids.has(id)) fail(`${source} contains duplicate work-item ID '${id}'.`);
    ids.add(id);

    const folder = requireString(item.folder ?? item.path, `${label}.folder`);
    if (!WORK_ITEM_FOLDER.test(folder)) fail(`${label}.folder must use lowercase w###-kebab-case, e.g. w015-learner-web-application.`);
    const numericId = id.slice(1);
    if (!folder.startsWith(`w${numericId}-`)) fail(`${label}.folder must preserve the numeric sequence from ${id}.`);

    if (!KINDS.has(item.kind)) fail(`${label}.kind must be feature, technical, or maintenance.`);
    const title = requireString(item.title, `${label}.title`);
    const state = item.state ?? item.status;
    if (!STATES.has(state)) fail(`${label}.state must be pending, in_progress, or completed.`);
    if (!Number.isInteger(item.priority) || item.priority < 1) fail(`${label}.priority must be a positive integer.`);
    if (!Array.isArray(item.depends_on ?? [])) fail(`${label}.depends_on must be a list.`);
    if (!Array.isArray(item.blockers ?? [])) fail(`${label}.blockers must be a list when present.`);

    const dependencies = [];
    const seenDependencies = new Set();
    for (const rawDependency of item.depends_on ?? []) {
      const dependency = requireString(rawDependency, `${label}.depends_on entry`);
      if (!WORK_ITEM_ID.test(dependency)) fail(`${label}.depends_on contains invalid work-item ID '${dependency}'.`);
      if (dependency === id) fail(`Work item '${id}' cannot depend on itself.`);
      if (seenDependencies.has(dependency)) fail(`Work item '${id}' lists dependency '${dependency}' more than once.`);
      seenDependencies.add(dependency);
      dependencies.push(dependency);
    }

    return {
      id,
      folder,
      kind: item.kind,
      title,
      state,
      priority: item.priority,
      depends_on: dependencies,
      blockers: item.blockers ?? []
    };
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    for (const dependency of item.depends_on) {
      if (!byId.has(dependency)) fail(`Work item '${item.id}' depends on unknown work item '${dependency}'.`);
    }
  }
  validateAcyclic(items);
  return { schema_version: 1, work_items: items };
}

export function validateAcyclic(items) {
  const indegree = new Map(items.map((item) => [item.id, item.depends_on.length]));
  const dependents = new Map(items.map((item) => [item.id, []]));
  for (const item of items) for (const dependency of item.depends_on) dependents.get(dependency).push(item.id);
  const queue = items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
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
  if (visited !== items.length) fail('backlog.yaml work-item dependencies contain a cycle.');
}

export function deriveExecutionStatus(item, byId) {
  if (item.state === 'completed') return { status: 'completed', reasons: [] };
  if (item.state === 'in_progress') return { status: 'in_progress', reasons: [] };
  const incompleteDependencies = item.depends_on.filter((id) => byId.get(id)?.state !== 'completed');
  const explicitBlockers = item.blockers ?? [];
  if (incompleteDependencies.length || explicitBlockers.length) {
    return {
      status: 'blocked',
      reasons: [
        ...incompleteDependencies.map((id) => ({ type: 'dependency', ref: id })),
        ...explicitBlockers
      ]
    };
  }
  return { status: 'ready', reasons: [] };
}

export function topologicalOrder(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const remaining = new Map(items.map((item) => [item.id, item.depends_on.length]));
  const dependents = new Map(items.map((item) => [item.id, []]));
  for (const item of items) for (const dependency of item.depends_on) dependents.get(dependency).push(item.id);
  const compare = (a, b) => a.localeCompare(b);
  for (const ids of dependents.values()) ids.sort(compare);
  const ready = items.filter((item) => item.depends_on.length === 0).map((item) => item.id).sort(compare);
  const levels = new Map(ready.map((id) => [id, 0]));
  const orderedIds = [];
  while (ready.length) {
    const id = ready.shift();
    orderedIds.push(id);
    for (const dependent of dependents.get(id)) {
      levels.set(dependent, Math.max(levels.get(dependent) ?? 0, (levels.get(id) ?? 0) + 1));
      const count = remaining.get(dependent) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort(compare);
      }
    }
  }
  return orderedIds.map((id) => byId.get(id)).sort((a, b) => (levels.get(a.id) - levels.get(b.id)) || compare(a.id, b.id));
}
