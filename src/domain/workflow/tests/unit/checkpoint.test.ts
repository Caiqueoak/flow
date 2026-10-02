import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCheckpoint, type Checkpoint } from '../../checkpoint.mjs';

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    phase: 'discovery',
    step: 'explore_product',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
    status: 'active',
    inputs: [{ ref: 'README.md', revision: 'abc123' }],
    dimensions: [
      { id: 'D001', state: 'resolved', summary: 'Primary user identified.' },
      { id: 'D002', state: 'unresolved', summary: 'Choose retention boundary.' },
      { id: 'D003', state: 'deferred', summary: 'Multi-region scope.', revisit: 'Before expansion.' },
      { id: 'D004', state: 'not_relevant', summary: 'Offline mode.' }
    ],
    assumptions: [{ id: 'A001', state: 'testing', summary: 'Traffic remains low.' }],
    latest_authorized_direction: 'Keep the first release small.',
    next_frontier: ['D002'],
    updated_at: '2026-10-02T12:00:00Z',
    ...overrides
  };
}

test('checkpoint preserves compact resumability state', () => {
  const value = checkpoint();
  assert.deepEqual(parseCheckpoint(value), value);
});

test('checkpoint next frontier must reference unresolved dimensions', () => {
  assert.throws(
    () => parseCheckpoint(checkpoint({ next_frontier: ['D001'] })),
    /must reference an unresolved dimension/
  );
});

test('approval-ready checkpoint rejects unresolved state and assumptions under test', () => {
  assert.throws(
    () =>
      parseCheckpoint(
        checkpoint({
          status: 'approval_ready',
          target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: 'rev-1' }
        })
      ),
    /unresolved dimensions remain/
  );

  assert.throws(
    () =>
      parseCheckpoint(
        checkpoint({
          status: 'approval_ready',
          target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: 'rev-1' },
          dimensions: [{ id: 'D001', state: 'resolved', summary: 'Resolved.' }],
          next_frontier: []
        })
      ),
    /assumptions remain under test/
  );
});

test('approval-ready checkpoint requires an exact target revision and closed frontier', () => {
  const ready = checkpoint({
    status: 'approval_ready',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: 'exact-revision' },
    dimensions: [
      { id: 'D001', state: 'resolved', summary: 'Resolved.' },
      { id: 'D002', state: 'deferred', summary: 'Deferred.' },
      { id: 'D003', state: 'not_relevant', summary: 'Not relevant.' }
    ],
    assumptions: [],
    next_frontier: []
  });

  assert.deepEqual(parseCheckpoint(ready), ready);
  assert.throws(
    () => parseCheckpoint({ ...ready, target: { ...ready.target, revision: null } }),
    /revision is required/
  );
});
