import { UserInputError as ArtifactValidationError } from '../errors.js';

const CHECKPOINT_STATUSES = new Set(['active', 'approval_ready']);
const DIMENSION_STATES = new Set(['resolved', 'unresolved', 'deferred', 'not_relevant']);
const TOKEN = /^[a-z][a-z0-9_-]*$/;
const STABLE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

export type CheckpointStatus = 'active' | 'approval_ready';
export type CheckpointDimensionState = 'resolved' | 'unresolved' | 'deferred' | 'not_relevant';
export type CheckpointTargetKind = string;

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

export interface WorkflowCheckpoint {
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

export function parseCheckpoint(
  value: unknown,
  { source = 'checkpoint' }: { source?: string } = {}
): WorkflowCheckpoint {
  const checkpoint = requireRecord(value, source);
  const phase = requireToken(checkpoint.phase, `${source}.phase`);
  const step = requireToken(checkpoint.step, `${source}.step`);
  const target = parseTarget(checkpoint.target, `${source}.target`);
  const status = checkpoint.status;
  if (typeof status !== 'string' || !CHECKPOINT_STATUSES.has(status))
    invalid(`${source}.status must be active or approval_ready.`);

  const inputs = parseInputs(checkpoint.inputs, `${source}.inputs`);
  const dimensions = parseDimensions(checkpoint.dimensions, `${source}.dimensions`);
  const assumptions = parseAssumptions(checkpoint.assumptions, `${source}.assumptions`);
  const latestAuthorizedDirection = optionalString(
    checkpoint.latest_authorized_direction,
    `${source}.latest_authorized_direction`
  );
  const nextFrontier = parseStringList(checkpoint.next_frontier, `${source}.next_frontier`);
  const updatedAt = requireIsoDate(checkpoint.updated_at, `${source}.updated_at`);

  const dimensionsById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  for (const id of nextFrontier) {
    const dimension = dimensionsById.get(id);
    if (!dimension) invalid(`${source}.next_frontier references unknown dimension '${id}'.`);
    if (dimension.state !== 'unresolved')
      invalid(`${source}.next_frontier may reference only unresolved dimensions; '${id}' is ${dimension.state}.`);
  }

  const unresolved = dimensions.filter((dimension) => dimension.state === 'unresolved');
  if (unresolved.length && !nextFrontier.length)
    invalid(`${source}.next_frontier must identify at least one unresolved dimension.`);

  if (status === 'approval_ready') {
    if (!target.revision) invalid(`${source}.target.revision is required when approval_ready.`);
    if (unresolved.length)
      invalid(`${source} cannot be approval_ready while unresolved dimensions remain.`);
    if (assumptions.length)
      invalid(`${source} cannot be approval_ready while assumptions remain under test.`);
    if (nextFrontier.length)
      invalid(`${source}.next_frontier must be empty when approval_ready.`);
  }

  return {
    phase,
    step,
    target,
    status: status as CheckpointStatus,
    inputs,
    dimensions,
    assumptions,
    latest_authorized_direction: latestAuthorizedDirection,
    next_frontier: nextFrontier,
    updated_at: updatedAt
  };
}

export function withCheckpointStatus(
  checkpoint: WorkflowCheckpoint,
  status: CheckpointStatus,
  {
    targetRevision = checkpoint.target.revision,
    updatedAt
  }: { targetRevision?: string | null; updatedAt: string }
): WorkflowCheckpoint {
  return parseCheckpoint({
    ...checkpoint,
    status,
    target: { ...checkpoint.target, revision: targetRevision },
    updated_at: updatedAt
  });
}

export function sameCheckpointTarget(
  left: Pick<WorkflowCheckpoint, 'phase' | 'target'>,
  right: Pick<WorkflowCheckpoint, 'phase' | 'target'>
): boolean {
  return left.phase === right.phase && left.target.kind === right.target.kind && left.target.ref === right.target.ref;
}

function parseTarget(value: unknown, source: string): CheckpointTarget {
  const target = requireRecord(value, source);
  const kind = requireToken(target.kind, `${source}.kind`);
  return {
    kind,
    ref: requireNonEmptyString(target.ref, `${source}.ref`),
    revision: optionalString(target.revision, `${source}.revision`)
  };
}

function parseInputs(value: unknown, source: string): CheckpointReference[] {
  if (!Array.isArray(value)) invalid(`${source} must be a list.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const input = requireRecord(entry, `${source}[${index}]`);
    const ref = requireNonEmptyString(input.ref, `${source}[${index}].ref`);
    if (seen.has(ref)) invalid(`${source} contains duplicate ref '${ref}'.`);
    seen.add(ref);
    return {
      ref,
      revision: requireNonEmptyString(input.revision, `${source}[${index}].revision`)
    };
  });
}

function parseDimensions(value: unknown, source: string): CheckpointDimension[] {
  if (!Array.isArray(value)) invalid(`${source} must be a list.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const dimension = requireRecord(entry, `${source}[${index}]`);
    const id = requireStableId(dimension.id, `${source}[${index}].id`);
    if (seen.has(id)) invalid(`${source} contains duplicate dimension '${id}'.`);
    seen.add(id);
    const state = dimension.state;
    if (typeof state !== 'string' || !DIMENSION_STATES.has(state))
      invalid(`${source}[${index}].state is invalid.`);
    return {
      id,
      state: state as CheckpointDimensionState,
      summary: requireNonEmptyString(dimension.summary, `${source}[${index}].summary`),
      ...(dimension.rationale === undefined
        ? {}
        : { rationale: requireNonEmptyString(dimension.rationale, `${source}[${index}].rationale`) }),
      ...(dimension.revisit === undefined
        ? {}
        : { revisit: requireNonEmptyString(dimension.revisit, `${source}[${index}].revisit`) })
    };
  });
}

function parseAssumptions(value: unknown, source: string): CheckpointAssumption[] {
  if (!Array.isArray(value)) invalid(`${source} must be a list.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const assumption = requireRecord(entry, `${source}[${index}]`);
    const id = requireStableId(assumption.id, `${source}[${index}].id`);
    if (seen.has(id)) invalid(`${source} contains duplicate assumption '${id}'.`);
    seen.add(id);
    if (assumption.state !== 'testing') invalid(`${source}[${index}].state must be testing.`);
    return {
      id,
      state: 'testing',
      summary: requireNonEmptyString(assumption.summary, `${source}[${index}].summary`)
    };
  });
}

function parseStringList(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) invalid(`${source} must be a list.`);
  const values = value.map((entry, index) => requireStableId(entry, `${source}[${index}]`));
  if (new Set(values).size !== values.length) invalid(`${source} contains duplicate entries.`);
  return values;
}

function requireRecord(value: unknown, source: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${source} must be a mapping.`);
  return value as Record<string, unknown>;
}

function requireToken(value: unknown, source: string): string {
  const token = requireNonEmptyString(value, source);
  if (!TOKEN.test(token)) invalid(`${source} must be a lowercase workflow token.`);
  return token;
}

function requireStableId(value: unknown, source: string): string {
  const id = requireNonEmptyString(value, source);
  if (!STABLE_ID.test(id)) invalid(`${source} must be a stable identifier.`);
  return id;
}

function requireNonEmptyString(value: unknown, source: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`${source} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown, source: string): string | null {
  if (value === undefined || value === null) return null;
  return requireNonEmptyString(value, source);
}

function requireIsoDate(value: unknown, source: string): string {
  const text = requireNonEmptyString(value, source);
  if (Number.isNaN(Date.parse(text))) invalid(`${source} must be an ISO timestamp.`);
  return text;
}

function invalid(message: string): never {
  throw new ArtifactValidationError(message);
}
