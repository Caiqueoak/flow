import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceTask } from '../src/commands/trace.mjs';

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-trace-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'flow@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: root });
  await fs.writeFile(path.join(root, 'file.txt'), 'one');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'feat: implement\n\nFlow-Work-Item: W001\nFlow-Task: W001-T001'], { cwd: root });
  return root;
}

test('resolves task identity from Git trailer instead of persisted SHA', async () => {
  const root = await repo();
  const result = traceTask(root, 'W001-T001');
  assert.equal(result.status, 'resolved');
  assert.match(result.commit.sha, /^[0-9a-f]{40}$/);
});

test('reports missing and ambiguous task identities', async () => {
  const root = await repo();
  assert.equal(traceTask(root, 'W001-T002').status, 'missing');
  await fs.writeFile(path.join(root, 'file.txt'), 'two');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fix: duplicate\n\nFlow-Work-Item: W001\nFlow-Task: W001-T001'], { cwd: root });
  assert.equal(traceTask(root, 'W001-T001').status, 'ambiguous');
});
