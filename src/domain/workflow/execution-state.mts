import { parseDocument, stringify } from 'yaml';
import { UserInputError as ArtifactValidationError } from '../errors.js';
import { STATE_SCHEMA_VERSION, WORKFLOW } from './workflow.js';
import { WORK_ITEM_ID, type WorkItemId } from '../work-item/work-item.js';
import { QUALIFIED_TASK_ID, type QualifiedTaskId } from '../task/task.js';

const PHASES = new Set(Object.keys(WORKFLOW));
export const WORKFLOW_STEPS = WORKFLOW;
const STOP_REASONS = new Set([null, 'consequential_decision', 'external_action', 'unrecoverable_blocker', 'finished']);

type WorkflowPhase = keyof typeof WORKFLOW;
type WorkflowStep = (typeof WORKFLOW)[WorkflowPhase][number];
type StopReason = 'consequential_decision' | 'external_action' | 'unrecoverable_blocker' | 'finished' | null;
type MigrationStatus = 'not_required' | 'pending_reconciliation' | 'completed';

export interface ExecutionState {
  schema_version: number;
  execution: { phase: WorkflowPhase; step: WorkflowStep };
  active: { work_item: WorkItemId | null; task: QualifiedTaskId | null };
  stop_reason: StopReason;
  migration: { status: MigrationStatus };
}

export function emptyState(): ExecutionState {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    execution: { phase: 'discovery', step: 'define_problem' },
    active: { work_item: null, task: null },
    stop_reason: null,
    migration: { status: 'not_required' }
  };
}

export function parseState(text: string, { source = 'state.yaml' }: { source?: string } = {}): ExecutionState {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const value: unknown = document.toJS();
  if (!isRecord(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (value.schema_version !== STATE_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${STATE_SCHEMA_VERSION}.`);
  const execution = isRecord(value.execution) ? value.execution : {};
  const phase = execution.phase;
  if (typeof phase !== 'string' || !PHASES.has(phase))
    throw new ArtifactValidationError(`${source} execution.phase is invalid.`);
  const typedPhase = phase as WorkflowPhase;
  const step = execution.step;
  if (typeof step !== 'string' || !(WORKFLOW_STEPS[typedPhase] as readonly string[]).includes(step))
    throw new ArtifactValidationError(`${source} execution.step '${step}' is invalid for phase '${phase}'.`);
  const stopReason = value.stop_reason ?? null;
  if (!STOP_REASONS.has(stopReason as StopReason))
    throw new ArtifactValidationError(`${source} stop_reason is invalid.`);
  const migration = isRecord(value.migration) ? value.migration : {};
  const migrationStatus = migration.status ?? 'not_required';
  if (!['not_required', 'pending_reconciliation', 'completed'].includes(String(migrationStatus)))
    throw new ArtifactValidationError(`${source} migration.status is invalid.`);
  const active = isRecord(value.active) ? value.active : {};
  const activeWorkItem = active.work_item ?? null;
  const activeTask = active.task ?? null;
  if (activeWorkItem !== null && (typeof activeWorkItem !== 'string' || !WORK_ITEM_ID.test(activeWorkItem)))
    throw new ArtifactValidationError(`${source} active.work_item is invalid.`);
  if (activeTask !== null && (typeof activeTask !== 'string' || !QUALIFIED_TASK_ID.test(activeTask)))
    throw new ArtifactValidationError(`${source} active.task is invalid.`);
  if (activeTask && activeWorkItem && !activeTask.startsWith(`${activeWorkItem}-`))
    throw new ArtifactValidationError(`${source} active.task does not belong to active.work_item.`);
  return {
    schema_version: STATE_SCHEMA_VERSION,
    execution: {
      phase: typedPhase,
      step: step as WorkflowStep
    },
    active: {
      work_item: activeWorkItem as WorkItemId | null,
      task: activeTask as QualifiedTaskId | null
    },
    stop_reason: stopReason as StopReason,
    migration: { status: migrationStatus as MigrationStatus }
  };
}

export function stringifyState(state: ExecutionState): string {
  return stringify(state, { lineWidth: 0 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
