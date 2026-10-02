import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import { loadWorkItems } from '../../../../infrastructure/persistence/work-items.mjs';
import { createWorkItem } from '../../commands/create.js';

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-work-item-create-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'work-items'), { recursive: true });
  return root;
}

test('successful staged work-item creation publishes the complete canonical shell', (t) => {
  const root = project(t);
  createWorkItem(root, 'W101', ['--title', 'Atomic shell', '--outcome', 'A complete shell is visible atomically.']);

  const items = loadWorkItems(root);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'W101');
  const checkpoint = loadExecutionState(root).checkpoint;
  assert.equal(checkpoint?.phase, 'planning');
  assert.equal(checkpoint?.step, 'map_work_items');
  assert.deepEqual(checkpoint?.target, {
    kind: 'work_item_map',
    ref: '_flow/work-items',
    revision: null
  });
  const base = path.join(root, '_flow', 'work-items', 'W101-atomic-shell');
  assert.deepEqual(fs.readdirSync(base).sort(), ['review.yaml', 'spec.md', 'tasks.yaml']);
  assert.deepEqual(
    fs.readdirSync(path.dirname(base)).filter((name) => name.includes('.flow-tmp-')),
    []
  );
});

test('failed staged validation cannot expose a partial canonical work item', (t) => {
  const root = project(t);

  assert.throws(
    () =>
      createWorkItem(root, 'W101', [
        '--title',
        'Invalid shell',
        '--outcome',
        'This candidate must never become canonical.',
        '--priority',
        'not-a-number'
      ]),
    /invalid canonical metadata/
  );

  const workItems = path.join(root, '_flow', 'work-items');
  assert.deepEqual(fs.readdirSync(workItems), []);
  assert.deepEqual(loadWorkItems(root), []);
});

test('interrupted staging directory is not exposed as a canonical work item', (t) => {
  const root = project(t);
  const workItems = path.join(root, '_flow', 'work-items');
  const staging = path.join(workItems, '.W101-interrupted.flow-tmp-partial');
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, 'spec.md'), 'partial\n');

  assert.deepEqual(loadWorkItems(root), []);
  assert.equal(fs.existsSync(staging), true);
});

test('first-shell publication failure still leaves the planning checkpoint durable', (t) => {
  const root = project(t);
  const destination = path.join(root, '_flow', 'work-items', 'W101-blocked-publication');
  fs.writeFileSync(destination, 'blocks atomic directory publication');

  assert.throws(
    () =>
      createWorkItem(root, 'W101', [
        '--title',
        'Blocked publication',
        '--outcome',
        'Checkpoint persistence must happen before publication.'
      ]),
    /EEXIST|ENOTDIR|file already exists/i
  );

  assert.deepEqual(loadWorkItems(root), []);
  const checkpoint = loadExecutionState(root).checkpoint;
  assert.equal(checkpoint?.phase, 'planning');
  assert.equal(checkpoint?.step, 'map_work_items');
  assert.equal(checkpoint?.target.ref, '_flow/work-items');
  assert.equal(checkpoint?.status, 'active');
});
