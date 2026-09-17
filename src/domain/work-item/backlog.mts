import { parseDocument } from 'yaml';
import {
  BACKLOG_SCHEMA_VERSION,
  SPEC_MATURITIES,
  WORK_ITEM_ID as WORK_ITEM_ID_PATTERN,
  type Blocker,
  type SpecMaturity,
  type WorkItemId,
  type WorkItemKind
} from './work-item.js';
import { LIFECYCLE_STATES, type LifecycleState } from '../task/task.js';

export interface BacklogItem {
  id: WorkItemId;
  folder: string;
  kind: WorkItemKind;
  title: string;
  state: LifecycleState;
  priority: number;
  spec_maturity: SpecMaturity;
  depends_on: WorkItemId[];
  blockers: Blocker[];
  objective?: string;
  boundaries: unknown[];
  requirements: unknown[];
  provides: unknown[];
  consumes: unknown[];
  dependency_rationale: Record<string, unknown>;
}

export interface Backlog {
  schema_version: number;
  work_items: BacklogItem[];
}

interface DependencyItem {
  id: string;
  depends_on: string[];
}

export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactValidationError';
  }
}

const KINDS = new Set(['feature', 'technical', 'maintenance']);
const STATES = new Set(LIFECYCLE_STATES);
const SPEC_MATURITY = new Set(SPEC_MATURITIES);
const WORK_ITEM_ID = WORK_ITEM_ID_PATTERN;
const WORK_ITEM_FOLDER = /^W\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function parseBacklog(text: string, { source = 'backlog.yaml' }: { source?: string } = {}): Backlog {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) fail(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const backlog = requireObject(document.toJS(), source);
  if (backlog.schema_version !== BACKLOG_SCHEMA_VERSION)
    fail(`${source} schema_version must be ${BACKLOG_SCHEMA_VERSION}.`);
  if (!Array.isArray(backlog.work_items)) fail(`${source} work_items must be a list.`);

  const ids = new Set<string>();
  const items = backlog.work_items.map((raw: unknown, index: number): BacklogItem => {
    const label = `work_items[${index}]`;
    const item = requireObject(raw, label);
    const id = requireString(item.id, `${label}.id`);
    if (!WORK_ITEM_ID.test(id)) fail(`${label}.id must use W followed by a zero-padded numeric sequence, e.g. W015.`);
    if (ids.has(id)) fail(`${source} contains duplicate work-item ID '${id}'.`);
    ids.add(id);

    const folder = requireString(item.folder ?? item.path, `${label}.folder`);
    if (!WORK_ITEM_FOLDER.test(folder))
      fail(`${label}.folder must use W###-kebab-case, e.g. W015-learner-web-application.`);
    const numericId = id.slice(1);
    if (!folder.startsWith(`W${numericId}-`)) fail(`${label}.folder must preserve the numeric sequence from ${id}.`);

    if (typeof item.kind !== 'string' || !KINDS.has(item.kind))
      fail(`${label}.kind must be feature, technical, or maintenance.`);
    const title = requireString(item.title, `${label}.title`);
    const state = item.state ?? item.status;
    if (typeof state !== 'string' || !STATES.has(state as LifecycleState))
      fail(`${label}.state must be pending, in_progress, or completed.`);
    if (typeof item.priority !== 'number' || !Number.isInteger(item.priority) || item.priority < 1)
      fail(`${label}.priority must be a positive integer.`);
    const specMaturity = item.spec_maturity ?? (item.state === 'pending' ? 'outlined' : 'ready');
    if (typeof specMaturity !== 'string' || !SPEC_MATURITY.has(specMaturity as SpecMaturity))
      fail(`${label}.spec_maturity must be outlined or ready.`);
    if (state !== 'pending' && specMaturity !== 'ready')
      fail(`${id}: in_progress or completed work must have spec_maturity ready.`);
    const rawDependencies = item.depends_on ?? [];
    const rawBlockers = item.blockers ?? [];
    if (!Array.isArray(rawDependencies)) fail(`${label}.depends_on must be a list.`);
    if (!Array.isArray(rawBlockers)) fail(`${label}.blockers must be a list when present.`);

    const dependencies: WorkItemId[] = [];
    const seenDependencies = new Set<string>();
    for (const rawDependency of rawDependencies) {
      const dependency = requireString(rawDependency, `${label}.depends_on entry`);
      if (!WORK_ITEM_ID.test(dependency)) fail(`${label}.depends_on contains invalid work-item ID '${dependency}'.`);
      if (dependency === id) fail(`Work item '${id}' cannot depend on itself.`);
      if (seenDependencies.has(dependency)) fail(`Work item '${id}' lists dependency '${dependency}' more than once.`);
      seenDependencies.add(dependency);
      dependencies.push(dependency as WorkItemId);
    }

    return {
      id: id as WorkItemId,
      folder,
      kind: item.kind as WorkItemKind,
      title,
      state: state as LifecycleState,
      priority: item.priority as number,
      spec_maturity: specMaturity as SpecMaturity,
      depends_on: dependencies,
      blockers: rawBlockers.map((rawBlocker: unknown): Blocker => {
        const blocker = requireObject(rawBlocker, `${id} blocker`);
        if (typeof blocker.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(blocker.id))
          fail(`${id} blocker.id must be stable kebab-case.`);
        if (typeof blocker.type !== 'string' || !['external_action', 'consequential_decision'].includes(blocker.type))
          fail(`${id} blocker.type is invalid.`);
        requireString(blocker.description, `${id} blocker.description`);
        if (typeof blocker.status !== 'string' || !['unresolved', 'resolved'].includes(blocker.status))
          fail(`${id} blocker.status is invalid.`);
        return blocker as unknown as Blocker;
      }),
      ...(item.objective ? { objective: requireString(item.objective, `${label}.objective`) } : {}),
      boundaries: Array.isArray(item.boundaries) ? item.boundaries : [],
      requirements: Array.isArray(item.requirements) ? item.requirements : [],
      provides: Array.isArray(item.provides) ? item.provides : [],
      consumes: Array.isArray(item.consumes) ? item.consumes : [],
      dependency_rationale: isRecord(item.dependency_rationale) ? item.dependency_rationale : {}
    };
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    for (const dependency of item.depends_on) {
      if (!byId.has(dependency)) fail(`Work item '${item.id}' depends on unknown work item '${dependency}'.`);
    }
  }
  validateAcyclic(items);
  if (items.filter((item) => item.state === 'in_progress').length > 1)
    fail('Only one mutating work item may be in_progress.');
  return { schema_version: BACKLOG_SCHEMA_VERSION, work_items: items };
}

export function validateAcyclic(items: readonly DependencyItem[]): void {
  const indegree = new Map(items.map((item) => [item.id, item.depends_on.length]));
  const dependents = new Map<string, string[]>(items.map((item) => [item.id, []]));
  for (const item of items) for (const dependency of item.depends_on) dependents.get(dependency)?.push(item.id);
  const queue = items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
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
  if (visited !== items.length) fail('backlog.yaml work-item dependencies contain a cycle.');
}

export interface ExecutionStatus {
  status: 'completed' | 'blocked' | 'in_progress' | 'eligible';
  reasons: Array<{ type: 'dependency' | 'blocker'; ref: string; blocker_type?: string }>;
}

export function deriveExecutionStatus(item: BacklogItem, byId: ReadonlyMap<string, BacklogItem>): ExecutionStatus {
  if (item.state === 'completed') return { status: 'completed', reasons: [] };
  const incompleteDependencies = item.depends_on.filter((id) => byId.get(id)?.state !== 'completed');
  const unresolvedBlockers = item.blockers.filter((blocker) => blocker.status === 'unresolved');
  const reasons: ExecutionStatus['reasons'] = [
    ...incompleteDependencies.map((id) => ({ type: 'dependency' as const, ref: id })),
    ...unresolvedBlockers.map((blocker) => ({
      type: 'blocker' as const,
      ref: blocker.id,
      blocker_type: blocker.type
    }))
  ];
  if (reasons.length) return { status: 'blocked', reasons };
  return { status: item.state === 'in_progress' ? 'in_progress' : 'eligible', reasons: [] };
}

export function topologicalOrder<T extends DependencyItem>(items: readonly T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const remaining = new Map(items.map((item) => [item.id, item.depends_on.length]));
  const dependents = new Map<string, string[]>(items.map((item) => [item.id, []]));
  for (const item of items) for (const dependency of item.depends_on) dependents.get(dependency)?.push(item.id);
  const compare = (a: string, b: string) => a.localeCompare(b);
  for (const ids of dependents.values()) ids.sort(compare);
  const ready = items
    .filter((item) => item.depends_on.length === 0)
    .map((item) => item.id)
    .sort(compare);
  const levels = new Map<string, number>(ready.map((id) => [id, 0]));
  const orderedIds: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    orderedIds.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      levels.set(dependent, Math.max(levels.get(dependent) ?? 0, (levels.get(id) ?? 0) + 1));
      const count = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort(compare);
      }
    }
  }
  return orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined)
    .sort((a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0) || compare(a.id, b.id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
