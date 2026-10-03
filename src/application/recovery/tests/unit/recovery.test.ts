import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { approveProjectDocument, documentRevision } from '../../../../domain/project/document.mjs';
import { parseCheckpoint } from '../../../../domain/workflow/checkpoint.mjs';
import { emptyState } from '../../../../domain/workflow/execution-state.mjs';
import { validateProject } from '../../../project-validation.mjs';
import { diagnoseProject } from '../../../doctor/operations/doctor.mjs';
import { routeProject } from '../../../route/operations/route.mjs';
import { inspectRecovery, repairRecovery } from '../../recovery.mjs';
import { writeExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import { serializeWorkItemSpec, specificationRevision } from '../../../../domain/work-item/specification.mjs';
import type { WorkItemId, WorkItemSpecMetadata } from '../../../../domain/work-item/work-item.js';

const PRD = `---
schema_version: 2
status: draft
experience: not_required
---

# Product Requirements

## Purpose
Purpose.

## Users
Users.

## Scope
Scope.

## Requirements
Requirements.

## Constraints
Constraints.

## Non-goals
Non-goals.
`;

function project(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-recovery-w3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '_flow', 'work-items'), { recursive: true });
  fs.mkdirSync(path.join(root, '_flow', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(root, '_flow', 'gates.yaml'), 'schema_version: 2\ngates: []\n');
  return root;
}

function setCheckpoint(root: string, value: Parameters<typeof parseCheckpoint>[0]): void {
  const state = emptyState();
  state.checkpoint = parseCheckpoint(value);
  writeExecutionState(root, state);
}

function baseCheckpoint(overrides: Record<string, unknown>) {
  return {
    phase: 'discovery',
    step: 'project',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
    status: 'active',
    inputs: [],
    dimensions: [],
    assumptions: [],
    latest_authorized_direction: null,
    next_frontier: [],
    updated_at: '2026-10-02T22:00:00Z',
    ...overrides
  };
}

function writeWorkItem(root: string, id: WorkItemId = 'W001'): string {
  const folder = path.join(root, '_flow', 'work-items', `${id}-sample`);
  fs.mkdirSync(folder, { recursive: true });
  const metadata: WorkItemSpecMetadata = {
    schema_version: 1,
    work_item: id,
    title: 'Sample',
    outcome: 'Sample outcome.',
    kind: 'feature',
    priority: 1,
    depends_on: [],
    blockers: [],
    maturity: 'outlined'
  };
  const body = '# Work Item Specification\n\n## Outcome\n\nSample.\n';
  fs.writeFileSync(path.join(folder, 'spec.md'), serializeWorkItemSpec(metadata, body));
  fs.writeFileSync(path.join(folder, 'tasks.yaml'), stringify({ schema_version: 3, work_item: id, tasks: [] }));
  fs.writeFileSync(path.join(folder, 'review.yaml'), stringify({ schema_version: 1, work_item: id, status: 'pending' }));
  return specificationRevision(metadata, body);
}

test('exact-approved target with matching stale approval-ready checkpoint is safely repaired', (t) => {
  const root = project(t);
  const approved = approveProjectDocument(PRD, '2026-10-02T21:00:00Z');
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), approved.text);
  setCheckpoint(
    root,
    baseCheckpoint({
      status: 'approval_ready',
      target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: approved.revision }
    })
  );

  const before = inspectRecovery(root);
  assert.equal(before.classification, 'safely_repairable');
  assert.equal(before.repair?.kind, 'clear_stale_checkpoint');

  const after = repairRecovery(root);
  assert.equal(after.classification, 'resumable');
  assert.equal(after.checkpoint, null);
});

test('Doctor clears only a proven-safe stale approval-ready checkpoint', (t) => {
  const root = project(t);
  const approved = approveProjectDocument(PRD, '2026-10-02T21:00:00Z');
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), approved.text);
  setCheckpoint(
    root,
    baseCheckpoint({
      status: 'approval_ready',
      target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: approved.revision }
    })
  );

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'pass');
  assert.match(recovery?.message ?? '', /Cleared stale approval-ready checkpoint/);
  assert.equal(inspectRecovery(root).checkpoint, null);
});

test('revision-mismatching approval-ready checkpoint is never auto-cleared', (t) => {
  const root = project(t);
  const approved = approveProjectDocument(PRD, '2026-10-02T21:00:00Z');
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), approved.text);
  setCheckpoint(
    root,
    baseCheckpoint({
      status: 'approval_ready',
      target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: '0'.repeat(64) }
    })
  );

  const result = repairRecovery(root);
  assert.equal(result.classification, 'requires_reconciliation');
  assert.equal(result.findings[0]?.code, 'RECOVERY_TARGET_REVISION_MISMATCH');
  assert.ok(inspectRecovery(root).checkpoint);
});

test('missing checkpoint input blocks recovery without changing canonical state', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), PRD);
  setCheckpoint(
    root,
    baseCheckpoint({
      inputs: [{ ref: '_flow/docs/experience.md', revision: '0'.repeat(64) }]
    })
  );
  const before = fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8');

  const assessment = repairRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.equal(assessment.findings[0]?.code, 'RECOVERY_INPUT_MISSING');
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8'), before);
});

test('route, validate and Doctor expose the same stale-input recovery conflict', (t) => {
  const root = project(t);
  const revision = writeWorkItem(root);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision: revision.replace(/^./, revision[0] === '0' ? '1' : '0') }]
    })
  );

  const route = routeProject(root);
  assert.equal(route.phase, 'reconcile');
  assert.match(route.details?.join(' ') ?? '', /RECOVERY_INPUT_REVISION_MISMATCH/);

  const validation = validateProject(root);
  assert.ok(validation.some((finding) => finding.code === 'RECOVERY_INPUT_REVISION_MISMATCH'));

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'fail');
  assert.match(recovery?.message ?? '', /RECOVERY_INPUT_REVISION_MISMATCH/);
});

test('fresh route calls derive the same continuation from repository state only', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), PRD);
  setCheckpoint(root, baseCheckpoint({}));

  assert.deepEqual(routeProject(root), routeProject(root));
});

test('approved spec can also prove an exact stale approval-ready checkpoint repair', (t) => {
  const root = project(t);
  const revision = writeWorkItem(root);
  const spec = path.join(root, '_flow', 'work-items', 'W001-sample', 'spec.md');
  const text = fs.readFileSync(spec, 'utf8');
  const parsed = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  assert.ok(parsed);
  const metadata = {
    schema_version: 1,
    work_item: 'W001' as WorkItemId,
    title: 'Sample',
    outcome: 'Sample outcome.',
    kind: 'feature' as const,
    priority: 1,
    depends_on: [] as WorkItemId[],
    blockers: [],
    maturity: 'outlined' as const,
    approval: { at: '2026-10-02T21:00:00Z', revision }
  };
  fs.writeFileSync(spec, serializeWorkItemSpec(metadata, parsed[2] ?? ''));

  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'specification',
      step: 'await_approval',
      status: 'approval_ready',
      target: { kind: 'work_item_spec', ref: 'W001', revision }
    })
  );

  assert.equal(inspectRecovery(root).classification, 'safely_repairable');
});

test('document revision helper used by recovery matches approved content identity', () => {
  const approved = approveProjectDocument(PRD, '2026-10-02T21:00:00Z');
  assert.equal(documentRevision(approved.text), approved.revision);
});
