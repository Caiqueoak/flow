import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateGates, selectGates } from '../../gate-evaluation.mjs';

type Gate = { id: string; stage: string; scope: { tasks?: string[]; work_items?: string[] }; kind?: string };
type GateResult = {
  status: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  violations?: string[];
  message?: string;
};
const selectGatesTyped = selectGates as unknown as (
  gates: Gate[],
  filters?: { ids?: string[]; task?: string; workItem?: string; stage?: string; all?: boolean }
) => Gate[];

function project(t: test.TestContext, gates: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-gates-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow'));
  fs.writeFileSync(path.join(root, '_flow', 'gates.yaml'), gates);
  return root;
}

test('selects task and work-item gates deterministically', () => {
  const gates = [
    { id: 'task-gate', stage: 'task', scope: { tasks: ['W101-T001'] } },
    { id: 'review-gate', stage: 'work-item-review', scope: {} },
    { id: 'full-gate', stage: 'full', scope: {} }
  ];
  assert.deepEqual(
    selectGatesTyped(gates, { task: 'W101-T001' }).map((gate) => gate.id),
    ['task-gate']
  );
  assert.deepEqual(
    selectGatesTyped(gates, { workItem: 'W101' }).map((gate) => gate.id),
    ['review-gate']
  );
  assert.deepEqual(
    selectGatesTyped(gates, { ids: ['full-gate'] }).map((gate) => gate.id),
    ['full-gate']
  );
  assert.deepEqual(
    selectGatesTyped(gates, { stage: 'full' }).map((gate) => gate.id),
    ['full-gate']
  );
  assert.deepEqual(
    selectGatesTyped(gates, { all: true }).map((gate) => gate.id),
    ['task-gate', 'review-gate', 'full-gate']
  );
  assert.deepEqual(selectGatesTyped(gates), []);
  assert.deepEqual(selectGatesTyped(gates, { ids: ['missing'], all: true }), []);
});

test('evaluates portable command fixtures and builtin gate outcomes', (t) => {
  const commandDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-gate-command-'));
  t.after(() => fs.rmSync(commandDirectory, { recursive: true, force: true }));
  const pass = path.join(commandDirectory, 'pass.mjs');
  const fail = path.join(commandDirectory, 'fail.mjs');
  fs.writeFileSync(pass, "process.stdout.write('passed fixture');\n");
  fs.writeFileSync(fail, "process.stderr.write('failed fixture'); process.exitCode = 7;\n");
  const root = project(
    t,
    `schema_version: 2\ngates:\n  - id: pass-command\n    kind: command\n    command: node ${pass.replaceAll('\\', '/')}\n  - id: fail-command\n    kind: command\n    command: node ${fail.replaceAll('\\', '/')}\n  - id: names\n    kind: builtin\n    rule: kebab-case-files\n  - id: unknown\n    kind: builtin\n    rule: unknown-rule\n`
  );
  fs.writeFileSync(path.join(root, 'bad Name.txt'), 'bad');
  const result = evaluateGates(root) as GateResult[];
  assert.equal(result[0]?.status, 'passed', JSON.stringify(result, null, 2));
  assert.deepEqual(
    result.map((gate) => gate.status),
    ['passed', 'failed', 'failed', 'unsupported']
  );
  assert.equal(result[0]?.stdout, 'passed fixture');
  assert.equal(result[1]?.exit_code, 7);
  assert.match(result[1]?.stderr ?? '', /failed fixture/);
  assert.deepEqual(result[2]?.violations, ['bad Name.txt']);
  assert.match(result[3]?.message ?? '', /Unknown builtin rule/);
});

test('builtin file rules ignore reserved trees, dotfiles and uppercase convention files', (t) => {
  const root = project(t, 'schema_version: 2\ngates:\n  - id: names\n    kind: builtin\n    rule: kebab-case-files\n');
  fs.mkdirSync(path.join(root, 'valid-directory'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, '.hidden Bad'), 'ignored');
  fs.writeFileSync(path.join(root, 'README.md'), 'allowed');
  fs.writeFileSync(path.join(root, 'valid-directory', 'two.parts.ts'), 'allowed');
  fs.writeFileSync(path.join(root, 'node_modules', 'bad Name.js'), 'ignored');

  assert.equal(evaluateGates(root)[0]!.status, 'passed');
  assert.throws(() => evaluateGates(path.join(root, 'missing')), /gates.yaml does not exist/);
});
