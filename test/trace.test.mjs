import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceTask, traceTasks, traceWorkItem } from '../src/commands/trace.mjs';

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-trace-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
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

test('resolves multiple task identities from one Git history scan', async () => {
  const root = await repo();
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Second task\n\nFlow-Work-Item: W001\nFlow-Task: W001-T002'], {
    cwd: root
  });
  const results = traceTasks(root, ['W001-T001', 'W001-T002', 'W001-T003']);
  assert.equal(results.get('W001-T001').status, 'resolved');
  assert.equal(results.get('W001-T002').status, 'resolved');
  assert.equal(results.get('W001-T003').status, 'missing');
});

test('reports missing and ambiguous task identities', async () => {
  const root = await repo();
  assert.equal(traceTask(root, 'W001-T002').status, 'missing');
  await fs.writeFile(path.join(root, 'file.txt'), 'two');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fix: duplicate\n\nFlow-Work-Item: W001\nFlow-Task: W001-T001'], { cwd: root });
  assert.equal(traceTask(root, 'W001-T001').status, 'ambiguous');
});

test('a task trailer without its matching work-item trailer is not identity', async () => {
  const root = await repo();
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Wrong owner\n\nFlow-Work-Item: W002\nFlow-Task: W001-T002'], {
    cwd: root
  });
  assert.equal(traceTask(root, 'W001-T002').status, 'invalid');
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Missing owner\n\nFlow-Task: W001-T003'], { cwd: root });
  assert.equal(traceTask(root, 'W001-T003').status, 'invalid');
});

test('aggregates all reachable work-item commits in deterministic order and reports malformed trailers', async () => {
  const root = await repo();
  execFileSync(
    'git',
    ['commit', '--allow-empty', '-m', 'Second task W001-T002\n\nFlow-Work-Item: W001\nFlow-Task: W001-T002'],
    { cwd: root }
  );
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Broken implementation\n\nFlow-Work-Item: W001'], {
    cwd: root
  });
  const result = traceWorkItem(root, 'W001');
  assert.deepEqual(result.commits.map((commit) => commit.task).sort(), ['W001-T001', 'W001-T002']);
  assert.equal(result.invalid_commits.length, 1);
  assert.ok(result.commits.every((commit) => Array.isArray(commit.files)));
});

test('source branches do not create ambiguity for a cherry-picked task', async () => {
  const root = await repo();
  const integration = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['checkout', '-q', '-b', 'source'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Source task\n\nFlow-Work-Item: W001\nFlow-Task: W001-T002'], {
    cwd: root
  });
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['checkout', '-q', integration], { cwd: root });
  assert.equal(traceTask(root, 'W001-T002').status, 'missing');
  execFileSync('git', ['commit', '--allow-empty', '-m', 'Integration step'], { cwd: root });
  execFileSync('git', ['cherry-pick', '--allow-empty', source], { cwd: root });
  assert.equal(traceTask(root, 'W001-T002').status, 'resolved');
});
