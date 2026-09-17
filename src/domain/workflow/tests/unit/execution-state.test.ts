import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, parseState, stringifyState, WORKFLOW_STEPS, type ExecutionState } from '../../execution-state.mjs';

function state(overrides: Record<string, unknown> = {}) {
  return stringifyState({ ...emptyState(), ...overrides } as ExecutionState);
}

test('execution state round-trips canonical state', () => {
  const state: ExecutionState = { ...emptyState(), active: { work_item: 'W101', task: 'W101-T001' } };
  assert.deepEqual(parseState(stringifyState(state)), state);
});

test('execution state rejects malformed lifecycle and task ownership', () => {
  assert.throws(() => parseState('{'), /invalid/);
  assert.throws(() => parseState('[]'), /must be a mapping/);
  assert.throws(() => parseState('schema_version: 1'), /schema_version/);
  assert.throws(() => parseState(state({ execution: { phase: 'unknown', step: 'unknown' } })), /phase is invalid/);
  assert.throws(
    () => parseState(state({ execution: { phase: 'discovery', step: 'draft' } })),
    /step 'draft' is invalid/
  );
  assert.throws(() => parseState(state({ stop_reason: 'pause' })), /stop_reason/);
  assert.throws(() => parseState(state({ migration: { status: 'running' } })), /migration.status/);
  assert.throws(() => parseState(state({ active: { work_item: 'bad', task: null } })), /active.work_item/);
  assert.throws(() => parseState(state({ active: { work_item: 'W101', task: 'bad' } })), /active.task is invalid/);
  assert.throws(
    () =>
      parseState(
        'schema_version: 2\nexecution:\n  phase: discovery\n  step: define_problem\nactive:\n  work_item: W101\n  task: W102-T001\n'
      ),
    /does not belong/
  );
});

test('execution state accepts every workflow step, stop reason and migration status', () => {
  for (const [phase, steps] of Object.entries(WORKFLOW_STEPS)) {
    for (const step of steps) {
      const parsed = parseState(state({ execution: { phase, step } }));
      assert.deepEqual(parsed.execution, { phase, step });
    }
  }
  for (const stop_reason of [
    null,
    'consequential_decision',
    'external_action',
    'unrecoverable_blocker',
    'finished'
  ] as const)
    assert.equal(parseState(state({ stop_reason })).stop_reason, stop_reason);
  for (const status of ['not_required', 'pending_reconciliation', 'completed'] as const)
    assert.equal(parseState(state({ migration: { status } })).migration.status, status);
  assert.deepEqual(parseState(state({ active: { work_item: null, task: 'W101-T001' } })).active, {
    work_item: null,
    task: 'W101-T001'
  });
});
