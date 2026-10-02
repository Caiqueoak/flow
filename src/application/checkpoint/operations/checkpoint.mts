import { UserInputError } from '../../../domain/errors.js';
import { parseCheckpoint, type Checkpoint } from '../../../domain/workflow/checkpoint.mjs';
import { loadExecutionState, writeExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';

export type CheckpointData = Omit<Checkpoint, 'status' | 'updated_at'>;

interface CheckpointClock {
  now(): Date;
}

const systemClock: CheckpointClock = { now: () => new Date() };

export function beginCheckpoint(
  root: string,
  data: CheckpointData,
  { clock = systemClock }: { clock?: CheckpointClock } = {}
): Checkpoint {
  const state = loadExecutionState(root);
  if (state.checkpoint) throw new UserInputError('A checkpoint is already active. Update or clear it first.');

  state.checkpoint = activeCheckpoint(data, clock);
  return writeExecutionState(root, state).checkpoint!;
}

export function updateCheckpoint(
  root: string,
  data: CheckpointData,
  { clock = systemClock }: { clock?: CheckpointClock } = {}
): Checkpoint {
  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (!current) throw new UserInputError('No checkpoint is active.');

  const next = activeCheckpoint(data, clock);
  ensureSameCheckpoint(current, next);
  state.checkpoint = next;
  return writeExecutionState(root, state).checkpoint!;
}

export function markCheckpointApprovalReady(
  root: string,
  revision: string | undefined,
  { clock = systemClock }: { clock?: CheckpointClock } = {}
): Checkpoint {
  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (!current) throw new UserInputError('No checkpoint is active.');

  state.checkpoint = parseCheckpoint(
    {
      ...current,
      target: {
        ...current.target,
        revision: revision ?? current.target.revision
      },
      status: 'approval_ready',
      updated_at: clock.now().toISOString()
    },
    { source: 'checkpoint' }
  );
  return writeExecutionState(root, state).checkpoint!;
}

export function clearCheckpoint(
  root: string,
  {
    targetRef,
    targetRevision
  }: {
    targetRef: string;
    targetRevision?: string;
  }
): void {
  const state = loadExecutionState(root);
  const checkpoint = state.checkpoint;
  if (!checkpoint) throw new UserInputError('No checkpoint is active.');
  if (checkpoint.target.ref !== targetRef)
    throw new UserInputError(
      `Checkpoint targets '${checkpoint.target.ref}', not '${targetRef}'. Refusing to clear unrelated state.`
    );

  ensureCheckpointCanClear(checkpoint);

  if (checkpoint.status === 'approval_ready') {
    if (!targetRevision)
      throw new UserInputError('Clearing an approval-ready checkpoint requires its exact target revision.');
    if (targetRevision !== checkpoint.target.revision)
      throw new UserInputError('Checkpoint target revision does not match the persisted outcome revision.');
  } else if (targetRevision && checkpoint.target.revision && targetRevision !== checkpoint.target.revision) {
    throw new UserInputError('Checkpoint target revision does not match the persisted outcome revision.');
  }

  state.checkpoint = null;
  writeExecutionState(root, state);
}

export function currentCheckpoint(root: string): Checkpoint | null {
  return loadExecutionState(root).checkpoint;
}

function activeCheckpoint(data: CheckpointData, clock: CheckpointClock): Checkpoint {
  return parseCheckpoint(
    {
      ...data,
      status: 'active',
      updated_at: clock.now().toISOString()
    },
    { source: 'checkpoint' }
  );
}

function ensureSameCheckpoint(current: Checkpoint, next: Checkpoint): void {
  if (current.phase !== next.phase)
    throw new UserInputError(`Checkpoint phase is '${current.phase}'. Clear it before beginning phase '${next.phase}'.`);
  if (current.target.kind !== next.target.kind || current.target.ref !== next.target.ref)
    throw new UserInputError('Checkpoint target cannot change during update. Clear it before beginning a new target.');
}

function ensureCheckpointCanClear(checkpoint: Checkpoint): void {
  if (checkpoint.dimensions.some((dimension) => dimension.state === 'unresolved'))
    throw new UserInputError('Cannot clear a checkpoint while unresolved dimensions remain.');
  if (checkpoint.assumptions.length)
    throw new UserInputError('Cannot clear a checkpoint while assumptions remain under test.');
  if (checkpoint.next_frontier.length)
    throw new UserInputError('Cannot clear a checkpoint while a next decision frontier remains.');
}
