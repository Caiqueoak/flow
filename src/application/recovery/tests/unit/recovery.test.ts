import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import {
  approveProjectDocument,
  documentRevision,
  parseProjectDocument,
  serializeProjectDocument
} from '../../../../domain/project/document.mjs';
import { parseCheckpoint } from '../../../../domain/workflow/checkpoint.mjs';
import { emptyState } from '../../../../domain/workflow/execution-state.mjs';
import { validateProject } from '../../../project-validation.mjs';
import { diagnoseProject } from '../../../doctor/operations/doctor.mjs';
import { routeProject } from '../../../route/operations/route.mjs';
import { inspectRecovery, repairRecovery } from '../../recovery.mjs';
import { writeExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import { serializeWorkItemSpec, specificationRevision } from '../../../../domain/work-item/specification.mjs';
import type { WorkItemId, WorkItemSpecMetadata } from '../../../../domain/work-item/work-item.js';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';

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

function writeAuthorizedProjectContracts(
  root: string,
  { experienceRequired = false }: { experienceRequired?: boolean } = {}
): { prdRevision: string; experienceRevision?: string; engineeringRevision: string } {
  const prdDraft = PRD.replace('experience: not_required', `experience: ${experienceRequired ? 'required' : 'not_required'}`);
  const prd = approveProjectDocument(prdDraft, '2026-10-02T20:00:00Z');
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), prd.text);

  let experienceRevision: string | undefined;
  if (experienceRequired) {
    const experience = approveProjectDocument(
      '---\\nschema_version: 2\\nstatus: draft\\n---\\n\\n# Experience\\n\\nConcrete experience contract.\\n',
      '2026-10-02T20:05:00Z'
    );
    experienceRevision = experience.revision;
    fs.writeFileSync(path.join(root, '_flow', 'docs', 'experience.md'), experience.text);
  }

  const engineeringDraft = `---
schema_version: 2
status: draft
baseline:
  profile: flow/readability-first@2
  existing_code_policy: not_applicable
---

${ENGINEERING_HEADINGS.map((heading) => `${heading}\\nConcrete contract.`).join('\\n\\n')}
`;
  const engineering = approveProjectDocument(engineeringDraft, '2026-10-02T20:10:00Z');
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'engineering.md'), engineering.text);

  return {
    prdRevision: prd.revision,
    ...(experienceRevision ? { experienceRevision } : {}),
    engineeringRevision: engineering.revision
  };
}

function removeProjectApproval(text: string): string {
  const parsed = parseProjectDocument(text);
  const metadata = { ...parsed.metadata, status: 'draft' };
  delete metadata.approval;
  delete metadata.approved_at;
  return serializeProjectDocument(metadata, parsed.body);
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

function parseWorkItemSpecForTest(text: string): { metadata: WorkItemSpecMetadata; body: string } {
  const match = text.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?([\\s\\S]*)$/);
  assert.ok(match);
  const parsed = YAML.parse(match[1] ?? '') as WorkItemSpecMetadata;
  return { metadata: parsed, body: match[2] ?? '' };
}

function writeWorkItem(root: string, id: WorkItemId = 'W001', approved = false): string {
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
  const revision = specificationRevision(metadata, body);
  const persistedMetadata = approved
    ? { ...metadata, approval: { at: '2026-10-02T20:15:00Z', revision } }
    : metadata;
  fs.writeFileSync(path.join(folder, 'spec.md'), serializeWorkItemSpec(persistedMetadata, body));
  fs.writeFileSync(path.join(folder, 'tasks.yaml'), stringify({ schema_version: 3, work_item: id, tasks: [] }));
  fs.writeFileSync(
    path.join(folder, 'review.yaml'),
    stringify({ schema_version: 1, work_item: id, status: 'pending' })
  );
  return revision;
}

test('malformed persisted execution state is consistent across route, validate and Doctor', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, '_flow', 'state.yaml'), 'schema_version: [broken');

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.equal(assessment.findings[0]?.code, 'RECOVERY_STATE_INVALID');

  const route = routeProject(root);
  assert.equal(route.phase, 'reconcile');
  assert.match(route.details?.join(' ') ?? '', /RECOVERY_STATE_INVALID/);

  const validation = validateProject(root);
  assert.ok(validation.some((finding) => finding.code === 'RECOVERY_STATE_INVALID'));

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'fail');
  assert.match(recovery?.message ?? '', /RECOVERY_STATE_INVALID/);
});

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

test('route stops at safe repair until Doctor clears the stale approval checkpoint', (t) => {
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

  assert.deepEqual(routeProject(root), {
    action: 'stop',
    phase: 'recovery',
    reason: 'safe_repair',
    instruction: 'Run `flow doctor --quick` to apply the deterministic recovery repair before routing continues.'
  });

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'pass');
  assert.match(recovery?.message ?? '', /Cleared stale approval-ready checkpoint/);
  assert.equal(inspectRecovery(root).checkpoint, null);

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });
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
  writeAuthorizedProjectContracts(root);
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

test('unsupported checkpoint phase requires reconciliation', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), PRD);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'unknown_phase'
    })
  );

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_CHECKPOINT_UNSUPPORTED'));
  assert.equal(assessment.continuation, null);
});

test('unsupported phase and target pair requires reconciliation', (t) => {
  const root = project(t);
  writeWorkItem(root);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'planning',
      target: { kind: 'work_item_spec', ref: 'W001', revision: null }
    })
  );

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_CHECKPOINT_UNSUPPORTED'));
  assert.equal(assessment.continuation, null);
});

test('approval-ready planning checkpoint requires reconciliation', (t) => {
  const root = project(t);
  const revision = writeWorkItem(root);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'planning',
      step: 'create_tasks',
      status: 'approval_ready',
      target: { kind: 'task_plan', ref: 'W001', revision }
    })
  );

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_CHECKPOINT_UNSUPPORTED'));
  assert.equal(assessment.continuation, null);
});

test('supported W3 checkpoint combinations remain resumable with required authorization', (t) => {
  const discoveryRoot = project(t);
  setCheckpoint(discoveryRoot, baseCheckpoint({}));
  assert.equal(inspectRecovery(discoveryRoot).classification, 'resumable');

  const experienceRoot = project(t);
  writeAuthorizedProjectContracts(experienceRoot, { experienceRequired: true });
  setCheckpoint(
    experienceRoot,
    baseCheckpoint({
      phase: 'experience',
      target: { kind: 'project_document', ref: '_flow/docs/experience.md', revision: null }
    })
  );
  assert.equal(inspectRecovery(experienceRoot).classification, 'resumable');

  const engineeringRoot = project(t);
  writeAuthorizedProjectContracts(engineeringRoot, { experienceRequired: true });
  setCheckpoint(
    engineeringRoot,
    baseCheckpoint({
      phase: 'engineering',
      target: { kind: 'project_document', ref: '_flow/docs/engineering.md', revision: null }
    })
  );
  assert.equal(inspectRecovery(engineeringRoot).classification, 'resumable');

  const planningRoot = project(t);
  writeAuthorizedProjectContracts(planningRoot);
  setCheckpoint(
    planningRoot,
    baseCheckpoint({
      phase: 'planning',
      target: { kind: 'work_item_map', ref: '_flow/work-items', revision: null }
    })
  );
  assert.equal(inspectRecovery(planningRoot).classification, 'resumable');

  const workItemRoot = project(t);
  writeAuthorizedProjectContracts(workItemRoot);
  const revision = writeWorkItem(workItemRoot, 'W001', true);
  setCheckpoint(
    workItemRoot,
    baseCheckpoint({
      phase: 'planning',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision }]
    })
  );
  assert.equal(inspectRecovery(workItemRoot).classification, 'resumable');

  setCheckpoint(
    workItemRoot,
    baseCheckpoint({
      phase: 'specification',
      target: { kind: 'work_item_spec', ref: 'W001', revision: null }
    })
  );
  assert.equal(inspectRecovery(workItemRoot).classification, 'resumable');
});

test('engineering recovery rejects a PRD that loses approval without changing revision', (t) => {
  const root = project(t);
  const { prdRevision } = writeAuthorizedProjectContracts(root);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'engineering',
      target: { kind: 'project_document', ref: '_flow/docs/engineering.md', revision: null },
      inputs: [{ ref: '_flow/docs/prd.md', revision: prdRevision }]
    })
  );

  const prdFile = path.join(root, '_flow', 'docs', 'prd.md');
  const before = fs.readFileSync(prdFile, 'utf8');
  const unapproved = removeProjectApproval(before);
  fs.writeFileSync(prdFile, unapproved);
  assert.equal(documentRevision(unapproved), prdRevision);

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_UPSTREAM_UNAUTHORIZED'));

  const route = routeProject(root);
  assert.equal(route.phase, 'reconcile');
  assert.match(route.details?.join(' ') ?? '', /RECOVERY_UPSTREAM_UNAUTHORIZED/);

  const validation = validateProject(root);
  assert.ok(validation.some((finding) => finding.code === 'RECOVERY_UPSTREAM_UNAUTHORIZED'));

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'fail');
  assert.match(recovery?.message ?? '', /RECOVERY_UPSTREAM_UNAUTHORIZED/);
});

test('experience recovery rejects a PRD that loses approval without changing revision', (t) => {
  const root = project(t);
  const { prdRevision } = writeAuthorizedProjectContracts(root, { experienceRequired: true });
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'experience',
      target: { kind: 'project_document', ref: '_flow/docs/experience.md', revision: null },
      inputs: [{ ref: '_flow/docs/prd.md', revision: prdRevision }]
    })
  );

  const prdFile = path.join(root, '_flow', 'docs', 'prd.md');
  const unapproved = removeProjectApproval(fs.readFileSync(prdFile, 'utf8'));
  fs.writeFileSync(prdFile, unapproved);
  assert.equal(documentRevision(unapproved), prdRevision);

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_UPSTREAM_UNAUTHORIZED'));
  assert.equal(routeProject(root).phase, 'reconcile');
});

test('task-planning recovery rejects a SPEC that loses approval without changing revision', (t) => {
  const root = project(t);
  writeAuthorizedProjectContracts(root);
  const revision = writeWorkItem(root, 'W001', true);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision }]
    })
  );

  const specFile = path.join(root, '_flow', 'work-items', 'W001-sample', 'spec.md');
  const parsed = parseWorkItemSpecForTest(fs.readFileSync(specFile, 'utf8'));
  delete parsed.metadata.approval;
  const unapproved = serializeWorkItemSpec(parsed.metadata, parsed.body);
  fs.writeFileSync(specFile, unapproved);
  assert.equal(specificationRevision(parsed.metadata, parsed.body), revision);

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_SPEC_UNAUTHORIZED'));

  const route = routeProject(root);
  assert.equal(route.phase, 'reconcile');
  assert.match(route.details?.join(' ') ?? '', /RECOVERY_SPEC_UNAUTHORIZED/);

  const validation = validateProject(root);
  assert.ok(validation.some((finding) => finding.code === 'RECOVERY_SPEC_UNAUTHORIZED'));

  const doctor = diagnoseProject(root, { quick: true, version: 'test', packageRoot: root });
  const recovery = doctor.checks.find((check) => check.id === 'recovery');
  assert.equal(recovery?.status, 'fail');
  assert.match(recovery?.message ?? '', /RECOVERY_SPEC_UNAUTHORIZED/);
});

test('backlog-mapping recovery rejects project contracts that lose authorization at the same revision', (t) => {
  const root = project(t);
  const { engineeringRevision } = writeAuthorizedProjectContracts(root);
  setCheckpoint(
    root,
    baseCheckpoint({
      phase: 'planning',
      step: 'map_work_items',
      target: { kind: 'work_item_map', ref: '_flow/work-items', revision: null },
      inputs: [{ ref: '_flow/docs/engineering.md', revision: engineeringRevision }]
    })
  );

  const engineeringFile = path.join(root, '_flow', 'docs', 'engineering.md');
  const unapproved = removeProjectApproval(fs.readFileSync(engineeringFile, 'utf8'));
  fs.writeFileSync(engineeringFile, unapproved);
  assert.equal(documentRevision(unapproved), engineeringRevision);

  const assessment = inspectRecovery(root);
  assert.equal(assessment.classification, 'requires_reconciliation');
  assert.ok(assessment.findings.some((finding) => finding.code === 'RECOVERY_UPSTREAM_UNAUTHORIZED'));
  assert.equal(routeProject(root).phase, 'reconcile');
});

test('document revision helper used by recovery matches approved content identity', () => {
  const approved = approveProjectDocument(PRD, '2026-10-02T21:00:00Z');
  assert.equal(documentRevision(approved.text), approved.revision);
});
