import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, parseState, stringifyState, type ExecutionState } from '../../execution-state.mjs';

test('execution state v3 round-trips checkpoint state', () => {
  const state: ExecutionState = {
    ...emptyState(),
    active: { work_item: 'W101' },
    checkpoint: {
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'work_item_plan', ref: '_flow/work-items/W101-example/tasks.yaml', revision: null },
      status: 'active',
      inputs: [{ ref: '_flow/work-items/W101-example/spec.md', revision: 'spec-revision' }],
      dimensions: [{ id: 'D001', state: 'unresolved', summary: 'Choose task boundary.' }],
      assumptions: [],
      latest_authorized_direction: 'Prefer cohesive tasks.',
      next_frontier: ['D001'],
      updated_at: '2026-10-02T12:00:00Z'
    }
  };
  assert.deepEqual(parseState(stringifyState(state)), state);
});

test('execution state reads v2 without trusting its dormant cursor or active work markers', () => {
  const parsed = parseState(`schema_version: 2
execution:
  phase: implementation
  step: execute_task
active:
  work_item: W101
  task: W101-T001
stop_reason: external_action
migration:
  status: pending_reconciliation
`);

  assert.deepEqual(parsed, {
    schema_version: 3,
    migration: { status: 'pending_reconciliation' },
    active: { work_item: null },
    checkpoint: null
  });
});

test('execution state rejects malformed v3 structure', () => {
  assert.throws(() => parseState('{'), /invalid/);
  assert.throws(() => parseState('[]'), /must be a mapping/);
  assert.throws(() => parseState('schema_version: 1'), /schema_version/);
  assert.throws(
    () =>
      parseState(`schema_version: 3
migration:
  status: running
active:
  work_item: null
checkpoint: null
`),
    /migration.status/
  );
  assert.throws(
    () =>
      parseState(`schema_version: 3
migration:
  status: not_required
active:
  work_item: bad
checkpoint: null
`),
    /active.work_item/
  );
  assert.throws(
    () =>
      parseState(`schema_version: 3
migration:
  status: not_required
active:
  work_item: null
`),
    /checkpoint must be present/
  );
});

test('empty execution state is the minimal v3 structural envelope', () => {
  assert.deepEqual(emptyState(), {
    schema_version: 3,
    migration: { status: 'not_required' },
    active: { work_item: null },
    checkpoint: null
  });
});
