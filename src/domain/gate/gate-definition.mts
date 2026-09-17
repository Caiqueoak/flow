import { parseDocument } from 'yaml';
import { ArtifactValidationError } from '../work-item/backlog.mjs';
import { GATES_SCHEMA_VERSION } from './gate.js';

const KINDS = new Set(['command', 'builtin']);

export type GateKind = 'command' | 'builtin';
export type GateStage = 'task' | 'work-item-review' | 'full';
export type GateCost = 'low' | 'medium' | 'high';

export interface GateScope {
  tasks?: string[];
  work_items?: string[];
  [key: string]: unknown;
}

export interface GateDefinition {
  id: string;
  kind: GateKind;
  command?: string;
  rule?: string;
  stage: GateStage;
  cost: GateCost;
  scope: GateScope;
  blocking: boolean;
  [key: string]: unknown;
}

export interface GateCollection {
  schema_version: number;
  gates: GateDefinition[];
}

export function parseGates(text: string, { source = 'gates.yaml' }: { source?: string } = {}): GateCollection {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
  const parsed: unknown = document.toJS();
  if (!isRecord(parsed)) throw new ArtifactValidationError(`${source} must be a mapping.`);
  const value = parsed;
  if (value.schema_version !== GATES_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${GATES_SCHEMA_VERSION}.`);
  if (!Array.isArray(value.gates)) throw new ArtifactValidationError(`${source} gates must be a list.`);
  const ids = new Set<string>();
  const gates = value.gates.map((raw: unknown, index: number): GateDefinition => {
    if (!isRecord(raw)) throw new ArtifactValidationError(`gates[${index}] must be a mapping.`);
    const gate = raw;
    if (typeof gate.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(gate.id))
      throw new ArtifactValidationError(`gates[${index}].id must be lower kebab-case.`);
    if (ids.has(gate.id)) throw new ArtifactValidationError(`duplicate gate '${gate.id}'.`);
    ids.add(gate.id);
    if (typeof gate.kind !== 'string' || !KINDS.has(gate.kind))
      throw new ArtifactValidationError(`${gate.id}.kind must be command or builtin.`);
    if (gate.kind === 'command' && (!gate.command || typeof gate.command !== 'string'))
      throw new ArtifactValidationError(`${gate.id} command gate requires command.`);
    const stage = gate.stage ?? 'full';
    if (typeof stage !== 'string' || !['task', 'work-item-review', 'full'].includes(stage))
      throw new ArtifactValidationError(`${gate.id}.stage must be task, work-item-review or full.`);
    const cost = gate.cost ?? 'medium';
    if (typeof cost !== 'string' || !['low', 'medium', 'high'].includes(cost))
      throw new ArtifactValidationError(`${gate.id}.cost must be low, medium or high.`);
    const scope = gate.scope ?? {};
    if (!isRecord(scope)) throw new ArtifactValidationError(`${gate.id}.scope must be a mapping.`);
    return {
      ...gate,
      id: gate.id,
      kind: gate.kind as GateKind,
      stage: stage as GateStage,
      cost: cost as GateCost,
      scope,
      blocking: gate.blocking !== false
    };
  });
  return { schema_version: GATES_SCHEMA_VERSION, gates };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
