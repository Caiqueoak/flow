import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { captureCommandOutcome } from '../../../command-runtime.js';
import { emptyState, stringifyState } from '../../../../domain/workflow/execution-state.mjs';
import {
  completeMigrationReconciliation,
  migrateProject,
  migrationPlan,
  runMigrate
} from '../../operations/apply.mjs';
import { routeProject } from '../../../route/operations/route.mjs';
import { documentMetadata, isProjectDocumentApproved } from '../../../../domain/project/document.mjs';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';

function temporaryProject(t: test.TestContext, prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function canonicalProject(t: test.TestContext, flowVersion: string) {
  const root = temporaryProject(t, 'flow-migration-plan-');
  const flow = path.join(root, '_flow');
  fs.mkdirSync(path.join(flow, 'work-items'), { recursive: true });
  fs.writeFileSync(
    path.join(flow, 'config.yaml'),
    `schema_version: 4\nflow_version: ${flowVersion}\nruntimes: []\nengineering:\n  profile: readability-first-v2\n  existing_code_policy: not_applicable\n`
  );
  fs.writeFileSync(path.join(flow, 'gates.yaml'), 'schema_version: 2\ngates: []\n');
  return root;
}

test('allows a forward migration from a recorded Flow version', (t) => {
  const root = canonicalProject(t, '0.8.0');

  const plan = migrationPlan(root, '0.9.0');

  assert.equal(plan.from_version, '0.8.0');
  assert.equal(plan.to_version, '0.9.0');
  assert.equal(plan.can_apply, true);
  assert.deepEqual(plan.incompatibilities, []);
  assert.ok((plan.changes as string[]).includes('record executed Flow package version'));
});

test('blocks migration to an older Flow version', (t) => {
  const root = canonicalProject(t, '0.9.0');

  const plan = migrationPlan(root, '0.8.0');

  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.incompatibilities, ["Cannot migrate from newer Flow version '0.9.0' to older target '0.8.0'."]);
  assert.throws(
    () => migrateProject(root, { targetVersion: '0.8.0' }),
    /Cannot migrate from newer Flow version '0\.9\.0' to older target '0\.8\.0'/
  );
});

test('blocks a newer major project from being rewritten by an older target', (t) => {
  const root = canonicalProject(t, '1.0.0');

  const plan = migrationPlan(root, '0.8.0');

  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.incompatibilities, ["Cannot migrate from newer Flow version '1.0.0' to older target '0.8.0'."]);
});

test('allows forward migration across package major versions', (t) => {
  const root = canonicalProject(t, '0.8.0');

  const plan = migrationPlan(root, '2.0.1');
  const result = migrateProject(root, { targetVersion: '2.0.1' });

  assert.equal(plan.can_apply, true);
  assert.deepEqual(plan.incompatibilities, []);
  assert.equal(result.rescued, false);
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).flow_version, '2.0.1');
});

test('rejects malformed recorded Flow versions', (t) => {
  const root = canonicalProject(t, 'future');

  const plan = migrationPlan(root, '0.8.0');

  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.incompatibilities, [
    "Unknown source version 'future'. Expected a semantic version such as 0.8.0."
  ]);
});

test('continues to block a project with ambiguous Flow directories', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.mkdirSync(path.join(root, '.flow'));

  const plan = migrationPlan(root, '0.9.0');

  assert.equal(plan.can_apply, false);
  assert.deepEqual(plan.incompatibilities, [
    'Both .flow and _flow exist; reconcile the authoritative directory first.'
  ]);
});

function legacyProject(t: test.TestContext, items: unknown[], directory = '.flow') {
  const root = temporaryProject(t, 'flow-legacy-migration-');
  const flow = path.join(root, directory);
  fs.mkdirSync(path.join(flow, 'work-items'), { recursive: true });
  fs.writeFileSync(
    path.join(flow, 'config.yaml'),
    'schema_version: 2\nframework:\n  version: 0.5.0\nruntimes: [codex]\nengineering: {}\n'
  );
  fs.writeFileSync(path.join(flow, 'backlog.yaml'), JSON.stringify({ schema_version: 2, work_items: items }));
  fs.writeFileSync(path.join(flow, 'PRD.md'), '# Legacy product\n');
  fs.writeFileSync(path.join(flow, 'ENGINEERING.md'), '# Legacy engineering\n');
  fs.writeFileSync(path.join(flow, 'STATE.md'), '# Legacy state\n');
  fs.writeFileSync(path.join(flow, 'DECISIONS.md'), '# Legacy decisions\n');
  fs.writeFileSync(path.join(flow, 'SUMMARY.md'), '# Legacy summary\n');
  fs.writeFileSync(path.join(flow, 'GRAPH.md'), '# Legacy graph\n');
  return root;
}

const legacyItem = {
  id: '1',
  folder: 'old-feature',
  title: 'Old Feature',
  kind: 'feature',
  status: 'todo',
  priority: 2,
  depends_on: []
};

test('migrates the .flow layout transactionally and preserves legacy artifacts in a backup', (t) => {
  const root = legacyProject(t, [legacyItem]);
  const oldWorkItem = path.join(root, '.flow', 'work-items', 'old-feature');
  fs.mkdirSync(oldWorkItem);
  fs.writeFileSync(path.join(oldWorkItem, 'notes.md'), 'irreplaceable notes\n');

  const result = migrateProject(root, { targetVersion: '0.8.0' });

  assert.equal(result.unchanged, false);
  assert.ok(result.backup);
  assert.equal(fs.existsSync(path.join(root, '.flow')), false);
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8'), '# Legacy product\n');
  assert.equal(
    fs.readFileSync(path.join(root, '_flow', 'docs', 'legacy-work-items', 'W001-old-feature', 'notes.md'), 'utf8'),
    'irreplaceable notes\n'
  );
  assert.equal(fs.existsSync(path.join(root, '_flow', 'generated', 'backlog.yaml')), true);
  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).migration.status,
    'pending_reconciliation'
  );
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).flow_version, '0.8.0');
  assert.equal(fs.existsSync(path.join(result.backup!, 'backlog.yaml')), true);
});

test('migrates a legacy backlog already stored in _flow', (t) => {
  const root = legacyProject(t, [{ ...legacyItem, id: 'W7', state: 'done', folder: undefined }], '_flow');

  const result = migrateProject(root, { targetVersion: '0.8.0' });

  assert.equal(result.unchanged, false);
  assert.equal(fs.existsSync(path.join(root, '_flow', 'work-items', 'W007-old-feature', 'spec.md')), true);
  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'generated', 'backlog.yaml'), 'utf8')).work_items[0].id,
    'W007'
  );
});

test('archives invalid legacy formats and rebuilds a valid project for reconciliation', (t) => {
  const scenarios: Array<[string, unknown[], RegExp]> = [
    ['state', [{ ...legacyItem, state: 'invented' }], /Unknown legacy state/],
    ['ID', [{ ...legacyItem, id: 'none' }], /Cannot normalize ID/],
    ['ID collision', [legacyItem, { ...legacyItem, id: 'W001', title: 'Duplicate' }], /ID collision/],
    ['dependency', [{ ...legacyItem, depends_on: ['missing'] }], /Unknown work-item dependency/]
  ];
  for (const [label, items, expected] of scenarios) {
    const root = legacyProject(t, items);
    const before = fs.readFileSync(path.join(root, '.flow', 'backlog.yaml'), 'utf8');
    const result = migrateProject(root, { targetVersion: '2.0.1' });

    assert.equal(result.rescued, true, label);
    assert.match(result.rescue_reason ?? '', expected, label);
    assert.equal(fs.existsSync(path.join(root, '.flow')), false, label);
    assert.equal(
      fs.readFileSync(path.join(root, '_flow', 'docs', 'migration-backup', 'backlog.yaml'), 'utf8'),
      before,
      label
    );
    assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).flow_version, '2.0.1');
    assert.equal(
      parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).migration.status,
      'pending_reconciliation'
    );
    assert.equal(fs.existsSync(path.join(root, '_flow', 'generated', 'backlog.yaml')), true, label);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith('_flow-migration-')),
      [],
      label
    );
  }
});

test('rescues a normalized destination collision without losing either source directory', (t) => {
  const root = legacyProject(t, [legacyItem]);
  const workItems = path.join(root, '.flow', 'work-items');
  fs.mkdirSync(path.join(workItems, 'old-feature'));
  fs.mkdirSync(path.join(workItems, 'W001-old-feature'));

  const result = migrateProject(root, { targetVersion: '0.8.0' });

  assert.equal(result.rescued, true);
  assert.match(result.rescue_reason ?? '', /destination already exists/);
  const archive = path.join(root, '_flow', 'docs', 'migration-backup', 'work-items');
  assert.equal(fs.existsSync(path.join(archive, 'old-feature')), true);
  assert.equal(fs.existsSync(path.join(archive, 'W001-old-feature')), true);
});

test('rescues malformed canonical configuration', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(path.join(root, '_flow', 'config.yaml'), 'schema_version: [invalid\n');

  const plan = migrationPlan(root, '2.0.1');
  const result = migrateProject(root, { targetVersion: '2.0.1' });

  assert.equal(plan.can_apply, true);
  assert.ok(plan.changes.includes('archive unconvertible Flow artifacts for assisted reconciliation'));
  assert.equal(result.rescued, true);
  assert.equal(fs.existsSync(path.join(root, '_flow', 'docs', 'migration-backup', 'config.yaml')), true);
  assert.deepEqual(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).runtimes, []);
});

test('preserves safe runtime registrations when canonical artifacts require rescue', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(
    path.join(root, '_flow', 'config.yaml'),
    'schema_version: 4\nflow_version: 0.8.0\nruntimes:\n  - type: codex\n    skills_path: .codex/skills\nengineering:\n  profile: flow/readability-first@1\n  existing_code_policy: improve\n'
  );
  fs.mkdirSync(path.join(root, '_flow', 'work-items', 'unsupported-folder'));

  const result = migrateProject(root, { targetVersion: '2.0.1' });
  const config = parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8'));

  assert.equal(result.rescued, true);
  assert.deepEqual(config.runtimes, [{ type: 'codex', skills_path: '.codex/skills' }]);
  assert.equal(config.engineering.profile, 'flow/readability-first@2');
  assert.equal(config.engineering.existing_code_policy, 'incremental');
});

test('does not turn operational write failures into format rescue', (t) => {
  const root = canonicalProject(t, '0.8.0');
  const before = fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8');
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = ((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: unknown) => {
    if (String(file).includes('_flow-migration-') && path.basename(String(file)) === 'config.yaml') {
      const error = new Error('simulated permission failure') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      error.syscall = 'open';
      throw error;
    }
    return originalWrite(file, data, options as never);
  }) as typeof fs.writeFileSync;
  try {
    assert.throws(() => migrateProject(root, { targetVersion: '2.0.1' }), /simulated permission failure/);
  } finally {
    fs.writeFileSync = originalWrite;
  }

  assert.equal(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, '_flow', 'docs', 'migration-backup')), false);
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith('_flow-migration-')),
    []
  );
});

test('human-readable plans show apply status and blockers', async (t) => {
  const root = canonicalProject(t, '0.9.0');
  const outcome = await captureCommandOutcome(() => runMigrate({ args: ['--plan', '--path', root], version: '0.8.0' }));
  const output = outcome.kind === 'text' ? outcome.lines.join('\n') : '';

  assert.match(output, /Apply allowed: no/);
  assert.match(output, /Cannot migrate from newer Flow version '0\.9\.0' to older target '0\.8\.0'/);
});

function canonicalWorkItem(root: string) {
  const base = path.join(root, '_flow', 'work-items', 'W101-item');
  fs.mkdirSync(base, { recursive: true });
  const headings = [
    '# Work Item Specification',
    '## Problem',
    '## Scope',
    '## Non-goals',
    '## Requirements',
    '## Acceptance criteria',
    '## Contracts',
    '## Data and APIs',
    '## Edge cases',
    '## Risks',
    '## Decisions',
    '## Gates'
  ];
  fs.writeFileSync(
    path.join(base, 'spec.md'),
    `---\n${JSON.stringify({ schema_version: 1, work_item: 'W101', title: 'Item', kind: 'feature', priority: 1, depends_on: [], blockers: [], maturity: 'ready' })}\n---\n${headings.join('\n')}\n`
  );
  fs.writeFileSync(
    path.join(base, 'tasks.yaml'),
    JSON.stringify({
      schema_version: 2,
      work_item: 'W101',
      tasks: [{ id: 'T001', title: 'Done', state: 'completed', depends_on: [], commit_sha: 'abc', traceability: [] }]
    })
  );
  fs.writeFileSync(path.join(base, 'implementation-plan.md'), '# Plan\n');
  fs.writeFileSync(path.join(base, 'review.yaml'), 'schema_version: 1\nwork_item: W101\nstatus: approved\n');
}

test('upgrades canonical tasks and gates while preserving migrated commit provenance', (t) => {
  const root = canonicalProject(t, '0.7.0');
  canonicalWorkItem(root);
  fs.writeFileSync(
    path.join(root, '_flow', 'gates.yaml'),
    'schema_version: 1\ngates:\n  - id: names\n    kind: builtin\n    rule: kebab-case-files\n'
  );

  const reviewBefore = fs.readFileSync(path.join(root, '_flow', 'work-items', 'W101-item', 'review.yaml'), 'utf8');
  const result = migrateProject(root, { targetVersion: '0.8.0' });
  const tasks = parse(fs.readFileSync(path.join(root, '_flow', 'work-items', 'W101-item', 'tasks.yaml'), 'utf8'));
  const gates = parse(fs.readFileSync(path.join(root, '_flow', 'gates.yaml'), 'utf8'));

  assert.equal(result.unchanged, false);
  assert.deepEqual(tasks.tasks[0], {
    id: 'T001',
    title: 'Done',
    state: 'completed',
    depends_on: [],
    legacy_commit: 'abc',
    provenance: 'legacy_migration'
  });
  assert.deepEqual(gates.gates[0].scope, {});
  assert.equal(gates.gates[0].stage, 'full');
  assert.equal(gates.gates[0].cost, 'medium');
  assert.equal(
    fs.readFileSync(path.join(root, '_flow', 'work-items', 'W101-item', 'review.yaml'), 'utf8'),
    reviewBefore
  );
  assert.ok(result.backup && fs.existsSync(result.backup));
});

test('upgrades v2 state without trusting its dormant execution cursor', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(
    path.join(root, '_flow', 'state.yaml'),
    'schema_version: 2\nexecution:\n  phase: implementation\n  step: execute_task\nactive:\n  work_item: W999\n  task: W999-T001\nstop_reason: external_action\nmigration:\n  status: completed\n'
  );

  const result = migrateProject(root, { targetVersion: '0.8.0' });
  const state = parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'));

  assert.equal(result.unchanged, false);
  assert.equal(state.schema_version, 3);
  assert.deepEqual(state.active, { work_item: null, concurrency: null });
  assert.equal(state.checkpoint, null);
  assert.equal(state.migration.status, 'completed');
  assert.equal(state.execution, undefined);
  assert.equal(state.stop_reason, undefined);
});

test('reconstructs active work-item focus from canonical task state without reviving the legacy cursor', (t) => {
  const root = canonicalProject(t, '0.8.0');
  canonicalWorkItem(root);
  fs.writeFileSync(
    path.join(root, '_flow', 'work-items', 'W101-item', 'tasks.yaml'),
    JSON.stringify({
      schema_version: 2,
      work_item: 'W101',
      tasks: [{ id: 'T001', title: 'Active', state: 'in_progress', depends_on: [] }]
    })
  );
  fs.writeFileSync(
    path.join(root, '_flow', 'work-items', 'W101-item', 'review.yaml'),
    'schema_version: 1\nwork_item: W101\nstatus: pending\n'
  );
  fs.writeFileSync(
    path.join(root, '_flow', 'state.yaml'),
    'schema_version: 2\nexecution:\n  phase: discovery\n  step: stale_chat_cursor\nactive:\n  work_item: W999\n  task: W999-T999\nmigration:\n  status: completed\n'
  );

  const result = migrateProject(root, { targetVersion: '0.8.0' });
  const state = parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'));

  assert.equal(result.unchanged, false);
  assert.deepEqual(state.active, { work_item: 'W101', concurrency: null });
  assert.equal(state.checkpoint, null);
  assert.equal(state.migration.status, 'completed');
});

test('adopts existing approved project documents with exact revisions', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(path.join(root, '_flow', 'state.yaml'), stringifyState(emptyState()));
  const docs = path.join(root, '_flow', 'docs');
  fs.mkdirSync(docs, { recursive: true });

  const legacy = (headings: readonly string[], metadata = '') =>
    `---\nschema_version: 1\nstatus: approved\napproved_at: 2026-01-01T00:00:00.000Z\n${metadata}---\n\n${headings
      .map((heading) => `${heading}\nConcrete contract.`)
      .join('\n\n')}\n`;

  fs.writeFileSync(
    path.join(docs, 'prd.md'),
    legacy([
      '# Product Requirements',
      '## Purpose',
      '## Users',
      '## Scope',
      '## Requirements',
      '## Constraints',
      '## Non-goals'
    ])
  );
  fs.writeFileSync(
    path.join(docs, 'engineering.md'),
    legacy(
      ENGINEERING_HEADINGS,
      'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: not_applicable\n'
    )
  );

  const plan = migrationPlan(root, '0.8.0');
  assert.ok(plan.changes.includes('bind exact approval revision for docs/prd.md'));
  assert.ok(plan.changes.includes('bind exact approval revision for docs/engineering.md'));

  const result = migrateProject(root, { targetVersion: '0.8.0' });
  assert.equal(result.unchanged, false);

  const prd = fs.readFileSync(path.join(docs, 'prd.md'), 'utf8');
  const engineering = fs.readFileSync(path.join(docs, 'engineering.md'), 'utf8');
  assert.equal(documentMetadata(prd).schema_version, 2);
  assert.equal(documentMetadata(prd).experience, 'not_required');
  assert.equal(documentMetadata(prd).approval?.at, '2026-01-01T00:00:00.000Z');
  assert.equal(isProjectDocumentApproved(prd), true);
  assert.equal(documentMetadata(engineering).schema_version, 2);
  assert.equal(documentMetadata(engineering).approval?.at, '2026-01-01T00:00:00.000Z');
  assert.equal(isProjectDocumentApproved(engineering), true);
});

test('returns a true no-op for a current canonical project', (t) => {
  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(path.join(root, '_flow', 'state.yaml'), stringifyState(emptyState()));
  const before = fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8');

  assert.deepEqual(migrateProject(root, { targetVersion: '0.8.0' }), { unresolved: [], unchanged: true });
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, '_flow-backups')), false);
});

test('reports missing and unversioned projects explicitly', (t) => {
  const missing = temporaryProject(t, 'flow-migration-missing-');
  assert.throws(() => migrationPlan(missing, '0.8.0'), /_flow does not exist/);

  const root = canonicalProject(t, '0.8.0');
  fs.writeFileSync(path.join(root, '_flow', 'config.yaml'), 'schema_version: 4\nruntimes: []\nengineering: {}\n');
  const plan = migrationPlan(root, '0.8.0');
  assert.equal(plan.from_version, 'legacy');
  assert.ok((plan.changes as string[]).includes('record executed Flow package version'));
});

test('rolls the source directory back when the final staged swap fails', (t) => {
  const root = canonicalProject(t, '0.7.0');
  const originalRename = fs.renameSync;
  let failed = false;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
    if (!failed && path.basename(String(from)) === '_flow' && path.dirname(String(from)).includes('_flow-migration-')) {
      failed = true;
      throw new Error('simulated swap failure');
    }
    return originalRename(from, to);
  }) as typeof fs.renameSync;
  try {
    assert.throws(() => migrateProject(root, { targetVersion: '0.8.0' }), /simulated swap failure/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(fs.existsSync(path.join(root, '_flow')), true);
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).flow_version, '0.7.0');
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith('_flow-migration-')),
    []
  );
});


test('completes pending migration reconciliation through a supported transition and resumes normal routing', (t) => {
  const root = legacyProject(t, [legacyItem]);
  migrateProject(root, { targetVersion: '0.8.0' });

  completeMigrationReconciliation(root);

  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).migration.status,
    'completed'
  );
  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'discovery',
    instruction: 'discovery/step-01-project.md'
  });
});

test('rejects unsafe migration reconciliation completion without mutating pending state', (t) => {
  const root = legacyProject(t, [legacyItem]);
  migrateProject(root, { targetVersion: '0.8.0' });
  const stateFile = path.join(root, '_flow', 'state.yaml');
  const before = fs.readFileSync(stateFile, 'utf8');
  fs.writeFileSync(path.join(root, '_flow', 'generated', 'graph.md'), '# stale projection\n');

  assert.throws(() => completeMigrationReconciliation(root), /Migration reconciliation remains pending/);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
  assert.equal(parse(fs.readFileSync(stateFile, 'utf8')).migration.status, 'pending_reconciliation');
});
