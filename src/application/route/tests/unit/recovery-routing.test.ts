import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { parseCheckpoint } from '../../../../domain/workflow/checkpoint.mjs';
import { emptyState } from '../../../../domain/workflow/execution-state.mjs';
import { serializeWorkItemSpec, specificationRevision } from '../../../../domain/work-item/specification.mjs';
import { writeExecutionState } from '../../../../infrastructure/persistence/execution-state.mjs';
import type { WorkItemId, WorkItemSpecMetadata } from '../../../../domain/work-item/work-item.js';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';
import { approveProjectDocument } from '../../../../domain/project/document.mjs';
import { routeProject } from '../../operations/route.mjs';

function project(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-route-w3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '_flow', 'work-items'), { recursive: true });
  return root;
}

function authorizeProjectContracts(
  root: string,
  { experienceRequired = false }: { experienceRequired?: boolean } = {}
): void {
  const prd = approveProjectDocument(
    `---
schema_version: 2
status: draft
experience: ${experienceRequired ? 'required' : 'not_required'}
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
`,
    '2026-10-02T20:00:00Z'
  );
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), prd.text);

  if (experienceRequired) {
    const experience = approveProjectDocument(
      '---\nschema_version: 2\nstatus: draft\n---\n\n# Experience\n\nConcrete experience contract.\n',
      '2026-10-02T20:05:00Z'
    );
    fs.writeFileSync(path.join(root, '_flow', 'docs', 'experience.md'), experience.text);
  }

  const engineering = approveProjectDocument(
    `---
schema_version: 2
status: draft
baseline:
  profile: flow/readability-first@2
  existing_code_policy: not_applicable
---

${ENGINEERING_HEADINGS.map((heading) => `${heading}\nConcrete contract.`).join('\n\n')}
`,
    '2026-10-02T20:10:00Z'
  );
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'engineering.md'), engineering.text);
}

function setCheckpoint(root: string, checkpoint: ReturnType<typeof parseCheckpoint>): void {
  const state = emptyState();
  state.checkpoint = checkpoint;
  writeExecutionState(root, state);
}

function checkpoint(input: {
  phase: string;
  step: string;
  target: { kind: string; ref: string; revision: string | null };
  status?: 'active' | 'approval_ready';
  inputs?: Array<{ ref: string; revision: string }>;
}) {
  return parseCheckpoint({
    status: 'active',
    inputs: [],
    dimensions: [],
    assumptions: [],
    latest_authorized_direction: null,
    next_frontier: [],
    updated_at: '2026-10-02T22:00:00Z',
    ...input
  });
}

function writeWorkItem(
  root: string,
  id: WorkItemId = 'W001',
  tasks: unknown[] = [],
  approved = false
): { revision: string } {
  const folder = path.join(root, '_flow', 'work-items', `${id}-sample`);
  fs.mkdirSync(folder, { recursive: true });
  const metadata: WorkItemSpecMetadata = {
    schema_version: 1,
    work_item: id,
    title: 'Sample',
    outcome: 'Observable sample outcome.',
    kind: 'feature',
    priority: 1,
    depends_on: [],
    blockers: [],
    maturity: 'outlined'
  };
  const body = '# Work Item Specification\n\n## Outcome\n\nSample.\n';
  const revision = specificationRevision(metadata, body);
  const persistedMetadata = approved ? { ...metadata, approval: { at: '2026-10-02T20:15:00Z', revision } } : metadata;
  fs.writeFileSync(path.join(folder, 'spec.md'), serializeWorkItemSpec(persistedMetadata, body));
  fs.writeFileSync(path.join(folder, 'tasks.yaml'), stringify({ schema_version: 3, work_item: id, tasks }));
  fs.writeFileSync(
    path.join(folder, 'review.yaml'),
    stringify({ schema_version: 1, work_item: id, status: 'pending' })
  );
  return { revision };
}

test('active discovery checkpoint resumes even before PRD materialization', (t) => {
  const root = project(t);
  setCheckpoint(
    root,
    checkpoint({
      phase: 'discovery',
      step: 'project',
      target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null }
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'discovery',
    instruction: 'discovery/step-01-project.md'
  });
});

test('active experience checkpoint wins over a valid-looking draft artifact', (t) => {
  const root = project(t);
  authorizeProjectContracts(root, { experienceRequired: true });
  fs.writeFileSync(
    path.join(root, '_flow', 'docs', 'experience.md'),
    '---\nschema_version: 2\nstatus: draft\n---\n\n# Experience\n\nConcrete draft.\n'
  );
  setCheckpoint(
    root,
    checkpoint({
      phase: 'experience',
      step: 'define',
      target: { kind: 'project_document', ref: '_flow/docs/experience.md', revision: null }
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'experience',
    instruction: 'experience/step-01-define.md'
  });
});

test('active engineering checkpoint wins over a valid-looking partial artifact', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  fs.writeFileSync(
    path.join(root, '_flow', 'docs', 'engineering.md'),
    `---
schema_version: 2
status: draft
baseline:
  profile: flow/readability-first@2
  existing_code_policy: not_applicable
---

${ENGINEERING_HEADINGS.map((heading) => `${heading}\nConcrete draft.`).join('\n\n')}
`
  );
  setCheckpoint(
    root,
    checkpoint({
      phase: 'engineering',
      step: 'synthesize',
      target: { kind: 'project_document', ref: '_flow/docs/engineering.md', revision: null }
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });
});

test('backlog-mapping checkpoint wins over existing work-item shells', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  writeWorkItem(root);
  setCheckpoint(
    root,
    checkpoint({
      phase: 'planning',
      step: 'map_work_items',
      target: { kind: 'work_item_map', ref: '_flow/work-items', revision: null }
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'planning',
    instruction: 'planning/step-01-plan-work-item.md'
  });
});

test('task-planning checkpoint wins over non-empty tasks.yaml', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  const { revision } = writeWorkItem(
    root,
    'W001',
    [{ id: 'T001', title: 'Partial task', state: 'pending', depends_on: [] }],
    true
  );
  setCheckpoint(
    root,
    checkpoint({
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision }]
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'planning',
    instruction: 'planning/step-01-create-tasks.md',
    work_item: 'W001'
  });
});

test('task-planning checkpoint reconciles when task execution already started', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  const { revision } = writeWorkItem(root, 'W001', [
    { id: 'T001', title: 'Started too early', state: 'in_progress', depends_on: [] }
  ]);
  setCheckpoint(
    root,
    checkpoint({
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision }]
    })
  );

  const result = routeProject(root);
  assert.equal(result.phase, 'reconcile');
  assert.match(result.details?.join(' ') ?? '', /RECOVERY_PLANNING_STATE_CONFLICT/);
});

test('specification checkpoint resumes the referenced work item', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  writeWorkItem(root, 'W001');
  setCheckpoint(
    root,
    checkpoint({
      phase: 'specification',
      step: 'deepen_spec',
      target: { kind: 'work_item_spec', ref: 'W001', revision: null }
    })
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'specification',
    instruction: 'specification/step-01-deepen-spec.md',
    work_item: 'W001'
  });
});

test('stale checkpoint input routes to reconciliation with a stable recovery code', (t) => {
  const root = project(t);
  authorizeProjectContracts(root);
  writeWorkItem(root, 'W001');
  setCheckpoint(
    root,
    checkpoint({
      phase: 'planning',
      step: 'create_tasks',
      target: { kind: 'task_plan', ref: 'W001', revision: null },
      inputs: [{ ref: 'W001', revision: '0'.repeat(64) }]
    })
  );

  const result = routeProject(root);
  assert.equal(result.phase, 'reconcile');
  assert.equal(result.reason, 'recovery_conflict');
  assert.match(result.details?.[0] ?? '', /^RECOVERY_INPUT_REVISION_MISMATCH:/);
});
