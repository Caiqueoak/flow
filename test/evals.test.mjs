import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { routeProject } from '../src/commands/route.mjs';
import { deriveExecutionStatus, parseBacklog } from '../src/artifacts/backlog.mjs';

const engineering = `---\nschema_version: 1\nstatus: approved\nscope:\n  system_shape: defined\n  module_architecture: defined\n  code_organization: defined\n  data_and_state: defined\n  external_boundaries: defined\n  conventions: defined\n  principles: defined\n  quality: defined\n  operations: deferred\n  enforcement: defined\n---\n# Engineering\n`;

async function project(items) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-eval-'));
  await fs.mkdir(path.join(root, '.flow', 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, '.flow', 'config.yaml'), 'schema_version: 2\nruntimes: []\nengineering:\n  profile: pragmatic\n  brownfield_policy: rebaseline\n');
  await fs.writeFile(path.join(root, '.flow', 'docs', 'engineering.md'), engineering);
  await fs.writeFile(path.join(root, '.flow', 'backlog.yaml'), stringify({ schema_version: 1, work_items: items }));
  return root;
}

function item(id, state = 'pending', depends_on = [], blockers = []) {
  const number = id.slice(1);
  return { id, folder: `w${number}-item-${number}`, kind: 'feature', title: `Item ${number}`, state, priority: 1, depends_on, blockers };
}

test('E006/E007 dependency state derives Blocked then Ready without mutating lifecycle', () => {
  let parsed = parseBacklog(stringify({ schema_version: 1, work_items: [item('W001'), item('W002', 'pending', ['W001'])] }));
  let byId = new Map(parsed.work_items.map((entry) => [entry.id, entry]));
  assert.equal(deriveExecutionStatus(byId.get('W002'), byId).status, 'blocked');
  parsed = parseBacklog(stringify({ schema_version: 1, work_items: [item('W001', 'completed'), item('W002', 'pending', ['W001'])] }));
  byId = new Map(parsed.work_items.map((entry) => [entry.id, entry]));
  assert.equal(deriveExecutionStatus(byId.get('W002'), byId).status, 'ready');
});

test('E008 multiple dependencies remain separate graph/execution prerequisites', () => {
  const parsed = parseBacklog(stringify({ schema_version: 1, work_items: [item('W001', 'completed'), item('W002'), item('W003', 'pending', ['W001', 'W002'])] }));
  const byId = new Map(parsed.work_items.map((entry) => [entry.id, entry]));
  const result = deriveExecutionStatus(byId.get('W003'), byId);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.reasons.map((reason) => reason.ref), ['W002']);
});

test('E016 repository state produces same route in a fresh invocation', async () => {
  const root = await project([item('W001')]);
  assert.deepEqual(routeProject(root), routeProject(root));
  assert.equal(routeProject(root).phase, 'planning');
});

test('completed task set routes directly into review instead of stopping for status', async () => {
  const root = await project([item('W001', 'in_progress')]);
  const folder = path.join(root, '.flow', 'work-items', 'w001-item-001');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'spec.md'), '# Spec');
  await fs.writeFile(path.join(folder, 'tasks.yaml'), stringify({ schema_version: 1, work_item: 'W001', tasks: [{ id: 'T001', title: 'Done', state: 'completed', depends_on: [], implementation: 'none' }] }));
  const route = routeProject(root);
  assert.equal(route.action, 'continue');
  assert.equal(route.phase, 'review');
});

test('all completed work is the only normal finished terminal state', async () => {
  const root = await project([item('W001', 'completed')]);
  assert.deepEqual(routeProject(root), { action: 'stop', reason: 'finished' });
});

test('explicit non-work-item blocker prevents execution without inventing a dependency edge', async () => {
  const root = await project([item('W001', 'pending', [], [{ type: 'external_action', ref: 'vendor-approval' }])]);
  const route = routeProject(root);
  assert.equal(route.action, 'stop');
  assert.equal(route.reason, 'external_action');
});
