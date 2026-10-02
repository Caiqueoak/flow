import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { createWorkItemShell, loadWorkItems, workItemsDirectory } from '../../work-items.mjs';
import { serializeWorkItemSpec } from '../../../../domain/work-item/specification.mjs';
import { stringifyReview } from '../../../../domain/work-item/review.mjs';

function shell() {
  return {
    spec: serializeWorkItemSpec(
      {
        schema_version: 1,
        work_item: 'W001',
        title: 'Atomic shell',
        outcome: 'Publish a complete shell.',
        kind: 'technical',
        priority: 1,
        depends_on: [],
        blockers: [],
        maturity: 'outlined'
      },
      '\n# Work Item Specification\n\n## Outcome\n\nPublish a complete shell.\n'
    ),
    tasks: stringify({ schema_version: 3, work_item: 'W001', tasks: [] }, { lineWidth: 0 }),
    review: stringifyReview({ schema_version: 1, work_item: 'W001', status: 'pending' })
  };
}

test('successful staged work-item creation preserves the canonical shell behavior', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-work-item-shell-'));
  createWorkItemShell(root, 'W001-atomic-shell', 'W001', shell());

  const items = loadWorkItems(root);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'W001');
  assert.equal(items[0]?.title, 'Atomic shell');
  assert.deepEqual(fs.readdirSync(path.join(workItemsDirectory(root), 'W001-atomic-shell')).sort(), [
    'review.yaml',
    'spec.md',
    'tasks.yaml'
  ]);
});

test('failed publication cannot expose a partial canonical work item', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-work-item-failure-'));

  assert.throws(
    () =>
      createWorkItemShell(root, 'W001-atomic-shell', 'W001', shell(), {
        publish: () => {
          throw new Error('interrupted publish');
        }
      }),
    /interrupted publish/
  );

  assert.equal(fs.existsSync(path.join(workItemsDirectory(root), 'W001-atomic-shell')), false);
  assert.deepEqual(loadWorkItems(root), []);
});

test('recognized abandoned staging directories are never treated as canonical work items', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-work-item-abandoned-'));
  const parent = workItemsDirectory(root);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.flow-work-item-W001-atomic-shell-'));
  fs.writeFileSync(path.join(staging, 'spec.md'), 'partial', 'utf8');

  assert.deepEqual(loadWorkItems(root), []);
});
