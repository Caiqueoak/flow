import { parseDocument } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';
import { GATES_SCHEMA_VERSION } from '../domain/contracts.mjs';

const KINDS = new Set(['command', 'builtin']);

export function parseGates(text, { source = 'gates.yaml' } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (value.schema_version !== GATES_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${GATES_SCHEMA_VERSION}.`);
  if (!Array.isArray(value.gates)) throw new ArtifactValidationError(`${source} gates must be a list.`);
  const ids = new Set();
  const gates = value.gates.map((gate, index) => {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate))
      throw new ArtifactValidationError(`gates[${index}] must be a mapping.`);
    if (typeof gate.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(gate.id))
      throw new ArtifactValidationError(`gates[${index}].id must be lower kebab-case.`);
    if (ids.has(gate.id)) throw new ArtifactValidationError(`duplicate gate '${gate.id}'.`);
    ids.add(gate.id);
    if (!KINDS.has(gate.kind)) throw new ArtifactValidationError(`${gate.id}.kind must be command or builtin.`);
    if (gate.kind === 'command' && (!gate.command || typeof gate.command !== 'string'))
      throw new ArtifactValidationError(`${gate.id} command gate requires command.`);
    const stage = gate.stage ?? 'full';
    if (!['task', 'work-item-review', 'full'].includes(stage))
      throw new ArtifactValidationError(`${gate.id}.stage must be task, work-item-review or full.`);
    const cost = gate.cost ?? 'medium';
    if (!['low', 'medium', 'high'].includes(cost))
      throw new ArtifactValidationError(`${gate.id}.cost must be low, medium or high.`);
    const scope = gate.scope ?? {};
    if (!scope || typeof scope !== 'object' || Array.isArray(scope))
      throw new ArtifactValidationError(`${gate.id}.scope must be a mapping.`);
    return { ...gate, stage, cost, scope, blocking: gate.blocking !== false };
  });
  return { schema_version: GATES_SCHEMA_VERSION, gates };
}
