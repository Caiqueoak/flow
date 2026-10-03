import path from 'node:path';
import { createHash } from 'node:crypto';
import { documentRevision, isProjectDocumentApproved } from '../domain/project/document.mjs';
import { SPEC_FILE } from '../domain/project/project.js';
import {
  isWorkItemSpecApproved,
  parseWorkItemSpec,
  specificationRevision
} from '../domain/work-item/specification.mjs';
import type { LoadedWorkItem } from '../domain/work-item/work-item.js';
import type { WorkflowCheckpoint } from '../domain/workflow/checkpoint.mjs';
import { fileExists, readText } from '../infrastructure/filesystem/index.js';
import { loadExecutionState } from '../infrastructure/persistence/execution-state.mjs';
import { loadWorkItems } from '../infrastructure/persistence/work-items.mjs';
import { canonicalProjectDocumentKind, validateProjectDocument } from './project-contracts.mjs';

export type RecoveryClassification = 'resumable' | 'safely_repairable' | 'requires_reconciliation';

export interface RecoveryFinding {
  code: string;
  message: string;
}

export interface RecoveryContinuation {
  phase: 'discovery' | 'experience' | 'engineering' | 'planning' | 'specification';
  instruction: string;
  work_item?: string;
  approval_required: boolean;
}

export interface RecoveryRepair {
  kind: 'clear_checkpoint';
  target_ref: string;
  target_revision: string;
}

export interface RecoveryInspection {
  classification: RecoveryClassification;
  checkpoint: WorkflowCheckpoint | null;
  continuation: RecoveryContinuation | null;
  findings: RecoveryFinding[];
  repair: RecoveryRepair | null;
}

interface RevisionIdentity {
  exists: boolean;
  valid: boolean;
  revision: string | null;
  approved: boolean;
  workItem?: LoadedWorkItem;
}

export function inspectRecoveryState(root: string): RecoveryInspection {
  let state;
  try {
    state = loadExecutionState(root);
  } catch (error) {
    return reconciliation('RECOVERY_STATE_INVALID', errorMessage(error));
  }

  let items: LoadedWorkItem[];
  try {
    items = loadWorkItems(root);
  } catch (error) {
    return reconciliation('RECOVERY_WORK_ITEMS_INVALID', errorMessage(error), state.checkpoint);
  }

  const findings: RecoveryFinding[] = [];
  const activeWorkItem = state.active.work_item;
  if (activeWorkItem && !items.some((item) => item.id === activeWorkItem)) {
    findings.push({
      code: 'RECOVERY_ACTIVE_WORK_ITEM_MISSING',
      message: `state.active.work_item references missing work item '${activeWorkItem}'.`
    });
  }

  const checkpoint = state.checkpoint;
  if (!checkpoint) {
    return {
      classification: findings.length ? 'requires_reconciliation' : 'resumable',
      checkpoint: null,
      continuation: null,
      findings,
      repair: null
    };
  }

  for (const input of checkpoint.inputs) {
    const identity = resolveRevisionIdentity(root, items, input.ref);
    if (!identity.exists) {
      findings.push({
        code: 'RECOVERY_CHECKPOINT_INPUT_MISSING',
        message: `Checkpoint input '${input.ref}' is missing.`
      });
      continue;
    }
    if (!identity.valid || !identity.revision) {
      findings.push({
        code: 'RECOVERY_CHECKPOINT_INPUT_INVALID',
        message: `Checkpoint input '${input.ref}' cannot provide a valid exact revision.`
      });
      continue;
    }
    if (identity.revision !== input.revision) {
      findings.push({
        code: 'RECOVERY_CHECKPOINT_INPUT_REVISION_MISMATCH',
        message: `Checkpoint input '${input.ref}' expects revision ${input.revision}, current revision is ${identity.revision}.`
      });
    }
  }

  const target = resolveCheckpointTarget(root, items, checkpoint);
  inspectTargetCoherence(checkpoint, target, findings);
  inspectPlanningCoherence(state.active.work_item, checkpoint, target, items, findings);

  const continuation = checkpointContinuation(checkpoint, target.workItem);
  if (!continuation) {
    findings.push({
      code: 'RECOVERY_CHECKPOINT_CONTINUATION_UNKNOWN',
      message: `Checkpoint phase '${checkpoint.phase}' and target kind '${checkpoint.target.kind}' do not map to a supported W3 continuation.`
    });
  }

  if (findings.length) {
    return {
      classification: 'requires_reconciliation',
      checkpoint,
      continuation: null,
      findings,
      repair: null
    };
  }

  if (
    checkpoint.status === 'approval_ready' &&
    checkpoint.target.revision &&
    target.approved &&
    target.revision === checkpoint.target.revision
  ) {
    return {
      classification: 'safely_repairable',
      checkpoint,
      continuation: null,
      findings: [
        {
          code: 'RECOVERY_STALE_APPROVAL_CHECKPOINT',
          message: `Checkpoint target '${checkpoint.target.ref}' is already approved at exact revision ${checkpoint.target.revision}; the stale checkpoint can be cleared safely.`
        }
      ],
      repair: {
        kind: 'clear_checkpoint',
        target_ref: checkpoint.target.ref,
        target_revision: checkpoint.target.revision
      }
    };
  }

  if (
    checkpoint.status === 'active' &&
    target.approved &&
    checkpoint.target.revision &&
    target.revision === checkpoint.target.revision
  ) {
    return {
      classification: 'requires_reconciliation',
      checkpoint,
      continuation: null,
      findings: [
        {
          code: 'RECOVERY_ACTIVE_CHECKPOINT_ALREADY_APPROVED',
          message: `Active checkpoint target '${checkpoint.target.ref}' is already approved at its recorded exact revision, but only approval_ready checkpoints are eligible for deterministic stale cleanup.`
        }
      ],
      repair: null
    };
  }

  return {
    classification: 'resumable',
    checkpoint,
    continuation,
    findings: [],
    repair: null
  };
}

function inspectTargetCoherence(
  checkpoint: WorkflowCheckpoint,
  target: RevisionIdentity,
  findings: RecoveryFinding[]
): void {
  const revisionRequired = checkpoint.status === 'approval_ready' || checkpoint.target.revision !== null;

  if (!target.exists) {
    if (revisionRequired || checkpoint.target.kind !== 'project_document') {
      findings.push({
        code: 'RECOVERY_CHECKPOINT_TARGET_MISSING',
        message: `Checkpoint target '${checkpoint.target.ref}' is missing.`
      });
    }
    return;
  }

  if (revisionRequired && (!target.valid || !target.revision)) {
    findings.push({
      code: 'RECOVERY_CHECKPOINT_TARGET_INVALID',
      message: `Checkpoint target '${checkpoint.target.ref}' cannot provide the recorded exact revision.`
    });
    return;
  }

  if (checkpoint.target.revision && target.revision !== checkpoint.target.revision) {
    findings.push({
      code: 'RECOVERY_CHECKPOINT_TARGET_REVISION_MISMATCH',
      message: `Checkpoint target '${checkpoint.target.ref}' expects revision ${checkpoint.target.revision}, current revision is ${target.revision ?? 'unavailable'}.`
    });
  }

  if (checkpoint.status === 'approval_ready' && !target.valid) {
    findings.push({
      code: 'RECOVERY_APPROVAL_READY_TARGET_INVALID',
      message: `Approval-ready checkpoint target '${checkpoint.target.ref}' is not structurally valid.`
    });
  }
}

function inspectPlanningCoherence(
  activeWorkItem: string | null,
  checkpoint: WorkflowCheckpoint,
  target: RevisionIdentity,
  items: LoadedWorkItem[],
  findings: RecoveryFinding[]
): void {
  if (checkpoint.phase === 'planning' && checkpoint.target.kind === 'work_item_map') {
    const advanced = items.find((item) => item.maturity !== 'outlined' || item.tasks.tasks.length > 0);
    if (advanced) {
      findings.push({
        code: 'RECOVERY_WORK_ITEM_MAP_ADVANCED',
        message: `Backlog-mapping checkpoint is active, but ${advanced.id} has already advanced beyond an outlined shell.`
      });
    }
    return;
  }

  if (checkpoint.phase === 'planning' && checkpoint.target.kind === 'task_plan') {
    const item = target.workItem;
    if (!item) return;

    const advancedTask = item.tasks.tasks.find((task) => task.state !== 'pending');
    if (advancedTask) {
      findings.push({
        code: 'RECOVERY_TASK_PLAN_ADVANCED',
        message: `Task-planning checkpoint for ${item.id} is active, but ${item.id}-${advancedTask.id} is already ${advancedTask.state}.`
      });
    }

    const specText = readText(path.join(item.base, SPEC_FILE));
    if (!isWorkItemSpecApproved(specText, { expectedWorkItem: item.id })) {
      findings.push({
        code: 'RECOVERY_TASK_PLAN_SPEC_UNAPPROVED',
        message: `Task-planning checkpoint for ${item.id} requires its exact current SPEC revision to be approved.`
      });
    }

    if (activeWorkItem && activeWorkItem !== item.id) {
      findings.push({
        code: 'RECOVERY_ACTIVE_WORK_ITEM_CONFLICT',
        message: `Checkpoint targets ${item.id}, but state.active.work_item is ${activeWorkItem}.`
      });
    }
    return;
  }

  if (checkpoint.phase === 'specification') {
    const item = target.workItem;
    if (!item) return;
    if (item.tasks.tasks.length > 0) {
      findings.push({
        code: 'RECOVERY_SPECIFICATION_HAS_TASKS',
        message: `Specification checkpoint for ${item.id} is active, but tasks.yaml is already non-empty.`
      });
    }
    if (activeWorkItem && activeWorkItem !== item.id) {
      findings.push({
        code: 'RECOVERY_ACTIVE_WORK_ITEM_CONFLICT',
        message: `Checkpoint targets ${item.id}, but state.active.work_item is ${activeWorkItem}.`
      });
    }
  }
}

function resolveCheckpointTarget(
  root: string,
  items: LoadedWorkItem[],
  checkpoint: WorkflowCheckpoint
): RevisionIdentity {
  if (checkpoint.target.kind === 'work_item_map') {
    return {
      exists: fileExists(path.join(root, checkpoint.target.ref)),
      valid: checkpoint.target.ref === '_flow/work-items',
      revision: null,
      approved: false
    };
  }

  if (checkpoint.target.kind === 'task_plan') {
    return workItemIdentity(root, items, checkpoint.target.ref);
  }

  if (checkpoint.target.kind === 'work_item_spec' || checkpoint.phase === 'specification') {
    return workItemIdentity(root, items, checkpoint.target.ref);
  }

  return resolveRevisionIdentity(root, items, checkpoint.target.ref);
}

function resolveRevisionIdentity(root: string, items: LoadedWorkItem[], ref: string): RevisionIdentity {
  const normalized = normalizeRef(ref);
  const projectKind = canonicalProjectDocumentKind(normalized);
  if (projectKind) {
    const file = path.resolve(root, normalized);
    if (!fileExists(file)) return missingIdentity();

    const text = readText(file);
    try {
      const valid = validateProjectDocument(projectKind, text).length === 0;
      return {
        exists: true,
        valid,
        revision: valid ? documentRevision(text) : null,
        approved: valid && isProjectDocumentApproved(text)
      };
    } catch {
      return { exists: true, valid: false, revision: null, approved: false };
    }
  }

  const workItem = findWorkItem(root, items, normalized);
  if (workItem) return workItemSpecIdentity(workItem);

  const file = path.resolve(root, normalized);
  if (!isWithinRoot(root, file) || !fileExists(file)) return missingIdentity();

  try {
    const text = readText(file);
    return {
      exists: true,
      valid: true,
      revision: createHash('sha256').update(text).digest('hex'),
      approved: false
    };
  } catch {
    return { exists: true, valid: false, revision: null, approved: false };
  }
}

function workItemIdentity(root: string, items: LoadedWorkItem[], ref: string): RevisionIdentity {
  const item = findWorkItem(root, items, normalizeRef(ref));
  return item ? workItemSpecIdentity(item) : missingIdentity();
}

function workItemSpecIdentity(item: LoadedWorkItem): RevisionIdentity {
  const text = readText(path.join(item.base, SPEC_FILE));
  try {
    const spec = parseWorkItemSpec(text, { expectedWorkItem: item.id });
    return {
      exists: true,
      valid: true,
      revision: specificationRevision(spec.metadata, spec.body),
      approved: isWorkItemSpecApproved(text, { expectedWorkItem: item.id }),
      workItem: item
    };
  } catch {
    return {
      exists: true,
      valid: false,
      revision: null,
      approved: false,
      workItem: item
    };
  }
}

function findWorkItem(root: string, items: LoadedWorkItem[], ref: string): LoadedWorkItem | undefined {
  if (/^W\d{3,}$/.test(ref)) return items.find((item) => item.id === ref);

  return items.find((item) => {
    const specRef = normalizeRef(path.relative(root, path.join(item.base, SPEC_FILE)));
    return ref === specRef;
  });
}

function checkpointContinuation(
  checkpoint: WorkflowCheckpoint,
  workItem: LoadedWorkItem | undefined
): RecoveryContinuation | null {
  const approvalRequired = checkpoint.status === 'approval_ready';

  if (checkpoint.phase === 'discovery') {
    return {
      phase: 'discovery',
      instruction: approvalRequired ? 'discovery/step-02-await-approval.md' : 'discovery/step-01-project.md',
      approval_required: approvalRequired
    };
  }

  if (checkpoint.phase === 'experience') {
    return {
      phase: 'experience',
      instruction: approvalRequired ? 'experience/step-02-await-approval.md' : 'experience/step-01-define.md',
      approval_required: approvalRequired
    };
  }

  if (checkpoint.phase === 'engineering') {
    return {
      phase: 'engineering',
      instruction: approvalRequired ? 'engineering/step-05-present.md' : 'engineering/step-02-synthesize.md',
      approval_required: approvalRequired
    };
  }

  if (checkpoint.phase === 'planning' && checkpoint.target.kind === 'work_item_map' && !approvalRequired) {
    return {
      phase: 'planning',
      instruction: 'planning/step-01-plan-work-item.md',
      approval_required: false
    };
  }

  if (checkpoint.phase === 'planning' && checkpoint.target.kind === 'task_plan' && workItem && !approvalRequired) {
    return {
      phase: 'planning',
      instruction: 'planning/step-01-create-tasks.md',
      work_item: workItem.id,
      approval_required: false
    };
  }

  if (checkpoint.phase === 'specification' && workItem) {
    return {
      phase: 'specification',
      instruction: approvalRequired
        ? 'specification/step-02-await-approval.md'
        : 'specification/step-01-deepen-spec.md',
      work_item: workItem.id,
      approval_required: approvalRequired
    };
  }

  return null;
}

function normalizeRef(ref: string): string {
  return ref.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isWithinRoot(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function missingIdentity(): RevisionIdentity {
  return { exists: false, valid: false, revision: null, approved: false };
}

function reconciliation(
  code: string,
  message: string,
  checkpoint: WorkflowCheckpoint | null = null
): RecoveryInspection {
  return {
    classification: 'requires_reconciliation',
    checkpoint,
    continuation: null,
    findings: [{ code, message }],
    repair: null
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
