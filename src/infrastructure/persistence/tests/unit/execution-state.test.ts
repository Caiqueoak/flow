import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { emptyState } from '../../../domain/workflow/execution-state.mjs';
import { executionStatePath, loadExecutionState, writeExecutionState } from '../../execution-state.mjs';

test('execution-state persistence begins from an empty v3 state when no file exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-state-empty-'));
  assert.deepEqual(loadExecutionState(root), emptyState());
});

test('execution-state persistence atomically writes validated checkpoint state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-state-write-'));
  const state = emptyState();
  state.checkpoint = {
    phase: 'discovery',
    step: 'explore_product',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
    status: 'active',
    inputs: [],
    dimensions: [{ id: 'D001', state: 'unresolved', summary: 'Choose primary workflow.' }],
    assumptions: [],
    latest_authorized_direction: null,
    next_frontier: ['D001'],
    updated_at: '2026-10-02T12:00:00Z'
  };

  assert.deepEqual(writeExecutionState(root, state), state);
  assert.deepEqual(loadExecutionState(root), state);
  assert.equal(fs.existsSync(executionStatePath(root)), true);
});
