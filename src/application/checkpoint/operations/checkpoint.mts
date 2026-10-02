import { UserInputError as ArtifactValidationError } from '../../../domain/errors.js';
import {
  parseCheckpoint,
  sameCheckpointTarget,
  withCheckpointStatus,
  type WorkflowCheckpoint
} from '../../../domain/workflow/checkpoint.mjs';
import { loadExecutionState, writeExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';

type CheckpointPayload = Omit<WorkflowCheckpoint, 'status' | 'updated_at'>;

export function beginCheckpoint(
  root: string,
  payload: CheckpointPayload,
  { now = () => new Date().toISOString() }: { now?: () => string } = {}
): WorkflowCheckpoint {
  const state = loadExecutionState(root);
  if (state.checkpoint) throw new ArtifactValidationError('An active checkpoint already exists.');
  const checkpoint = activeCheckpoint(payload, now());
  state.checkpoint = checkpoint;
  writeExecutionState(root, state);
  return checkpoint;
}

export function updateCheckpoint(
  root: string,
  payload: CheckpointPayload,
  { now = () => new Date().toISOString() }: { now?: () => string } = {}
): WorkflowCheckpoint {
  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (!current) throw new ArtifactValidationError('No active checkpoint exists.');
  if (current.status !== 'active')
    throw new ArtifactValidationError(
      'An approval_ready checkpoint cannot be updated; clear it after approval persistence.'
    );
  const checkpoint = activeCheckpoint(payload, now());
  if (!sameCheckpointTarget(current, checkpoint))
    throw new ArtifactValidationError('Checkpoint update cannot change phase or target identity.');
  state.checkpoint = checkpoint;
  writeExecutionState(root, state);
  return checkpoint;
}

export function markCheckpointApprovalReady(
  root: string,
  targetRevision: string,
  { now = () => new Date().toISOString() }: { now?: () => string } = {}
): WorkflowCheckpoint {
  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (!current) throw new ArtifactValidationError('No active checkpoint exists.');
  if (current.status !== 'active') throw new ArtifactValidationError('Checkpoint is already approval_ready.');
  const checkpoint = withCheckpointStatus(current, 'approval_ready', {
    targetRevision,
    updatedAt: now()
  });
  state.checkpoint = checkpoint;
  writeExecutionState(root, state);
  return checkpoint;
}

export function clearCheckpoint(
  root: string,
  {
    targetRef,
    targetRevision
  }: {
    targetRef: string;
    targetRevision?: string | undefined;
  }
): void {
  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (!current) throw new ArtifactValidationError('No active checkpoint exists.');
  if (current.target.ref !== targetRef)
    throw new ArtifactValidationError(`Checkpoint target is '${current.target.ref}', not '${targetRef}'.`);
  if (targetRevision !== undefined && current.target.revision !== targetRevision)
    throw new ArtifactValidationError('Checkpoint target revision does not match the persisted outcome.');
  if (current.status === 'approval_ready' && targetRevision === undefined)
    throw new ArtifactValidationError(
      'Clearing an approval_ready checkpoint requires the expected target revision; approval verification remains with the approval owner.'
    );
  state.checkpoint = null;
  writeExecutionState(root, state);
}

export function parseCheckpointPayload(text: string): CheckpointPayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArtifactValidationError('--data must be valid checkpoint JSON.');
  }
  const checkpoint = parseCheckpoint({
    ...(isRecord(value) ? value : {}),
    status: 'active',
    updated_at: '2000-01-01T00:00:00.000Z'
  });
  const { status: _status, updated_at: _updatedAt, ...payload } = checkpoint;
  return payload;
}

function activeCheckpoint(payload: CheckpointPayload, updatedAt: string): WorkflowCheckpoint {
  return parseCheckpoint({
    ...payload,
    status: 'active',
    updated_at: updatedAt
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
