import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordApproval } from '../../commands/record.js';
import { beginCheckpoint, markCheckpointApprovalReady } from '../../../checkpoint/operations/checkpoint.mjs';
import { documentRevision, isProjectDocumentApproved } from '../../../../domain/project/document.mjs';
import { loadExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';

const PRD = `---
schema_version: 2
status: draft
experience: not_required
---

# Product Requirements
Concrete.
## Purpose
Concrete.
## Users
Concrete.
## Scope
Concrete.
## Requirements
Concrete.
## Constraints
Concrete.
## Non-goals
Concrete.
`;

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-approval-record-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), PRD);
  return root;
}

test('recordApproval rejects a new approval without an approval-ready checkpoint', (t) => {
  const root = project(t);
  assert.throws(
    () =>
      recordApproval({
        root,
        target: '_flow/docs/prd.md',
        approvedAt: '2026-10-03T12:00:00.000Z'
      }),
    /matching approval-ready checkpoint is required/
  );
  assert.equal(isProjectDocumentApproved(fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8')), false);
});

test('recordApproval persists the exact approved revision and clears its checkpoint', (t) => {
  const root = project(t);
  const target = '_flow/docs/prd.md';
  const revision = documentRevision(PRD);
  beginCheckpoint(
    root,
    {
      phase: 'discovery',
      step: 'await_approval',
      target: { kind: 'project_document', ref: target, revision: null },
      inputs: [],
      dimensions: [{ id: 'scope', state: 'resolved', summary: 'Scope is complete.' }],
      assumptions: [],
      latest_authorized_direction: 'Approve this exact PRD.',
      next_frontier: []
    },
    { now: () => '2026-10-03T11:59:00.000Z' }
  );
  markCheckpointApprovalReady(root, revision, { now: () => '2026-10-03T12:00:00.000Z' });

  const result = recordApproval({
    root,
    target,
    approvedAt: '2026-10-03T12:01:00.000Z'
  });

  assert.equal(result.revision, revision);
  assert.equal(isProjectDocumentApproved(fs.readFileSync(path.join(root, target), 'utf8')), true);
  assert.equal(loadExecutionState(root).checkpoint, null);
});
