import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import { stringify, parse } from 'yaml';
import { migrateProject, migrationPlan } from '../src/commands/migrate.mjs';
import { routeProject } from '../src/commands/route.mjs';
import { validateProject } from '../src/commands/validate.mjs';

async function legacyProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-migrate-'));
  const flow = path.join(root, '_flow');
  await fs.mkdir(path.join(flow, 'work-items', '001F-foundation'), { recursive: true });
  await fs.writeFile(
    path.join(flow, 'config.yaml'),
    'schema_version: 1\nframework:\n  name: flow\n  version: 0.4.0\nruntimes: []\n'
  );
  await fs.writeFile(path.join(flow, 'PRD.md'), '# PRD');
  await fs.writeFile(path.join(flow, 'ENGINEERING.md'), '# Engineering');
  await fs.writeFile(
    path.join(flow, 'BACKLOG.yaml'),
    stringify({
      schema_version: 1,
      source_of_truth: '_flow/',
      work_items: [
        {
          id: 'F001',
          folder: '001F-foundation',
          kind: 'feature',
          title: 'Foundation',
          status: 'done',
          priority: 1,
          depends_on: []
        }
      ]
    })
  );
  await fs.writeFile(path.join(flow, 'work-items', '001F-foundation', 'SPEC.md'), '# Spec');
  await fs.writeFile(
    path.join(flow, 'work-items', '001F-foundation', 'TASKS.yaml'),
    stringify({
      schema_version: 1,
      tasks: [{ id: 'T001', title: 'Task', status: 'complete', depends_on: [], commit: 'deadbeef' }]
    })
  );
  return root;
}

test('normalizes 0.4 paths and retains historical commit evidence', async () => {
  const root = await legacyProject();
  migrateProject(root);
  const backlog = parse(await fs.readFile(path.join(root, '_flow', 'backlog.yaml'), 'utf8'));
  assert.equal(backlog.work_items[0].id, 'W001');
  assert.equal(backlog.work_items[0].state, 'completed');
  assert.equal(backlog.work_items[0].folder, 'W001-foundation');
  const tasks = parse(
    await fs.readFile(path.join(root, '_flow', 'work-items', 'W001-foundation', 'tasks.yaml'), 'utf8')
  );
  assert.equal(tasks.work_item, 'W001');
  assert.equal(tasks.tasks[0].state, 'completed');
  assert.equal(tasks.tasks[0].commit, undefined);
  assert.equal(tasks.tasks[0].legacy_commit, 'deadbeef');
  assert.equal(tasks.tasks[0].traceability, 'legacy');
  assert.equal(await fs.readFile(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8'), '# PRD');
  await fs.stat(path.join(root, '_flow', 'state.yaml'));
  const config = await fs.readFile(path.join(root, '_flow', 'config.yaml'), 'utf8');
  assert.match(config, /schema_version: 3/);
  assert.doesNotMatch(config, /^framework:|^\s+version:/m);
});

test('migration is idempotent for already-migrated structural artifacts', async () => {
  const root = await legacyProject();
  migrateProject(root);
  const before = await fs.readFile(path.join(root, '_flow', 'backlog.yaml'), 'utf8');
  migrateProject(root);
  assert.equal(await fs.readFile(path.join(root, '_flow', 'backlog.yaml'), 'utf8'), before);
});

test('plans and applies the canonical directory rename from .flow to _flow', async () => {
  const root = await legacyProject();
  await fs.rename(path.join(root, '_flow'), path.join(root, '.flow'));
  const plan = migrationPlan(root);
  assert.equal(plan.can_apply, true);
  assert.ok(plan.changes.some((change) => change.includes('.flow to _flow')));
  migrateProject(root);
  assert.equal(fsSync.existsSync(path.join(root, '.flow')), false);
  assert.equal(fsSync.existsSync(path.join(root, '_flow', 'config.yaml')), true);
});

test('migrates casing-only artifact and work-item names without losing content', async () => {
  const root = await legacyProject();
  const flow = path.join(root, '_flow');
  const previousFolder = path.join(flow, 'work-items', '001F-foundation');
  const casingOnlyFolder = path.join(flow, 'work-items', 'W001-Foundation');
  const backlog = parse(await fs.readFile(path.join(flow, 'BACKLOG.yaml'), 'utf8'));
  backlog.work_items[0].folder = 'W001-Foundation';
  await fs.rename(previousFolder, casingOnlyFolder);
  await fs.writeFile(path.join(flow, 'BACKLOG.yaml'), stringify(backlog));

  migrateProject(root);

  const folder = path.join(flow, 'work-items', 'W001-foundation');
  assert.equal(await fs.readFile(path.join(folder, 'spec.md'), 'utf8'), '# Spec');
  assert.equal(parse(await fs.readFile(path.join(folder, 'tasks.yaml'), 'utf8')).tasks[0].legacy_commit, 'deadbeef');
  const entries = await fs.readdir(folder);
  assert.ok(entries.includes('spec.md'));
  assert.ok(entries.includes('tasks.yaml'));
  assert.equal(entries.includes('SPEC.md'), false);
  assert.equal(entries.includes('TASKS.yaml'), false);
});

test('rejects a distinct migration destination without modifying the live project', async () => {
  const root = await legacyProject();
  const folder = path.join(root, '_flow', 'work-items', '001F-foundation');
  const source = path.join(folder, 'DECISIONS.md');
  const destination = path.join(folder, 'legacy-decisions.md');
  await fs.writeFile(source, 'legacy decisions');
  await fs.writeFile(destination, 'existing decisions');

  assert.throws(() => migrateProject(root), /destination already exists/);
  assert.equal(await fs.readFile(source, 'utf8'), 'legacy decisions');
  assert.equal(await fs.readFile(destination, 'utf8'), 'existing decisions');
  assert.ok(await fs.stat(path.join(root, '_flow', 'BACKLOG.yaml')));
});

test(
  'does not treat distinct case-sensitive entries as a casing alias',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await legacyProject();
    const folder = path.join(root, '_flow', 'work-items', '001F-foundation');
    await fs.writeFile(path.join(folder, 'spec.md'), 'existing lowercase spec');

    assert.throws(() => migrateProject(root), /destination already exists/);
    assert.equal(await fs.readFile(path.join(folder, 'SPEC.md'), 'utf8'), '# Spec');
    assert.equal(await fs.readFile(path.join(folder, 'spec.md'), 'utf8'), 'existing lowercase spec');
  }
);

test(
  'restores a casing-only source when its intermediate rename fails',
  { skip: process.platform !== 'win32' },
  async () => {
    const root = await legacyProject();
    const source = path.join(root, '_flow', 'work-items', '001F-foundation', 'SPEC.md');
    const rename = fsSync.renameSync;
    const renameMock = mock.method(fsSync, 'renameSync', (from, to) => {
      if (path.basename(from).startsWith('.SPEC.md_flow-migration-') && path.basename(to) === 'spec.md')
        throw new Error('simulated intermediate rename failure');
      return rename(from, to);
    });
    try {
      assert.throws(() => migrateProject(root), /simulated intermediate rename failure/);
    } finally {
      renameMock.mock.restore();
    }

    assert.equal(await fs.readFile(source, 'utf8'), '# Spec');
    assert.deepEqual(
      (await fs.readdir(root)).filter((entry) => entry.startsWith('_flow-migration-')),
      []
    );
  }
);

test(
  'retains staged recovery data when casing-only rename restoration fails',
  { skip: process.platform !== 'win32' },
  async () => {
    const root = await legacyProject();
    const source = path.join(root, '_flow', 'work-items', '001F-foundation', 'SPEC.md');
    const rename = fsSync.renameSync;
    const renameMock = mock.method(fsSync, 'renameSync', (from, to) => {
      if (
        path.basename(from).startsWith('.SPEC.md_flow-migration-') &&
        ['spec.md', 'SPEC.md'].includes(path.basename(to))
      )
        throw new Error('simulated intermediate rename failure');
      return rename(from, to);
    });
    try {
      assert.throws(() => migrateProject(root), /simulated intermediate rename failure/);
    } finally {
      renameMock.mock.restore();
    }

    assert.equal(await fs.readFile(source, 'utf8'), '# Spec');
    const staging = (await fs.readdir(root)).find((entry) => entry.startsWith('_flow-migration-'));
    assert.ok(staging);
    const recoveredFolder = path.join(root, staging, '_flow', 'work-items', 'W001-foundation');
    assert.ok((await fs.readdir(recoveredFolder)).some((entry) => entry.startsWith('.SPEC.md_flow-migration-')));
    await fs.rm(path.join(root, staging), { recursive: true, force: true });
  }
);

test('migration preserves guardrails and routes reconciliation before normal work', async () => {
  const root = await legacyProject();
  await fs.writeFile(path.join(root, '_flow', 'STATE.md'), 'Production cutover requires external approval.');
  await fs.writeFile(path.join(root, '_flow', 'DECISIONS.md'), 'Do not delete legacy data without approval.');
  migrateProject(root);
  assert.equal(routeProject(root).phase, 'reconcile');
  assert.match(await fs.readFile(path.join(root, '_flow', 'docs', 'legacy-state.md'), 'utf8'), /external approval/);
  assert.match(await fs.readFile(path.join(root, '_flow', 'docs', 'legacy-decisions.md'), 'utf8'), /without approval/);
  assert.deepEqual(validateProject(root), []);
});

test('qualified task IDs normalize with dependency edges preserved', async () => {
  const root = await legacyProject();
  const file = path.join(root, '_flow/work-items/001F-foundation/TASKS.yaml');
  await fs.writeFile(
    file,
    stringify({
      tasks: [
        { id: 'F001-T01', title: 'One', status: 'complete', depends_on: [] },
        { id: 'F001-T04', title: 'Four', status: 'complete', depends_on: ['F001-T01'] }
      ]
    })
  );
  migrateProject(root);
  const tasks = parse(await fs.readFile(path.join(root, '_flow/work-items/W001-foundation/tasks.yaml'), 'utf8')).tasks;
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['T001', 'T004']
  );
  assert.deepEqual(tasks[1].depends_on, ['T001']);
});

for (const [name, tasks] of [
  [
    'collision',
    [
      { id: 'T001', title: 'One', status: 'complete' },
      { id: 'F001-T01', title: 'Duplicate', status: 'complete' }
    ]
  ],
  ['unknown dependency', [{ id: 'T001', title: 'One', status: 'complete', depends_on: ['T999'] }]],
  [
    'cycle',
    [
      { id: 'T001', title: 'One', status: 'complete', depends_on: ['T002'] },
      { id: 'T002', title: 'Two', status: 'complete', depends_on: ['T001'] }
    ]
  ],
  ['cross-work-item', [{ id: 'F002-T01', title: 'Wrong owner', status: 'complete' }]]
])
  test(`failed migration ${name} preflight causes zero mutation`, async () => {
    const root = await legacyProject();
    const file = path.join(root, '_flow/work-items/001F-foundation/TASKS.yaml');
    const before = stringify({ tasks });
    await fs.writeFile(file, before);
    const config = await fs.readFile(path.join(root, '_flow/config.yaml'), 'utf8');
    assert.throws(() => migrateProject(root));
    assert.equal(await fs.readFile(file, 'utf8'), before);
    assert.equal(await fs.readFile(path.join(root, '_flow/config.yaml'), 'utf8'), config);
    assert.deepEqual(
      (await fs.readdir(root)).filter((entry) => entry.startsWith('_flow-migration-')),
      []
    );
  });
