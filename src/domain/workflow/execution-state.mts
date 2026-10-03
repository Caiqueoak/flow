import { parseDocument, stringify } from 'yaml';
import { UserInputError as ArtifactValidationError } from '../errors.js';
import { WORK_ITEM_ID, type WorkItemId } from '../work-item/work-item.js';
import { QUALIFIED_TASK_ID_PATTERN, type QualifiedTaskId } from '../task/task.js';
import { parseCheckpoint, type WorkflowCheckpoint } from './checkpoint.mjs';
import { STATE_SCHEMA_VERSION } from './workflow.js';

type MigrationStatus = 'not_required' | 'pending_reconciliation' | 'completed';
export const WORKSPACE_STRATEGIES = ['shared', 'isolated'] as const;
export type WorkspaceStrategy = (typeof WORKSPACE_STRATEGIES)[number];

export interface ActiveConcurrency {
  tasks: QualifiedTaskId[];
  workspace: WorkspaceStrategy;
}

export interface ExecutionState {
  schema_version: number;
  active: { work_item: WorkItemId | null; concurrency: ActiveConcurrency | null };
  checkpoint: WorkflowCheckpoint | null;
  migration: { status: MigrationStatus };
}

export function emptyState(): ExecutionState {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    active: { work_item: null, concurrency: null },
    checkpoint: null,
    migration: { status: 'not_required' }
  };
}

export function parseState(text: string, { source = 'state.yaml' }: { source?: string } = {}): ExecutionState {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const value: unknown = document.toJS();
  if (!isRecord(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);

  if (value.schema_version === 2) return parseLegacyState(value, source);
  if (value.schema_version !== STATE_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be 2 or ${STATE_SCHEMA_VERSION}.`);

  return {
    schema_version: STATE_SCHEMA_VERSION,
    active: {
      work_item: parseActiveWorkItem(value.active, source),
      concurrency: parseActiveConcurrency(value.active, source)
    },
    checkpoint: value.checkpoint === undefined || value.checkpoint === null ? null : parseCheckpoint(value.checkpoint),
    migration: { status: parseMigrationStatus(value.migration, source) }
  };
}

export function stringifyState(state: ExecutionState): string {
  const canonical = parseState(stringify(state, { lineWidth: 0 }));
  return stringify(canonical, { lineWidth: 0 });
}

function parseLegacyState(value: Record<string, unknown>, source: string): ExecutionState {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    active: { work_item: null, concurrency: null },
    checkpoint: null,
    migration: { status: parseMigrationStatus(value.migration, source) }
  };
}

function parseActiveWorkItem(value: unknown, source: string): WorkItemId | null {
  const active = isRecord(value) ? value : {};
  const workItem = active.work_item ?? null;
  if (workItem !== null && (typeof workItem !== 'string' || !WORK_ITEM_ID.test(workItem)))
    throw new ArtifactValidationError(`${source} active.work_item is invalid.`);
  return workItem as WorkItemId | null;
}

function parseActiveConcurrency(value: unknown, source: string): ActiveConcurrency | null {
  const active = isRecord(value) ? value : {};
  const concurrency = active.concurrency ?? null;
  if (concurrency === null) return null;
  if (!isRecord(concurrency)) throw new ArtifactValidationError(`${source} active.concurrency is invalid.`);

  const workspace = concurrency.workspace;
  if (typeof workspace !== 'string' || !WORKSPACE_STRATEGIES.includes(workspace as WorkspaceStrategy))
    throw new ArtifactValidationError(`${source} active.concurrency.workspace is invalid.`);

  const taskPattern = new RegExp(QUALIFIED_TASK_ID_PATTERN);
  const tasks = concurrency.tasks;
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.some((task) => typeof task !== 'string' || !taskPattern.test(task)) || new Set(tasks).size !== tasks.length)
    throw new ArtifactValidationError(`${source} active.concurrency.tasks is invalid.`);

  return { tasks: [...tasks].sort() as QualifiedTaskId[], workspace: workspace as WorkspaceStrategy };
}

function parseMigrationStatus(value: unknown, source: string): MigrationStatus {
  const migration = isRecord(value) ? value : {};
  const status = migration.status ?? 'not_required';
  if (!['not_required', 'pending_reconciliation', 'completed'].includes(String(status)))
    throw new ArtifactValidationError(`${source} migration.status is invalid.`);
  return status as MigrationStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
