import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCheckpoint, withCheckpointStatus, type WorkflowCheckpoint } from '../../checkpoint.mjs';

function checkpoint(overrides: Partial<WorkflowCheckpoint> = {}): WorkflowCheckpoint {
  return {
    phase: 'discovery',
    step: 'explore_product',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
    status: 'active',
    inputs: [],
    dimensions: [
      { id: 'D001', state: 'resolved', summary: 'Primary user is known.' },
      { id: 'D002', state: 'unresolved', summary: 'Choose offline behavior.' }
    ],
    assumptions: [{ id: 'A001', state: 'testing', summary: 'Offline use is uncommon.' }],
    latest_authorized_direction: 'Keep the first release narrow.',
    next_frontier: ['D002'],
    updated_at: '2026-10-02T12:00:00.000Z',
    ...overrides
  };
}

test('checkpoint parser preserves compact resumability state', () => {
  assert.deepEqual(parseCheckpoint(checkpoint()), checkpoint());
});

test('checkpoint validates frontier references and stable dimensions', () => {
  assert.throws(() => parseCheckpoint(checkpoint({ next_frontier: [] })), /next_frontier/);
  assert.throws(() => parseCheckpoint(checkpoint({ next_frontier: ['D999'] })), /unknown dimension/);
  assert.throws(() => parseCheckpoint(checkpoint({ next_frontier: ['D001'] })), /only unresolved/);
});

test('approval-ready checkpoint requires a fixed target and no unresolved runtime blockers', () => {
  assert.throws(
    () =>
      withCheckpointStatus(checkpoint(), 'approval_ready', {
        targetRevision: 'rev-1',
        updatedAt: '2026-10-02T13:00:00Z'
      }),
    /unresolved/
  );
  const ready = withCheckpointStatus(
    checkpoint({
      dimensions: [{ id: 'D001', state: 'resolved', summary: 'Primary user is known.' }],
      assumptions: [],
      next_frontier: []
    }),
    'approval_ready',
    { targetRevision: 'rev-1', updatedAt: '2026-10-02T13:00:00Z' }
  );
  assert.equal(ready.status, 'approval_ready');
  assert.equal(ready.target.revision, 'rev-1');
});
