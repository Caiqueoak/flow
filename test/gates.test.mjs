import assert from 'node:assert/strict';
import test from 'node:test';
import { stringify } from 'yaml';
import { parseGates } from '../src/artifacts/gates.mjs';
import { evaluateGates } from '../src/commands/gates.mjs';
import { validateProject } from '../src/commands/validate.mjs';
import { project, write, artifacts, plan } from './helpers.mjs';
test('only deterministic gates are accepted', () => {
  assert.throws(
    () =>
      parseGates(
        stringify({ schema_version: 1, gates: [{ id: 'review', kind: 'agentic', profile: 'flow/maintainability@1' }] })
      ),
    /command or builtin/
  );
});
test('command gates run only when project validation explicitly requests them', () => {
  const root = project();
  artifacts(root);
  plan(root);
  write(root, 'gates.yaml', {
    schema_version: 1,
    gates: [
      { id: 'pass', kind: 'command', command: 'exit 0' },
      { id: 'fail', kind: 'command', command: 'exit 1' }
    ]
  });
  const evaluated = evaluateGates(root);
  assert.deepEqual(
    evaluated.map((gate) => gate.status),
    ['passed', 'failed']
  );
  assert.ok(evaluated.every((gate) => Number.isInteger(gate.duration_ms) && gate.duration_ms >= 0));
  assert.equal(
    validateProject(root).some((f) => f.code === 'GATE'),
    false
  );
  assert.ok(validateProject(root, { evaluateConfiguredGates: true }).some((f) => f.code === 'GATE'));
});
