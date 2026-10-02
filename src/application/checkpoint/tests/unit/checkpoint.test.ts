import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  beginCheckpoint,
  clearCheckpoint,
  currentCheckpoint,
  markCheckpointApprovalReady,
  updateCheckpoint,
  type CheckpointData
} from '../../operations/checkpoint.mjs';

const clock = { now: () => new Date('2026-10-02T12:00:00Z') };

function projectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-checkpoint-app-'));
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });
  return root;
}

function data(overrides: Partial<CheckpointData> = {}): CheckpointData {
  return {
    phase: 'planning',
    step: 'create_tasks',
    target: { kind: 'work_item_plan', ref: '_flow/work-items/W001-example/tasks.yaml', revision: null },
    inputs: [{ ref: '_flow/work-items/W001-example/spec.md', revision: 'spec-revision' }],
    dimensions: [{ id: 'D001', state: 'unresolved', summary: 'Choose task boundary.' }],
    assumptions: [],
    latest_authorized_direction: 'Prefer cohesive task ownership.',
    next_frontier: ['D001'],
    ...overrides
  };
}

test('checkpoint lifecycle begins and updates repository state', () => {
  const root = projectRoot();
  const begun = beginCheckpoint(root, data(), { clock });
  assert.equal(begun.status, 'active');
  assert.equal(begun.updated_at, '2026-10-02T12:00:00.000Z');

  const updated = updateCheckpoint(
    root,
    data({
      dimensions: [{ id: 'D001', state: 'resolved', summary: 'Use one cohesive persistence task.' }],
      next_frontier: []
    }),
    { clock }
  );
  assert.equal(updated.dimensions[0]?.state, 'resolved');
  assert.deepEqual(currentCheckpoint(root), updated);
});

test('checkpoint update cannot silently switch phase or target', () => {
  const root = projectRoot();
  beginCheckpoint(root, data(), { clock });

  assert.throws(
    () => updateCheckpoint(root, data({ phase: 'discovery' }), { clock }),
    /Clear it before beginning phase/
  );
  assert.throws(
    () =>
      updateCheckpoint(
        root,
        data({ target: { kind: 'work_item_plan', ref: '_flow/work-items/W002-other/tasks.yaml', revision: null } }),
        { clock }
      ),
    /target cannot change/
  );
});

test('approval-ready transition rejects unresolved required state without corrupting active checkpoint', () => {
  const root = projectRoot();
  const begun = beginCheckpoint(root, data(), { clock });

  assert.throws(() => markCheckpointApprovalReady(root, 'target-revision', { clock }), /unresolved dimensions/);
  assert.deepEqual(currentCheckpoint(root), begun);
});

test('checkpoint becomes approval-ready only after structural blockers close', () => {
  const root = projectRoot();
  beginCheckpoint(
    root,
    data({
      target: {
        kind: 'project_document',
        ref: '_flow/docs/prd.md',
        revision: null
      },
      dimensions: [{ id: 'D001', state: 'resolved', summary: 'Product boundary resolved.' }],
      next_frontier: []
    }),
    { clock }
  );

  const ready = markCheckpointApprovalReady(root, 'exact-target-revision', { clock });
  assert.equal(ready.status, 'approval_ready');
  assert.equal(ready.target.revision, 'exact-target-revision');
});

test('clear requires a completed frontier and exact revision for approval-ready checkpoints', () => {
  const root = projectRoot();
  beginCheckpoint(
    root,
    data({
      target: {
        kind: 'project_document',
        ref: '_flow/docs/prd.md',
        revision: null
      },
      dimensions: [{ id: 'D001', state: 'resolved', summary: 'Product boundary resolved.' }],
      next_frontier: []
    }),
    { clock }
  );
  markCheckpointApprovalReady(root, 'exact-target-revision', { clock });

  assert.throws(
    () => clearCheckpoint(root, { targetRef: '_flow/docs/prd.md', targetRevision: 'other-revision' }),
    /does not match/
  );
  assert.notEqual(currentCheckpoint(root), null);

  clearCheckpoint(root, {
    targetRef: '_flow/docs/prd.md',
    targetRevision: 'exact-target-revision'
  });
  assert.equal(currentCheckpoint(root), null);
});

test('active planning checkpoint cannot clear unresolved decision state', () => {
  const root = projectRoot();
  beginCheckpoint(root, data(), { clock });

  assert.throws(
    () => clearCheckpoint(root, { targetRef: '_flow/work-items/W001-example/tasks.yaml' }),
    /unresolved dimensions/
  );
  assert.notEqual(currentCheckpoint(root), null);
});
