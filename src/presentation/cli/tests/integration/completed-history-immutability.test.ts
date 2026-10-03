import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/entry.js');
const run = (root: string, args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, '--path', root], { encoding: 'utf8' });

function completedProject(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-completed-history-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, '_flow', 'work-items', 'W001-completed');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(
    path.join(base, 'spec.md'),
    [
      '---',
      'schema_version: 1',
      'work_item: W001',
      'title: Completed item',
      'kind: maintenance',
      'priority: 1',
      'depends_on: []',
      'blockers: []',
      'maturity: ready',
      '---',
      '# Work Item Specification',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(base, 'tasks.yaml'),
    [
      'schema_version: 3',
      'work_item: W001',
      'tasks:',
      '  - id: T001',
      '    title: Done',
      '    state: completed',
      '    depends_on: []',
      ''
    ].join('\n')
  );
  fs.writeFileSync(path.join(base, 'review.yaml'), 'schema_version: 1\nwork_item: W001\nstatus: approved\n');
  return root;
}

test('completed work-item canonical history rejects every mutating work-item and task command', (t) => {
  const root = completedProject(t);
  const base = path.join(root, '_flow', 'work-items', 'W001-completed');
  const before = Object.fromEntries(
    ['spec.md', 'tasks.yaml', 'review.yaml'].map((name) => [name, fs.readFileSync(path.join(base, name), 'utf8')])
  );

  const commands = [
    ['work-item', 'set', 'W001', '--title', 'Changed'],
    ['work-item', 'priority', 'W001', '--priority', '2'],
    ['work-item', 'dependencies', 'W001', '--depends-on', 'W999'],
    ['work-item', 'blocker-add', 'W001', '--id', 'B001', '--type', 'external_action', '--description', 'Later'],
    ['work-item', 'blocker-resolve', 'W001', '--id', 'B001'],
    ['work-item', 'promote', 'W001'],
    ['work-item', 'review-pass', 'W001', '--mode', 'checkpoint', '--data', '{}'],
    ['work-item', 'review-complete', 'W001', '--domain', 'history'],
    ['task', 'create', 'W001', '--title', 'Late task'],
    ['task', 'set', 'W001-T001', '--title', 'Changed'],
    ['task', 'start', 'W001-T001'],
    ['task', 'commit', 'W001-T001', '--message', 'fix(history): mutate [W001-T001]', '--files', 'src/a.ts']
  ];

  for (const args of commands) {
    const outcome = run(root, args);
    assert.notEqual(outcome.status, 0, args.join(' '));
    assert.match(outcome.stderr, /completed and its canonical history is immutable/, args.join(' '));
  }

  for (const [name, original] of Object.entries(before)) {
    assert.equal(fs.readFileSync(path.join(base, name), 'utf8'), original, name);
  }
});
