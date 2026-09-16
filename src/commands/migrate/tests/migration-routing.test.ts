import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/entry.js');
const run = (root: string, args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, '--path', root], { encoding: 'utf8' });

test('pending semantic migration reconciliation takes precedence over work-item routing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-migration-route-'));
  const flow = path.join(root, '.flow');
  fs.mkdirSync(path.join(flow, 'work-items', 'W001-reference-item'), { recursive: true });
  fs.writeFileSync(flow + '/config.yaml', 'schema_version: 2\nruntimes: []\nengineering: {}\n');
  fs.writeFileSync(
    flow + '/backlog.yaml',
    'schema_version: 2\nwork_items:\n  - id: W001\n    folder: W001-reference-item\n    title: Reference item\n    kind: feature\n    state: pending\n    priority: 1\n    depends_on: []\n    blockers: []\n'
  );
  fs.writeFileSync(path.join(flow, 'work-items', 'W001-reference-item', 'spec.md'), '# Legacy specification\n');

  const migration = run(root, ['migrate', '--apply']);
  assert.equal(migration.status, 0, migration.stderr);

  const route = run(root, ['route', '--json']);
  assert.equal(route.status, 0, route.stderr);
  assert.deepEqual(JSON.parse(route.stdout), {
    action: 'continue',
    phase: 'reconcile',
    instruction: 'migration/step-01-reconcile.md'
  });
});
