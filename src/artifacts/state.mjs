import { parseDocument, stringify } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';

const PHASES = new Set(['engineering_bootstrap', 'discovery', 'planning', 'build', 'review', 'reconcile', 'complete']);
const STOP_REASONS = new Set([null, 'consequential_decision', 'external_action', 'unrecoverable_blocker', 'finished']);

export function emptyState() {
  return {
    schema_version: 1,
    execution: { id: null, phase: 'engineering_bootstrap', step: 'inspect', workflow_hash: null },
    active: { work_item: null, task: null },
    stop_reason: null
  };
}

export function parseState(text, { source = 'state.yaml' } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (value.schema_version !== 1) throw new ArtifactValidationError(`${source} schema_version must be 1.`);
  const phase = value.execution?.phase;
  if (!PHASES.has(phase)) throw new ArtifactValidationError(`${source} execution.phase is invalid.`);
  if (!STOP_REASONS.has(value.stop_reason ?? null)) throw new ArtifactValidationError(`${source} stop_reason is invalid.`);
  return {
    schema_version: 1,
    execution: {
      id: value.execution?.id ?? null,
      phase,
      step: value.execution?.step ?? null,
      workflow_hash: value.execution?.workflow_hash ?? null
    },
    active: {
      work_item: value.active?.work_item ?? null,
      task: value.active?.task ?? null
    },
    stop_reason: value.stop_reason ?? null
  };
}

export function stringifyState(state) {
  return stringify(state, { lineWidth: 0 });
}
