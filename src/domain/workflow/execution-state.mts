import { parseDocument, stringify } from 'yaml';
import { UserInputError as ArtifactValidationError } from '../errors.js';
import { type WorkItemId, WORK_ITEM_ID } from '../work-item/work-item.js';
import { parseCheckpoint, type Checkpoint } from './checkpoint.mjs';
import { STATE_SCHEMA_VERSION } from './workflow.js';

const LEGACY_STATE_SCHEMA_VERSION = 2;
const MIGRATION_STATUSES = ['not_required', 'pending_reconciliation', 'completed'] as const;

export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

export interface ExecutionState {
  schema_version: typeof STATE_SCHEMA_VERSION;
  migration: { status: MigrationStatus };
  active: { work_item: WorkItemId | null };
  checkpoint: Checkpoint | null;
}

export function emptyState(): ExecutionState {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    migration: { status: 'not_required' },
    active: { work_item: null },
    checkpoint: null
  };
}

export function parseState(text: string, { source = 'state.yaml' }: { source?: string } = {}): ExecutionState {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const value: unknown = document.toJS();
  if (!isRecord(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);

  if (value.schema_version === LEGACY_STATE_SCHEMA_VERSION) return parseLegacyState(value, source);
  if (value.schema_version !== STATE_SCHEMA_VERSION)
    throw new ArtifactValidationError(
      `${source} schema_version must be ${LEGACY_STATE_SCHEMA_VERSION} or ${STATE_SCHEMA_VERSION}.`
    );

  if (!isRecord(value.migration)) throw new ArtifactValidationError(`${source} migration must be a mapping.`);
  if (!isRecord(value.active)) throw new ArtifactValidationError(`${source} active must be a mapping.`);
  if (!Object.hasOwn(value, 'checkpoint')) throw new ArtifactValidationError(`${source} checkpoint must be present.`);

  return {
    schema_version: STATE_SCHEMA_VERSION,
    migration: { status: migrationStatus(value.migration.status, `${source} migration.status`) },
    active: { work_item: workItem(value.active.work_item ?? null, `${source} active.work_item`) },
    checkpoint: value.checkpoint === null ? null : parseCheckpoint(value.checkpoint, { source: `${source} checkpoint` })
  };
}

export function stringifyState(state: ExecutionState): string {
  const text = stringify(state, { lineWidth: 0 });
  parseState(text);
  return text;
}

function parseLegacyState(value: Record<string, unknown>, source: string): ExecutionState {
  const migration = isRecord(value.migration) ? value.migration : {};
  const active = isRecord(value.active) ? value.active : {};
  return {
    schema_version: STATE_SCHEMA_VERSION,
    migration: { status: migrationStatus(migration.status ?? 'not_required', `${source} migration.status`) },
    active: { work_item: workItem(active.work_item ?? null, `${source} active.work_item`) },
    checkpoint: null
  };
}

function migrationStatus(value: unknown, label: string): MigrationStatus {
  if (typeof value !== 'string' || !(MIGRATION_STATUSES as readonly string[]).includes(value))
    throw new ArtifactValidationError(`${label} is invalid.`);
  return value as MigrationStatus;
}

function workItem(value: unknown, label: string): WorkItemId | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !WORK_ITEM_ID.test(value)) throw new ArtifactValidationError(`${label} is invalid.`);
  return value as WorkItemId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
