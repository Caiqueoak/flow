import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, parseState, stringifyState, type ExecutionState } from '../../execution-state.mjs';

test('execution state round-trips canonical v3 state', () => {
  const state: ExecutionState = {
    ...emptyState(),
    active: { work_item: 'W101' },
    checkpoint: {
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'work_item', ref: 'W101', revision: 'spec-rev' },
      status: 'active',
      inputs: [{ ref: '_flow/work-items/W101-example/spec.md', revision: 'spec-rev' }],
      dimensions: [],
      assumptions: [],
      latest_authorized_direction: 'Keep task decomposition bounded to W101.',
      next_frontier: [],
      updated_at: '2026-10-02T12:00:00.000Z'
    }
  };
  assert.deepEqual(parseState(stringifyState(state)), state);
});

test('execution state reads v2 as v3 without trusting legacy execution/task cursors', () => {
  const parsed = parseState(`
schema_version: 2
execution:
  phase: implementation
  step: execute_task
active:
  work_item: W101
  task: W101-T004
stop_reason: external_action
migration:
  status: completed
`);
  assert.deepEqual(parsed, {
    schema_version: 3,
    active: { work_item: 'W101' },
    checkpoint: null,
    migration: { status: 'completed' }
  });
});

test('execution state rejects malformed v3 structure and migration state', () => {
  assert.throws(() => parseState('{'), /invalid/);
  assert.throws(() => parseState('[]'), /must be a mapping/);
  assert.throws(() => parseState('schema_version: 1'), /schema_version/);
  assert.throws(
    () =>
      parseState(
        'schema_version: 3\nactive:\n  work_item: bad\ncheckpoint: null\nmigration:\n  status: completed\n'
      ),
    /active.work_item/
  );
  assert.throws(
    () =>
      parseState(
        'schema_version: 3\nactive:\n  work_item: null\ncheckpoint: null\nmigration:\n  status: running\n'
      ),
    /migration.status/
  );
});
