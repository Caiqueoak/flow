import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { parseBacklog, deriveExecutionStatus } from '../src/artifacts/backlog.mjs';
import { parseTasks } from '../src/artifacts/tasks.mjs';
import { routeProject } from '../src/commands/route.mjs';

async function root() { const value = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-workflow-')); await fs.mkdir(path.join(value, '.flow', 'docs'), { recursive: true }); await fs.writeFile(path.join(value, '.flow', 'config.yaml'), 'schema_version: 2\nruntimes: []\nengineering:\n  profile: pragmatic\n  brownfield_policy: rebaseline\n'); return value; }
const approvedEngineering = `---\nschema_version: 1\nstatus: approved\nscope:\n  system_shape: defined\n  module_architecture: defined\n  code_organization: defined\n  data_and_state: defined\n  external_boundaries: defined\n  conventions: defined\n  principles: defined\n  quality: defined\n  operations: deferred\n  enforcement: defined\n---\n# Engineering\n`;

test('canonical lifecycle has only three persisted states and derives blocked/ready', () => {
  assert.throws(() => parseBacklog(stringify({ schema_version: 1, work_items: [{ id: 'W001', folder: 'w001-x', kind: 'feature', title: 'X', state: 'blocked', priority: 1, depends_on: [], blockers: [] }] })), /state must be/);
  const parsed = parseBacklog(stringify({ schema_version: 1, work_items: [
    { id: 'W001', folder: 'w001-a', kind: 'feature', title: 'A', state: 'pending', priority: 1, depends_on: [], blockers: [] },
    { id: 'W002', folder: 'w002-b', kind: 'feature', title: 'B', state: 'pending', priority: 1, depends_on: ['W001'], blockers: [] }
  ] }));
  const byId = new Map(parsed.work_items.map((item) => [item.id, item]));
  assert.equal(deriveExecutionStatus(byId.get('W001'), byId).status, 'ready');
  assert.equal(deriveExecutionStatus(byId.get('W002'), byId).status, 'blocked');
});

test('task IDs are local and task DAG cycles are rejected', () => {
  const valid = parseTasks(stringify({ schema_version: 1, work_item: 'W001', tasks: [
    { id: 'T001', title: 'One', state: 'completed', depends_on: [], implementation: 'none' },
    { id: 'T002', title: 'Two', state: 'pending', depends_on: ['T001'], implementation: 'commit' }
  ] }), { expectedWorkItem: 'W001' });
  assert.equal(valid.tasks[1].id, 'T002');
  assert.throws(() => parseTasks(stringify({ schema_version: 1, work_item: 'W001', tasks: [
    { id: 'T001', title: 'One', state: 'pending', depends_on: ['T002'] },
    { id: 'T002', title: 'Two', state: 'pending', depends_on: ['T001'] }
  ] })), /cycle/);
});

test('fresh repository routes to engineering bootstrap before implementation', async () => {
  const project = await root();
  assert.deepEqual(routeProject(project), { action: 'continue', phase: 'engineering_bootstrap', step: 'inspect', instruction: 'engineering/step-01-inspect.md' });
});

test('approved engineering contract routes to planning/build based only on repository state', async () => {
  const project = await root();
  await fs.writeFile(path.join(project, '.flow', 'docs', 'engineering.md'), approvedEngineering);
  await fs.writeFile(path.join(project, '.flow', 'backlog.yaml'), stringify({ schema_version: 1, work_items: [
    { id: 'W001', folder: 'w001-feature', kind: 'feature', title: 'Feature', state: 'pending', priority: 1, depends_on: [], blockers: [] }
  ] }));
  assert.equal(routeProject(project).phase, 'planning');
  await fs.mkdir(path.join(project, '.flow', 'work-items', 'w001-feature'), { recursive: true });
  await fs.writeFile(path.join(project, '.flow', 'work-items', 'w001-feature', 'spec.md'), '# spec');
  await fs.writeFile(path.join(project, '.flow', 'work-items', 'w001-feature', 'tasks.yaml'), stringify({ schema_version: 1, work_item: 'W001', tasks: [{ id: 'T001', title: 'Implement', state: 'pending', depends_on: [], implementation: 'commit' }] }));
  const route = routeProject(project);
  assert.equal(route.phase, 'build');
  assert.equal(route.task, 'W001-T001');
});
