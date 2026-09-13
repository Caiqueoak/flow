import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify, parse } from 'yaml';
import { migrateProject } from '../src/commands/migrate.mjs';
import { routeProject } from '../src/commands/route.mjs';
import { validateProject } from '../src/commands/validate.mjs';

async function legacyProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-migrate-'));
  const flow = path.join(root, '.flow');
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
      source_of_truth: '.flow/',
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
  const backlog = parse(await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8'));
  assert.equal(backlog.work_items[0].id, 'W001');
  assert.equal(backlog.work_items[0].state, 'completed');
  assert.equal(backlog.work_items[0].folder, 'W001-foundation');
  const tasks = parse(
    await fs.readFile(path.join(root, '.flow', 'work-items', 'W001-foundation', 'tasks.yaml'), 'utf8')
  );
  assert.equal(tasks.work_item, 'W001');
  assert.equal(tasks.tasks[0].state, 'completed');
  assert.equal(tasks.tasks[0].commit, undefined);
  assert.equal(tasks.tasks[0].legacy_commit, 'deadbeef');
  assert.equal(tasks.tasks[0].implementation, 'legacy');
  assert.equal(await fs.readFile(path.join(root, '.flow', 'docs', 'prd.md'), 'utf8'), '# PRD');
  await fs.stat(path.join(root, '.flow', 'state.yaml'));
  const config = await fs.readFile(path.join(root, '.flow', 'config.yaml'), 'utf8');
  assert.match(config, /schema_version: 2/);
  assert.doesNotMatch(config, /^framework:|^\s+version:/m);
});

test('migration is idempotent for already-migrated structural artifacts', async () => {
  const root = await legacyProject();
  migrateProject(root);
  const before = await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8');
  migrateProject(root);
  assert.equal(await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8'), before);
});

test('migration preserves guardrails and routes reconciliation before normal work', async () => {
  const root = await legacyProject();
  await fs.writeFile(path.join(root, '.flow', 'STATE.md'), 'Production cutover requires external approval.');
  await fs.writeFile(path.join(root, '.flow', 'DECISIONS.md'), 'Do not delete legacy data without approval.');
  migrateProject(root);
  assert.equal(routeProject(root).phase, 'migration_reconciliation');
  assert.match(await fs.readFile(path.join(root, '.flow', 'docs', 'legacy-state.md'), 'utf8'), /external approval/);
  assert.match(await fs.readFile(path.join(root, '.flow', 'docs', 'legacy-decisions.md'), 'utf8'), /without approval/);
  assert.deepEqual(validateProject(root), []);
});

test('qualified task IDs normalize with dependency edges preserved', async () => {
  const root = await legacyProject();
  const file = path.join(root, '.flow/work-items/001F-foundation/TASKS.yaml');
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
  const tasks = parse(await fs.readFile(path.join(root, '.flow/work-items/W001-foundation/tasks.yaml'), 'utf8')).tasks;
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
    const file = path.join(root, '.flow/work-items/001F-foundation/TASKS.yaml');
    const before = stringify({ tasks });
    await fs.writeFile(file, before);
    const config = await fs.readFile(path.join(root, '.flow/config.yaml'), 'utf8');
    assert.throws(() => migrateProject(root));
    assert.equal(await fs.readFile(file, 'utf8'), before);
    assert.equal(await fs.readFile(path.join(root, '.flow/config.yaml'), 'utf8'), config);
    assert.deepEqual(
      (await fs.readdir(root)).filter((entry) => entry.startsWith('.flow-migration-')),
      []
    );
  });
