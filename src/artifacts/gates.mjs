import { parseDocument } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';

const KINDS = new Set(['command', 'builtin']);

export function parseGates(text, { source = 'gates.yaml' } = {}) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) throw new ArtifactValidationError(`${source} is invalid: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (value.schema_version !== 1) throw new ArtifactValidationError(`${source} schema_version must be 1.`);
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
    return { ...gate, blocking: gate.blocking !== false };
  });
  return { schema_version: 1, gates };
}
