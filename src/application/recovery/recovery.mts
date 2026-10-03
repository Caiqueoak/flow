import path from 'node:path';
import { documentRevision, isProjectDocumentApproved } from '../../domain/project/document.mjs';
import {
  isWorkItemSpecApproved,
  parseWorkItemSpec,
  specificationRevision
} from '../../domain/work-item/specification.mjs';
import type { WorkflowCheckpoint } from '../../domain/workflow/checkpoint.mjs';
import { fileExists, readText } from '../../infrastructure/filesystem/index.js';
import { loadExecutionState, writeExecutionState } from '../../infrastructure/persistence/execution-state.mjs';
import { loadWorkItems } from '../../infrastructure/persistence/work-items.mjs';
import { canonicalProjectDocumentKind, inspectProjectContract } from '../project-contracts.mjs';

export type RecoveryClassification = 'resumable' | 'safely_repairable' | 'requires_reconciliation';

export interface RecoveryFinding {
  code:
    | 'RECOVERY_STATE_INVALID'
    | 'RECOVERY_WORK_ITEMS_INVALID'
    | 'RECOVERY_ACTIVE_WORK_ITEM_MISSING'
    | 'RECOVERY_ACTIVE_WORK_ITEM_CONFLICT'
    | 'RECOVERY_TARGET_MISSING'
    | 'RECOVERY_TARGET_INVALID'
    | 'RECOVERY_TARGET_REVISION_MISMATCH'
    | 'RECOVERY_INPUT_MISSING'
    | 'RECOVERY_INPUT_INVALID'
    | 'RECOVERY_INPUT_REVISION_MISMATCH'
    | 'RECOVERY_PLANNING_TARGET_INVALID';
  message: string;
}

export interface RecoveryContinuation {
  phase: string;
  instruction: string;
  work_item?: string;
  approval_required: boolean;
}

export interface RecoveryAssessment {
  classification: RecoveryClassification;
  checkpoint: WorkflowCheckpoint | null;
  continuation: RecoveryContinuation | null;
  findings: RecoveryFinding[];
  repair:
    | {
        kind: 'clear_stale_checkpoint';
        target_ref: string;
        target_revision: string;
      }
    | null;
}

interface ResolvedRevision {
  exists: boolean;
  valid: boolean;
  revision: string | null;
  approved: boolean;
}

export function inspectRecovery(root: string): RecoveryAssessment {
  const findings: RecoveryFinding[] = [];
  let state: ReturnType<typeof loadExecutionState>;
  try {
    state = loadExecutionState(root);
  } catch (error) {
    return reconciliation('RECOVERY_STATE_INVALID', errorMessage(error));
  }

  let items: ReturnType<typeof loadWorkItems>;
  try {
    items = loadWorkItems(root);
  } catch (error) {
    return reconciliation('RECOVERY_WORK_ITEMS_INVALID', errorMessage(error));
  }

  const checkpoint = state.checkpoint;

  if (state.active.work_item && !items.some((item) => item.id === state.active.work_item)) {
    findings.push({
      code: 'RECOVERY_ACTIVE_WORK_ITEM_MISSING',
      message: `state.active.work_item references missing work item '${state.active.work_item}'.`
    });
  }

  if (!checkpoint) {
    return {
      classification: findings.length ? 'requires_reconciliation' : 'resumable',
      checkpoint: null,
      continuation: null,
      findings,
      repair: null
    };
  }

  validateCheckpointTarget(root, checkpoint, items, findings);
  validateCheckpointInputs(root, checkpoint, items, findings);
  validatePlanningShape(checkpoint, state.active.work_item, items, findings);

  if (findings.length) {
    return {
      classification: 'requires_reconciliation',
      checkpoint,
      continuation: checkpointContinuation(checkpoint),
      findings,
      repair: null
    };
  }

  const repair = staleApprovalRepair(root, checkpoint, items);
  return {
    classification: repair ? 'safely_repairable' : 'resumable',
    checkpoint,
    continuation: checkpointContinuation(checkpoint),
    findings: [],
    repair
  };
}

export function repairRecovery(root: string): RecoveryAssessment {
  const assessment = inspectRecovery(root);
  if (assessment.classification !== 'safely_repairable' || !assessment.repair) return assessment;

  const state = loadExecutionState(root);
  const checkpoint = state.checkpoint;
  if (
    !checkpoint ||
    checkpoint.status !== 'approval_ready' ||
    checkpoint.target.ref !== assessment.repair.target_ref ||
    checkpoint.target.revision !== assessment.repair.target_revision
  ) {
    return inspectRecovery(root);
  }

  state.checkpoint = null;
  writeExecutionState(root, state);
  return inspectRecovery(root);
}

function validateCheckpointTarget(
  root: string,
  checkpoint: WorkflowCheckpoint,
  items: ReturnType<typeof loadWorkItems>,
  findings: RecoveryFinding[]
): void {
  const resolved = resolveReference(root, checkpoint.target.ref, items);
  if (
    !resolved.exists &&
    checkpoint.status === 'active' &&
    canonicalProjectDocumentKind(normalizeRef(checkpoint.target.ref))
  ) {
    return;
  }
  if (!resolved.exists) {
    findings.push({
      code: 'RECOVERY_TARGET_MISSING',
      message: `Checkpoint target '${checkpoint.target.ref}' does not exist.`
    });
    return;
  }
  if (!resolved.valid) {
    findings.push({
      code: 'RECOVERY_TARGET_INVALID',
      message: `Checkpoint target '${checkpoint.target.ref}' is structurally invalid.`
    });
    return;
  }
  if (checkpoint.target.revision !== null && resolved.revision === null) {
    findings.push({
      code: 'RECOVERY_TARGET_INVALID',
      message: `Checkpoint target '${checkpoint.target.ref}' cannot prove revision coherence.`
    });
    return;
  }
  if (
    checkpoint.target.revision !== null &&
    resolved.revision !== null &&
    checkpoint.target.revision !== resolved.revision
  ) {
    findings.push({
      code: 'RECOVERY_TARGET_REVISION_MISMATCH',
      message: `Checkpoint target '${checkpoint.target.ref}' expects revision ${checkpoint.target.revision}, current revision is ${resolved.revision}.`
    });
  }
}

function validateCheckpointInputs(
  root: string,
  checkpoint: WorkflowCheckpoint,
  items: ReturnType<typeof loadWorkItems>,
  findings: RecoveryFinding[]
): void {
  for (const input of checkpoint.inputs) {
    const resolved = resolveReference(root, input.ref, items);
    if (!resolved.exists) {
      findings.push({
        code: 'RECOVERY_INPUT_MISSING',
        message: `Checkpoint input '${input.ref}' does not exist.`
      });
      continue;
    }
    if (!resolved.valid || !resolved.revision) {
      findings.push({
        code: 'RECOVERY_INPUT_INVALID',
        message: `Checkpoint input '${input.ref}' cannot prove revision coherence.`
      });
      continue;
    }
    if (resolved.revision !== input.revision) {
      findings.push({
        code: 'RECOVERY_INPUT_REVISION_MISMATCH',
        message: `Checkpoint input '${input.ref}' expects revision ${input.revision}, current revision is ${resolved.revision}.`
      });
    }
  }
}

function validatePlanningShape(
  checkpoint: WorkflowCheckpoint,
  activeWorkItem: string | null,
  items: ReturnType<typeof loadWorkItems>,
  findings: RecoveryFinding[]
): void {
  if (checkpoint.target.kind === 'work_item_map' && normalizeRef(checkpoint.target.ref) !== '_flow/work-items') {
    findings.push({
      code: 'RECOVERY_PLANNING_TARGET_INVALID',
      message: `Backlog-mapping checkpoint must target '_flow/work-items', not '${checkpoint.target.ref}'.`
    });
  }

  if (checkpoint.target.kind === 'task_plan') {
    const item = findWorkItem(checkpoint.target.ref, items);
    if (!item) {
      findings.push({
        code: 'RECOVERY_PLANNING_TARGET_INVALID',
        message: `Task-planning checkpoint references unknown work item '${checkpoint.target.ref}'.`
      });
    }
  }

  if (checkpoint.phase === 'specification') {
    const item = findWorkItem(checkpoint.target.ref, items);
    if (!item) {
      findings.push({
        code: 'RECOVERY_PLANNING_TARGET_INVALID',
        message: `Specification checkpoint references unknown work item '${checkpoint.target.ref}'.`
      });
    }
  }

  const checkpointWorkItemId = checkpointWorkItem(checkpoint);
  if (activeWorkItem && checkpointWorkItemId && activeWorkItem !== checkpointWorkItemId) {
    findings.push({
      code: 'RECOVERY_ACTIVE_WORK_ITEM_CONFLICT',
      message: `Checkpoint references ${checkpointWorkItemId} while state.active.work_item is ${activeWorkItem}.`
    });
  }
}

function staleApprovalRepair(
  root: string,
  checkpoint: WorkflowCheckpoint,
  items: ReturnType<typeof loadWorkItems>
): RecoveryAssessment['repair'] {
  if (checkpoint.status !== 'approval_ready' || !checkpoint.target.revision) return null;
  const resolved = resolveReference(root, checkpoint.target.ref, items);
  if (
    resolved.exists &&
    resolved.valid &&
    resolved.approved &&
    resolved.revision === checkpoint.target.revision
  ) {
    return {
      kind: 'clear_stale_checkpoint',
      target_ref: checkpoint.target.ref,
      target_revision: checkpoint.target.revision
    };
  }
  return null;
}

function resolveReference(
  root: string,
  ref: string,
  items: ReturnType<typeof loadWorkItems>
): ResolvedRevision {
  const normalized = normalizeRef(ref);
  const projectKind = canonicalProjectDocumentKind(normalized);
  if (projectKind) {
    const contract = inspectProjectContract(root, projectKind);
    if (!contract.exists || !contract.text) return { exists: false, valid: false, revision: null, approved: false };
    try {
      return {
        exists: true,
        valid: contract.valid,
        revision: documentRevision(contract.text),
        approved: contract.valid && isProjectDocumentApproved(contract.text)
      };
    } catch {
      return { exists: true, valid: false, revision: null, approved: false };
    }
  }

  const item = findWorkItem(normalized, items);
  if (item) {
    const specFile = path.join(item.base, 'spec.md');
    try {
      const text = readText(specFile);
      const parsed = parseWorkItemSpec(text, { expectedWorkItem: item.id });
      return {
        exists: true,
        valid: true,
        revision: specificationRevision(parsed.metadata, parsed.body),
        approved: isWorkItemSpecApproved(text, { expectedWorkItem: item.id })
      };
    } catch {
      return { exists: true, valid: false, revision: null, approved: false };
    }
  }

  if (normalized === '_flow/work-items') {
    return {
      exists: fileExists(path.join(root, '_flow', 'work-items')),
      valid: true,
      revision: null,
      approved: false
    };
  }

  const file = path.resolve(root, normalized);
  if (!fileExists(file)) return { exists: false, valid: false, revision: null, approved: false };
  return { exists: true, valid: true, revision: null, approved: false };
}

function findWorkItem(ref: string, items: ReturnType<typeof loadWorkItems>) {
  const normalized = normalizeRef(ref);
  const id = normalized.match(/(?:^|\/)(W\d{3,})(?:-|\/|$)/)?.[1] ?? normalized.match(/^W\d{3,}$/)?.[0];
  return id ? items.find((item) => item.id === id) : undefined;
}

function checkpointContinuation(checkpoint: WorkflowCheckpoint): RecoveryContinuation {
  const workItem = checkpointWorkItem(checkpoint);
  if (checkpoint.phase === 'discovery') {
    return {
      phase: 'discovery',
      instruction:
        checkpoint.status === 'approval_ready'
          ? 'discovery/step-02-await-approval.md'
          : 'discovery/step-01-project.md',
      approval_required: checkpoint.status === 'approval_ready'
    };
  }
  if (checkpoint.phase === 'experience') {
    return {
      phase: 'experience',
      instruction:
        checkpoint.status === 'approval_ready'
          ? 'experience/step-02-await-approval.md'
          : 'experience/step-01-define.md',
      approval_required: checkpoint.status === 'approval_ready'
    };
  }
  if (checkpoint.phase === 'engineering') {
    return {
      phase: 'engineering',
      instruction:
        checkpoint.status === 'approval_ready'
          ? 'engineering/step-05-present.md'
          : 'engineering/step-02-synthesize.md',
      approval_required: checkpoint.status === 'approval_ready'
    };
  }
  if (checkpoint.phase === 'specification') {
    return {
      phase: 'specification',
      instruction:
        checkpoint.status === 'approval_ready'
          ? 'specification/step-02-await-approval.md'
          : 'specification/step-01-deepen-spec.md',
      ...(workItem ? { work_item: workItem } : {}),
      approval_required: checkpoint.status === 'approval_ready'
    };
  }
  if (checkpoint.phase === 'planning' && checkpoint.target.kind === 'task_plan') {
    return {
      phase: 'planning',
      instruction: 'planning/step-01-create-tasks.md',
      ...(workItem ? { work_item: workItem } : {}),
      approval_required: false
    };
  }
  return {
    phase: checkpoint.phase,
    instruction: 'planning/step-01-plan-work-item.md',
    ...(workItem ? { work_item: workItem } : {}),
    approval_required: false
  };
}

function checkpointWorkItem(checkpoint: WorkflowCheckpoint): string | undefined {
  const normalized = normalizeRef(checkpoint.target.ref);
  return normalized.match(/(?:^|\/)(W\d{3,})(?:-|\/|$)/)?.[1] ?? normalized.match(/^W\d{3,}$/)?.[0];
}

function normalizeRef(ref: string): string {
  return ref.replaceAll('\\', '/').replace(/^\.\//, '');
}

function reconciliation(code: RecoveryFinding['code'], message: string): RecoveryAssessment {
  return {
    classification: 'requires_reconciliation',
    checkpoint: null,
    continuation: null,
    findings: [{ code, message }],
    repair: null
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
