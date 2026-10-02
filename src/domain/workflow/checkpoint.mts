import { UserInputError as ArtifactValidationError } from '../errors.js';

export const CHECKPOINT_STATUSES = ['active', 'approval_ready'] as const;
export const CHECKPOINT_DIMENSION_STATES = ['resolved', 'unresolved', 'deferred', 'not_relevant'] as const;
export const CHECKPOINT_TARGET_KINDS = [
  'project_document',
  'work_item_collection',
  'work_item_spec',
  'work_item_tasks'
] as const;

export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];
export type CheckpointDimensionState = (typeof CHECKPOINT_DIMENSION_STATES)[number];
export type CheckpointTargetKind = (typeof CHECKPOINT_TARGET_KINDS)[number];

export interface CheckpointReference {
  ref: string;
  revision: string;
}

export interface CheckpointTarget {
  kind: CheckpointTargetKind;
  ref: string;
  revision: string | null;
}

export interface CheckpointDimension {
  id: string;
  state: CheckpointDimensionState;
  summary: string;
  rationale?: string;
  revisit?: string;
}

export interface CheckpointAssumption {
  id: string;
  state: 'testing';
  summary: string;
}

export interface Checkpoint {
  phase: string;
  step: string;
  target: CheckpointTarget;
  status: CheckpointStatus;
  inputs: CheckpointReference[];
  dimensions: CheckpointDimension[];
  assumptions: CheckpointAssumption[];
  latest_authorized_direction: string | null;
  next_frontier: string[];
  updated_at: string;
}

export type CheckpointDraft = Omit<Checkpoint, 'status' | 'updated_at'>;

export function parseCheckpoint(value: unknown, { source = 'checkpoint' }: { source?: string } = {}): Checkpoint {
  const checkpoint = requireRecord(value, source);
  const phase = requireText(checkpoint.phase, `${source}.phase`);
  const step = requireText(checkpoint.step, `${source}.step`);
  const status = requireEnum(checkpoint.status, CHECKPOINT_STATUSES, `${source}.status`);
  const target = parseTarget(checkpoint.target, `${source}.target`);
  const inputs = requireArray(checkpoint.inputs, `${source}.inputs`).map((input, index) =>
    parseReference(input, `${source}.inputs[${index}]`)
  );
  const dimensions = parseDimensions(checkpoint.dimensions, source);
  const assumptions = parseAssumptions(checkpoint.assumptions, source);
  const latestAuthorizedDirection =
    checkpoint.latest_authorized_direction === null
      ? null
      : requireText(checkpoint.latest_authorized_direction, `${source}.latest_authorized_direction`);
  const nextFrontier = requireArray(checkpoint.next_frontier, `${source}.next_frontier`).map((entry, index) =>
    requireText(entry, `${source}.next_frontier[${index}]`)
  );
  const updatedAt = requireText(checkpoint.updated_at, `${source}.updated_at`);

  if (Number.isNaN(Date.parse(updatedAt))) {
    fail(`${source}.updated_at must be an ISO timestamp.`);
  }

  const knownFrontierIds = new Set([...dimensions.map((dimension) => dimension.id), ...assumptions.map((item) => item.id)]);
  for (const id of nextFrontier) {
    if (!knownFrontierIds.has(id)) fail(`${source}.next_frontier references unknown checkpoint item '${id}'.`);
  }

  if (status === 'approval_ready') {
    if (dimensions.some((dimension) => dimension.state === 'unresolved'))
      fail(`${source} cannot be approval_ready while a dimension is unresolved.`);
    if (assumptions.length) fail(`${source} cannot be approval_ready while assumptions remain under test.`);
    if (nextFrontier.length) fail(`${source} cannot be approval_ready while a next decision frontier remains.`);
    if (!target.revision) fail(`${source}.target.revision is required when status is approval_ready.`);
  }

  return {
    phase,
    step,
    target,
    status,
    inputs,
    dimensions,
    assumptions,
    latest_authorized_direction: latestAuthorizedDirection,
    next_frontier: nextFrontier,
    updated_at: new Date(updatedAt).toISOString()
  };
}

export function parseCheckpointDraft(value: unknown, { source = 'checkpoint' }: { source?: string } = {}): CheckpointDraft {
  const candidate = requireRecord(value, source);
  const parsed = parseCheckpoint(
    {
      ...candidate,
      status: 'active',
      updated_at: new Date(0).toISOString()
    },
    { source }
  );

  return {
    phase: parsed.phase,
    step: parsed.step,
    target: parsed.target,
    inputs: parsed.inputs,
    dimensions: parsed.dimensions,
    assumptions: parsed.assumptions,
    latest_authorized_direction: parsed.latest_authorized_direction,
    next_frontier: parsed.next_frontier
  };
}

function parseTarget(value: unknown, source: string): CheckpointTarget {
  const target = requireRecord(value, source);
  const revision =
    target.revision === null || target.revision === undefined
      ? null
      : requireText(target.revision, `${source}.revision`);

  return {
    kind: requireEnum(target.kind, CHECKPOINT_TARGET_KINDS, `${source}.kind`),
    ref: requireText(target.ref, `${source}.ref`),
    revision
  };
}

function parseReference(value: unknown, source: string): CheckpointReference {
  const reference = requireRecord(value, source);
  return {
    ref: requireText(reference.ref, `${source}.ref`),
    revision: requireText(reference.revision, `${source}.revision`)
  };
}

function parseDimensions(value: unknown, source: string): CheckpointDimension[] {
  const ids = new Set<string>();

  return requireArray(value, `${source}.dimensions`).map((entry, index) => {
    const label = `${source}.dimensions[${index}]`;
    const dimension = requireRecord(entry, label);
    const id = uniqueId(requireText(dimension.id, `${label}.id`), ids, `${source}.dimensions`);

    return {
      id,
      state: requireEnum(dimension.state, CHECKPOINT_DIMENSION_STATES, `${label}.state`),
      summary: requireText(dimension.summary, `${label}.summary`),
      ...(dimension.rationale === undefined
        ? {}
        : { rationale: requireText(dimension.rationale, `${label}.rationale`) }),
      ...(dimension.revisit === undefined ? {} : { revisit: requireText(dimension.revisit, `${label}.revisit`) })
    };
  });
}

function parseAssumptions(value: unknown, source: string): CheckpointAssumption[] {
  const ids = new Set<string>();

  return requireArray(value, `${source}.assumptions`).map((entry, index) => {
    const label = `${source}.assumptions[${index}]`;
    const assumption = requireRecord(entry, label);
    const id = uniqueId(requireText(assumption.id, `${label}.id`), ids, `${source}.assumptions`);

    if (assumption.state !== 'testing') fail(`${label}.state must be testing.`);

    return {
      id,
      state: 'testing',
      summary: requireText(assumption.summary, `${label}.summary`)
    };
  });
}

function uniqueId(id: string, ids: Set<string>, source: string): string {
  if (ids.has(id)) fail(`${source} contains duplicate id '${id}'.`);
  ids.add(id);
  return id;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a mapping.`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  return value;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`${label} is invalid.`);
  return value as T[number];
}

function fail(message: string): never {
  throw new ArtifactValidationError(message);
}
