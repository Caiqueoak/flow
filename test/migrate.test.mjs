import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify, parse } from 'yaml';
import { migrateProject } from '../src/commands/migrate.mjs';

async function legacyProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-migrate-'));
  const flow = path.join(root, '.flow');
  await fs.mkdir(path.join(flow, 'work-items', '001F-foundation'), { recursive: true });
  await fs.writeFile(path.join(flow, 'config.yaml'), 'schema_version: 1\nframework:\n  name: flow\n  version: 0.4.0\nruntimes: []\n');
  await fs.writeFile(path.join(flow, 'PRD.md'), '# PRD');
  await fs.writeFile(path.join(flow, 'ENGINEERING.md'), '# Engineering');
  await fs.writeFile(path.join(flow, 'BACKLOG.yaml'), stringify({ schema_version: 1, source_of_truth: '.flow/', work_items: [
    { id: 'F001', folder: '001F-foundation', kind: 'feature', title: 'Foundation', status: 'done', priority: 1, depends_on: [] }
  ] }));
  await fs.writeFile(path.join(flow, 'work-items', '001F-foundation', 'SPEC.md'), '# Spec');
  await fs.writeFile(path.join(flow, 'work-items', '001F-foundation', 'TASKS.yaml'), stringify({ schema_version: 1, tasks: [{ id: 'T001', title: 'Task', status: 'complete', depends_on: [], commit: 'deadbeef' }] }));
  return root;
}

test('normalizes 0.4-style paths, IDs and lifecycle states without preserving task SHA', async () => {
  const root = await legacyProject();
  migrateProject(root);
  const backlog = parse(await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8'));
  assert.equal(backlog.work_items[0].id, 'W001');
  assert.equal(backlog.work_items[0].state, 'completed');
  assert.equal(backlog.work_items[0].folder, 'w001-foundation');
  const tasks = parse(await fs.readFile(path.join(root, '.flow', 'work-items', 'w001-foundation', 'tasks.yaml'), 'utf8'));
  assert.equal(tasks.work_item, 'W001');
  assert.equal(tasks.tasks[0].state, 'completed');
  assert.equal(tasks.tasks[0].commit, undefined);
  assert.equal(await fs.readFile(path.join(root, '.flow', 'docs', 'prd.md'), 'utf8'), '# PRD');
  await fs.stat(path.join(root, '.flow', 'state.yaml'));
  const config = await fs.readFile(path.join(root, '.flow', 'config.yaml'), 'utf8');
  assert.match(config, /schema_version: 2/);
  assert.doesNotMatch(config, /framework:|version:/);
});

test('migration is idempotent for already-migrated structural artifacts', async () => {
  const root = await legacyProject();
  migrateProject(root);
  const before = await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8');
  migrateProject(root);
  assert.equal(await fs.readFile(path.join(root, '.flow', 'backlog.yaml'), 'utf8'), before);
});
