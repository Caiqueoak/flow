import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { approveProjectDocument, documentRevision } from '../../../../domain/project/document.mjs';
import {
  serializeWorkItemSpec,
  specificationRevision
} from '../../../../domain/work-item/specification.mjs';
import { parseCheckpoint } from '../../../../domain/workflow/checkpoint.mjs';
import { emptyState } from '../../../../domain/workflow/execution-state.mjs';
import { writeExecutionState, loadExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import { diagnoseProject } from '../../../doctor/operations/doctor.mjs';
import { validateProject } from '../../../project-validation.mjs';
import { inspectRecoveryState } from '../../../recovery-consistency.mjs';
import { routeProject } from '../../operations/route.mjs';

const PRD_HEADINGS = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
] as const;

function project(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-w3-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '_flow', 'work-items'), { recursive: true });
  return root;
}

function checkpoint(
  root: string,
  {
    phase,
    step,
    kind,
    ref,
    status = 'active',
    revision = null,
    inputs = []
  }: {
    phase: string;
    step: string;
    kind: string;
    ref: string;
    status?: 'active' | 'approval_ready';
    revision?: string | null;
    inputs?: Array<{ ref: string; revision: string }>;
  }
): void {
  const state = emptyState();
  state.checkpoint = parseCheckpoint({
    phase,
    step,
    target: { kind, ref, revision },
    status,
    inputs,
    dimensions: [],
    assumptions: [],
    latest_authorized_direction: null,
    next_frontier: [],
    updated_at: '2026-10-02T12:00:00Z'
  });
  writeExecutionState(root, state);
}

function writeDraftProjectDocument(root: string, name: string, headings: readonly string[], metadata = ''): string {
  const text = `---
schema_version: 2
status: draft
${metadata}---

${headings.map((heading) => `${heading}
Concrete contract.`).join('\n\n')}
`;
  fs.writeFileSync(path.join(root, '_flow', 'docs', name), text);
  return text;
}

function writeWorkItem(
  root: string,
  {
    id = 'W001',
    maturity = 'outlined',
    approved = false,
    tasks = []
  }: {
    id?: string;
    maturity?: 'outlined' | 'ready';
    approved?: boolean;
    tasks?: Array<{ id: string; title: string; state: 'pending' | 'in_progress' | 'completed'; depends_on: string[] }>;
  } = {}
): string {
  const folder = path.join(root, '_flow', 'work-items', `${id}-example`);
  fs.mkdirSync(folder, { recursive: true });

  const body =
    maturity === 'ready'
      ? `# Work Item Specification

## Problem
Problem.

## Scope
Scope.

## Non-goals
None.

## Requirements
Requirement.

## Acceptance criteria
Acceptance.

## Contracts
Contract.

## Data and APIs
None.

## Edge cases
Edge.

## Risks
Risk.

## Decisions
Decision.

## Gates
Gate.
`
      : '# Work Item Specification\n\n## Outcome\n\nExample outcome.\n';

  const metadata: any = {
    schema_version: 1,
    work_item: id,
    title: 'Example',
    outcome: 'Example outcome',
    kind: 'feature',
    priority: 1,
    depends_on: [],
    blockers: [],
    maturity
  };
  if (approved) {
    metadata.approval = {
      at: '2026-10-02T12:00:00Z',
      revision: specificationRevision(metadata, body)
    };
  }

  fs.writeFileSync(path.join(folder, 'spec.md'), serializeWorkItemSpec(metadata, body));
  fs.writeFileSync(
    path.join(folder, 'tasks.yaml'),
    stringify({ schema_version: 3, work_item: id, tasks }, { lineWidth: 0 })
  );
  fs.writeFileSync(
    path.join(folder, 'review.yaml'),
    stringify({ schema_version: 1, work_item: id, status: 'pending' }, { lineWidth: 0 })
  );
  return folder;
}

test('active discovery checkpoint resumes from repository state before artifact inference', (t) => {
  const root = project(t);
  checkpoint(root, {
    phase: 'discovery',
    step: 'explore_product',
    kind: 'project_document',
    ref: '_flow/docs/prd.md'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'discovery');
  assert.equal(route.instruction, 'discovery/step-01-project.md');
});

test('active experience checkpoint wins over a valid-looking partial artifact', (t) => {
  const root = project(t);
  writeDraftProjectDocument(root, 'experience.md', ['# Experience']);
  checkpoint(root, {
    phase: 'experience',
    step: 'define',
    kind: 'project_document',
    ref: '_flow/docs/experience.md'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'experience');
  assert.equal(route.instruction, 'experience/step-01-define.md');
});

test('active engineering checkpoint wins over a valid-looking partial artifact', (t) => {
  const root = project(t);
  writeDraftProjectDocument(root, 'engineering.md', ['# Engineering']);
  checkpoint(root, {
    phase: 'engineering',
    step: 'synthesize',
    kind: 'project_document',
    ref: '_flow/docs/engineering.md'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'engineering');
  assert.equal(route.instruction, 'engineering/step-02-synthesize.md');
});

test('backlog-mapping checkpoint wins over existing outlined work-item shells', (t) => {
  const root = project(t);
  writeWorkItem(root);
  checkpoint(root, {
    phase: 'planning',
    step: 'map_work_items',
    kind: 'work_item_map',
    ref: '_flow/work-items'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'planning');
  assert.equal(route.instruction, 'planning/step-01-plan-work-item.md');
});

test('task-planning checkpoint wins over a non-empty pending task list', (t) => {
  const root = project(t);
  writeWorkItem(root, {
    maturity: 'ready',
    approved: true,
    tasks: [{ id: 'T001', title: 'First task', state: 'pending', depends_on: [] }]
  });
  checkpoint(root, {
    phase: 'planning',
    step: 'create_tasks',
    kind: 'task_plan',
    ref: 'W001'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'planning');
  assert.equal(route.instruction, 'planning/step-01-create-tasks.md');
  assert.equal(route.work_item, 'W001');
});

test('specification checkpoint resumes the correct work item', (t) => {
  const root = project(t);
  writeWorkItem(root);
  checkpoint(root, {
    phase: 'specification',
    step: 'deepen_spec',
    kind: 'work_item_spec',
    ref: 'W001'
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'specification');
  assert.equal(route.instruction, 'specification/step-01-deepen-spec.md');
  assert.equal(route.work_item, 'W001');
});

test('Doctor clears only an exact-approved matching stale approval-ready checkpoint', (t) => {
  const root = project(t);
  const draft = writeDraftProjectDocument(root, 'prd.md', PRD_HEADINGS, 'experience: not_required\n');
  const approved = approveProjectDocument(draft, '2026-10-02T12:00:00Z').text;
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), approved);
  const revision = documentRevision(approved);

  checkpoint(root, {
    phase: 'discovery',
    step: 'await_approval',
    kind: 'project_document',
    ref: '_flow/docs/prd.md',
    status: 'approval_ready',
    revision
  });

  const before = inspectRecoveryState(root);
  assert.equal(before.classification, 'safely_repairable');

  const result = diagnoseProject(root, { quick: true });
  assert.ok(result.checks.some((check) => check.id === 'recovery' && check.status === 'pass'));
  assert.equal(loadExecutionState(root).checkpoint, null);
});

test('revision-mismatching checkpoint is not auto-cleared and all surfaces report the same conflict', (t) => {
  const root = project(t);
  const draft = writeDraftProjectDocument(root, 'prd.md', PRD_HEADINGS, 'experience: not_required\n');
  const originalRevision = documentRevision(draft);
  fs.appendFileSync(path.join(root, '_flow', 'docs', 'prd.md'), '\nchanged after checkpoint\n');

  checkpoint(root, {
    phase: 'discovery',
    step: 'await_approval',
    kind: 'project_document',
    ref: '_flow/docs/prd.md',
    status: 'approval_ready',
    revision: originalRevision
  });

  const route = routeProject(root);
  assert.equal(route.phase, 'reconcile');
  assert.equal(route.reason, 'RECOVERY_CHECKPOINT_TARGET_REVISION_MISMATCH');

  const validation = validateProject(root);
  assert.ok(validation.some((finding) => finding.code === 'RECOVERY_CHECKPOINT_TARGET_REVISION_MISMATCH'));

  const doctor = diagnoseProject(root, { quick: true });
  const recoveryCheck = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recoveryCheck?.status, 'fail');
  assert.match(recoveryCheck?.message ?? '', /RECOVERY_CHECKPOINT_TARGET_REVISION_MISMATCH/);
  assert.notEqual(loadExecutionState(root).checkpoint, null);
});

test('missing or stale checkpoint inputs require reconciliation before continuation', (t) => {
  const root = project(t);
  checkpoint(root, {
    phase: 'engineering',
    step: 'synthesize',
    kind: 'project_document',
    ref: '_flow/docs/engineering.md',
    inputs: [{ ref: '_flow/docs/prd.md', revision: 'a'.repeat(64) }]
  });

  const missing = inspectRecoveryState(root);
  assert.equal(missing.classification, 'requires_reconciliation');
  assert.equal(missing.findings[0]?.code, 'RECOVERY_CHECKPOINT_INPUT_MISSING');

  const prd = writeDraftProjectDocument(root, 'prd.md', PRD_HEADINGS, 'experience: not_required\n');
  assert.notEqual(documentRevision(prd), 'a'.repeat(64));

  const stale = inspectRecoveryState(root);
  assert.equal(stale.classification, 'requires_reconciliation');
  assert.equal(stale.findings[0]?.code, 'RECOVERY_CHECKPOINT_INPUT_REVISION_MISMATCH');
});

test('fresh route calls derive the same continuation from persisted repository state only', (t) => {
  const root = project(t);
  writeWorkItem(root);
  checkpoint(root, {
    phase: 'specification',
    step: 'deepen_spec',
    kind: 'work_item_spec',
    ref: 'W001'
  });

  assert.deepEqual(routeProject(root), routeProject(root));
});
