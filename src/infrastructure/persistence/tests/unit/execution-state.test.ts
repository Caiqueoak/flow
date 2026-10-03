import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { emptyState, type ExecutionState } from '../../../../domain/workflow/execution-state.mjs';
import { executionStateFile, loadExecutionState, writeExecutionState } from '../../execution-state.mjs';

test('execution state persistence atomically replaces a valid checkpoint state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });

  const original = emptyState();
  writeExecutionState(root, original);

  const next: ExecutionState = {
    ...original,
    active: { work_item: 'W101', concurrency: null }
  };
  writeExecutionState(root, next);

  assert.deepEqual(loadExecutionState(root), next);
  assert.deepEqual(
    fs.readdirSync(path.join(root, '_flow')).filter((name) => name.includes('.flow-tmp-')),
    []
  );
});

test('invalid replacement never corrupts the previous canonical state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });

  writeExecutionState(root, emptyState());
  const before = fs.readFileSync(executionStateFile(root), 'utf8');

  assert.throws(
    () =>
      writeExecutionState(root, {
        ...emptyState(),
        schema_version: 99
      }),
    /schema_version/
  );
  assert.equal(fs.readFileSync(executionStateFile(root), 'utf8'), before);
});
