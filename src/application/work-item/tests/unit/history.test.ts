import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertWorkItemHistoryMutable } from '../../operations/history.mjs';
import { runWorkItem } from '../../command.js';
import { runTask } from '../../../task/command.js';

function project(t: test.TestContext, taskState: 'pending' | 'completed', reviewStatus: 'pending' | 'approved') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, '_flow', 'work-items', 'W001-history');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(
    path.join(base, 'spec.md'),
    [
      '---',
      'schema_version: 1',
      'work_item: W001',
      'title: History',
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
      '    title: Task',
      `    state: ${taskState}`,
      '    depends_on: []',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(base, 'review.yaml'),
    `schema_version: 1\nwork_item: W001\nstatus: ${reviewStatus}\n`
  );
  return root;
}

test('completed work-item history is immutable', (t) => {
  const root = project(t, 'completed', 'approved');
  assert.throws(() => assertWorkItemHistoryMutable(root, 'W001'), /completed and its canonical history is immutable/);
});

test('non-completed work-item remains mutable', (t) => {
  const root = project(t, 'pending', 'pending');
  assert.doesNotThrow(() => assertWorkItemHistoryMutable(root, 'W001'));
});

test('history guard rejects unknown work-items', (t) => {
  const root = project(t, 'pending', 'pending');
  assert.throws(() => assertWorkItemHistoryMutable(root, 'W999'), /Unknown work-item 'W999'/);
});


test('work-item dispatcher applies completed-history guard before mutation', (t) => {
  const root = project(t, 'completed', 'approved');
  assert.throws(
    () => runWorkItem({ args: ['priority', 'W001', '--priority', '2', '--path', root] }),
    /completed and its canonical history is immutable/
  );
});

test('task dispatcher applies completed-history guard before mutation', (t) => {
  const root = project(t, 'completed', 'approved');
  assert.throws(
    () => runTask({ args: ['create', 'W001', '--title', 'Late task', '--path', root] }),
    /completed and its canonical history is immutable/
  );
});
