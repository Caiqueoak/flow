import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { evaluateGates } from '../src/commands/gates.mjs';
import { parseGates } from '../src/artifacts/gates.mjs';

test('agentic profiles are versioned and unknown profiles are rejected', () => {
  const parsed = parseGates(stringify({ schema_version: 1, gates: [{ id: 'maintainability', kind: 'agentic', blocking: true, profile: 'flow/maintainability@1' }] }));
  assert.equal(parsed.gates[0].profile, 'flow/maintainability@1');
  assert.throws(() => parseGates(stringify({ schema_version: 1, gates: [{ id: 'x', kind: 'agentic', profile: 'flow/unknown@1' }] })), /unknown agentic profile/);
});

test('command gates execute and agentic gates are returned for model judgment', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-gates-'));
  await fs.mkdir(path.join(root, '.flow'));
  await fs.writeFile(path.join(root, '.flow', 'gates.yaml'), stringify({ schema_version: 1, gates: [
    { id: 'command-pass', kind: 'command', blocking: true, command: `${process.execPath} -e "process.exit(0)"` },
    { id: 'maintainability', kind: 'agentic', blocking: true, profile: 'flow/maintainability@1' }
  ] }));
  const results = evaluateGates(root);
  assert.equal(results[0].status, 'passed');
  assert.equal(results[1].status, 'agent_required');
  assert.ok(results[1].profile.criteria.length >= 5);
});
