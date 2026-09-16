// @ts-nocheck
import { parseDocument, stringify } from 'yaml';
import { ArtifactValidationError } from '../artifacts/backlog.mjs';
import { STATE_SCHEMA_VERSION, WORKFLOW, WORK_ITEM_ID, QUALIFIED_TASK_ID } from '../contracts/contracts.js';

const PHASES = new Set(Object.keys(WORKFLOW));
export const WORKFLOW_STEPS = WORKFLOW;
const STOP_REASONS = new Set([null, 'consequential_decision', 'external_action', 'unrecoverable_blocker', 'finished']);

export function emptyState() {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    execution: { phase: 'discovery', step: 'define_problem' },
    active: { work_item: null, task: null },
    stop_reason: null,
    migration: { status: 'not_required' }
  };
}

export function parseState(text, { source = 'state.yaml' } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (value.schema_version !== STATE_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${STATE_SCHEMA_VERSION}.`);
  const phase = value.execution?.phase;
  if (!PHASES.has(phase)) throw new ArtifactValidationError(`${source} execution.phase is invalid.`);
  const step = value.execution?.step;
  if (!WORKFLOW_STEPS[phase].includes(step))
    throw new ArtifactValidationError(`${source} execution.step '${step}' is invalid for phase '${phase}'.`);
  if (!STOP_REASONS.has(value.stop_reason ?? null))
    throw new ArtifactValidationError(`${source} stop_reason is invalid.`);
  if (!['not_required', 'pending_reconciliation', 'completed'].includes(value.migration?.status ?? 'not_required'))
    throw new ArtifactValidationError(`${source} migration.status is invalid.`);
  const activeWorkItem = value.active?.work_item ?? null;
  const activeTask = value.active?.task ?? null;
  if (activeWorkItem !== null && !WORK_ITEM_ID.test(activeWorkItem))
    throw new ArtifactValidationError(`${source} active.work_item is invalid.`);
  if (activeTask !== null && !QUALIFIED_TASK_ID.test(activeTask))
    throw new ArtifactValidationError(`${source} active.task is invalid.`);
  if (activeTask && activeWorkItem && !activeTask.startsWith(`${activeWorkItem}-`))
    throw new ArtifactValidationError(`${source} active.task does not belong to active.work_item.`);
  return {
    schema_version: STATE_SCHEMA_VERSION,
    execution: {
      phase,
      step
    },
    active: {
      work_item: activeWorkItem,
      task: activeTask
    },
    stop_reason: value.stop_reason ?? null,
    migration: value.migration ?? { status: 'not_required' }
  };
}

export function stringifyState(state) {
  return stringify(state, { lineWidth: 0 });
}
