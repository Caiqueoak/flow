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
test('command gates execute through project validation', () => {
  const root = project();
  artifacts(root);
  plan(root);
  write(root, 'gates.yaml', {
    schema_version: 1,
    gates: [
      { id: 'pass', kind: 'command', command: '"' + process.execPath + '" -e "process.exit(0)"' },
      { id: 'fail', kind: 'command', command: '"' + process.execPath + '" -e "process.exit(1)"' }
    ]
  });
  assert.deepEqual(
    evaluateGates(root).map((gate) => gate.status),
    ['passed', 'failed']
  );
  assert.ok(validateProject(root).some((f) => f.code === 'GATE'));
});
