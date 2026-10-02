import { UserInputError as ArtifactValidationError } from '../errors.js';

export const CHECKPOINT_STATUSES = ['active', 'approval_ready'] as const;
export const CHECKPOINT_DIMENSION_STATES = ['resolved', 'unresolved', 'deferred', 'not_relevant'] as const;

export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];
export type CheckpointDimensionState = (typeof CHECKPOINT_DIMENSION_STATES)[number];

export interface CheckpointReference {
  ref: string;
  revision: string;
}

export interface CheckpointTarget {
  kind: string;
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

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;
const TOKEN = /^[a-z][a-z0-9_-]*$/;
const DIMENSION_STATES = new Set<string>(CHECKPOINT_DIMENSION_STATES);

export function parseCheckpoint(value: unknown, { source = 'checkpoint' }: { source?: string } = {}): Checkpoint {
  const checkpoint = requireRecord(value, source);
  const phase = requireToken(checkpoint.phase, `${source}.phase`);
  const step = requireToken(checkpoint.step, `${source}.step`);
  const target = parseTarget(checkpoint.target, `${source}.target`);
  const status = requireStatus(checkpoint.status, `${source}.status`);
  const inputs = requireArray(checkpoint.inputs, `${source}.inputs`).map((entry, index) =>
    parseReference(entry, `${source}.inputs[${index}]`)
  );
  const dimensions = requireArray(checkpoint.dimensions, `${source}.dimensions`).map((entry, index) =>
    parseDimension(entry, `${source}.dimensions[${index}]`)
  );
  const assumptions = requireArray(checkpoint.assumptions, `${source}.assumptions`).map((entry, index) =>
    parseAssumption(entry, `${source}.assumptions[${index}]`)
  );
  ensureUniqueIds(dimensions, `${source}.dimensions`);
  ensureUniqueIds(assumptions, `${source}.assumptions`);

  const latestAuthorizedDirection = optionalString(
    checkpoint.latest_authorized_direction,
    `${source}.latest_authorized_direction`
  );
  const nextFrontier = requireArray(checkpoint.next_frontier, `${source}.next_frontier`).map((entry, index) =>
    requireIdentifier(entry, `${source}.next_frontier[${index}]`)
  );
  if (new Set(nextFrontier).size !== nextFrontier.length)
    fail(`${source}.next_frontier contains duplicate dimension IDs.`);

  const unresolved = new Set(
    dimensions.filter((dimension) => dimension.state === 'unresolved').map((dimension) => dimension.id)
  );
  for (const id of nextFrontier)
    if (!unresolved.has(id)) fail(`${source}.next_frontier '${id}' must reference an unresolved dimension.`);

  const updatedAt = requireIsoTimestamp(checkpoint.updated_at, `${source}.updated_at`);

  if (status === 'approval_ready') {
    if (!target.revision) fail(`${source}.target.revision is required when status is approval_ready.`);
    if (unresolved.size) fail(`${source} cannot be approval_ready while unresolved dimensions remain.`);
    if (assumptions.length) fail(`${source} cannot be approval_ready while assumptions remain under test.`);
    if (nextFrontier.length) fail(`${source} cannot be approval_ready with a next decision frontier.`);
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
    updated_at: updatedAt
  };
}

function parseTarget(value: unknown, label: string): CheckpointTarget {
  const target = requireRecord(value, label);
  return {
    kind: requireToken(target.kind, `${label}.kind`),
    ref: requireString(target.ref, `${label}.ref`),
    revision: optionalRevision(target.revision, `${label}.revision`)
  };
}

function parseReference(value: unknown, label: string): CheckpointReference {
  const reference = requireRecord(value, label);
  return {
    ref: requireString(reference.ref, `${label}.ref`),
    revision: requireString(reference.revision, `${label}.revision`)
  };
}

function parseDimension(value: unknown, label: string): CheckpointDimension {
  const dimension = requireRecord(value, label);
  const state = dimension.state;
  if (typeof state !== 'string' || !DIMENSION_STATES.has(state))
    fail(`${label}.state must be resolved, unresolved, deferred, or not_relevant.`);
  const rationale = optionalString(dimension.rationale, `${label}.rationale`);
  const revisit = optionalString(dimension.revisit, `${label}.revisit`);
  return {
    id: requireIdentifier(dimension.id, `${label}.id`),
    state: state as CheckpointDimensionState,
    summary: requireString(dimension.summary, `${label}.summary`),
    ...(rationale ? { rationale } : {}),
    ...(revisit ? { revisit } : {})
  };
}

function parseAssumption(value: unknown, label: string): CheckpointAssumption {
  const assumption = requireRecord(value, label);
  if (assumption.state !== 'testing') fail(`${label}.state must be testing.`);
  return {
    id: requireIdentifier(assumption.id, `${label}.id`),
    state: 'testing',
    summary: requireString(assumption.summary, `${label}.summary`)
  };
}

function requireStatus(value: unknown, label: string): CheckpointStatus {
  if (value !== 'active' && value !== 'approval_ready') fail(`${label} must be active or approval_ready.`);
  return value;
}

function requireToken(value: unknown, label: string): string {
  const token = requireString(value, label);
  if (!TOKEN.test(token)) fail(`${label} must be a lowercase workflow token.`);
  return token;
}

function requireIdentifier(value: unknown, label: string): string {
  const identifier = requireString(value, label);
  if (!IDENTIFIER.test(identifier)) fail(`${label} must be a stable identifier.`);
  return identifier;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, label);
}

function optionalRevision(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, label);
}

function requireIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) fail(`${label} must be an ISO timestamp.`);
  return timestamp;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a mapping.`);
  return value as Record<string, unknown>;
}

function ensureUniqueIds(values: Array<{ id: string }>, label: string): void {
  const ids = values.map((value) => value.id);
  if (new Set(ids).size !== ids.length) fail(`${label} contains duplicate IDs.`);
}

function fail(message: string): never {
  throw new ArtifactValidationError(message);
}
