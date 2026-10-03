import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import {
  beginCheckpoint,
  clearCheckpoint,
  markCheckpointApprovalReady,
  updateCheckpoint
} from '../../operations/checkpoint.mjs';

function payload(state: 'unresolved' | 'resolved' = 'unresolved') {
  return {
    phase: 'discovery',
    step: 'explore_product',
    target: { kind: 'project_document' as const, ref: '_flow/docs/prd.md', revision: null },
    inputs: [],
    dimensions: [
      {
        id: 'D001',
        state,
        summary: 'Choose the primary offline behavior.'
      }
    ],
    assumptions: [],
    latest_authorized_direction: 'Prefer the smallest coherent MVP.',
    next_frontier: state === 'unresolved' ? ['D001'] : []
  };
}

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-checkpoint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });
  return root;
}

test('checkpoint begin, update, ready and clear persist deterministic state', (t) => {
  const root = project(t);
  beginCheckpoint(root, payload(), { now: () => '2026-10-02T12:00:00Z' });
  assert.equal(loadExecutionState(root).checkpoint?.next_frontier[0], 'D001');

  updateCheckpoint(root, payload('resolved'), { now: () => '2026-10-02T12:30:00Z' });
  const ready = markCheckpointApprovalReady(root, 'prd-rev-1', {
    now: () => '2026-10-02T13:00:00Z'
  });
  assert.equal(ready.status, 'approval_ready');
  assert.equal(ready.target.revision, 'prd-rev-1');

  assert.throws(
    () => clearCheckpoint(root, { targetRef: '_flow/docs/prd.md' }),
    /requires the expected target revision/
  );
  clearCheckpoint(root, {
    targetRef: '_flow/docs/prd.md',
    targetRevision: 'prd-rev-1'
  });
  assert.equal(loadExecutionState(root).checkpoint, null);
});

test('approval-ready transition rejects unresolved required dimensions', (t) => {
  const root = project(t);
  beginCheckpoint(root, payload(), { now: () => '2026-10-02T12:00:00Z' });
  assert.throws(() => markCheckpointApprovalReady(root, 'prd-rev-1'), /unresolved/);
});

test('new-scope checkpoint cannot become approval-ready while consequential dimensions remain unresolved', (t) => {
  const root = project(t);
  beginCheckpoint(
    root,
    {
      phase: 'discovery',
      step: 'project',
      target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
      inputs: [],
      dimensions: [
        {
          id: 'product_scope',
          state: 'resolved',
          summary: 'Product impact is bounded.'
        },
        {
          id: 'experience_relevance',
          state: 'unresolved',
          summary: 'Experience relevance is still being assessed.'
        },
        {
          id: 'engineering_impact',
          state: 'deferred',
          summary: 'Engineering impact will be revisited after the integration contract is known.',
          revisit: 'Revisit before engineering synthesis.'
        }
      ],
      assumptions: [],
      latest_authorized_direction: 'Keep the new scope bounded.',
      next_frontier: ['experience_relevance']
    },
    { now: () => '2026-10-03T19:10:00Z' }
  );

  assert.throws(() => markCheckpointApprovalReady(root, 'prd-new-scope-rev'), /unresolved/);
  assert.equal(loadExecutionState(root).checkpoint?.status, 'active');
});
