import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { routeProject } from '../src/commands/route.mjs';
import { runStatus } from '../src/commands/status.mjs';
import { validateProject } from '../src/commands/validate.mjs';
import { parseBacklog, deriveExecutionStatus } from '../src/artifacts/backlog.mjs';
import { parseTasks } from '../src/artifacts/tasks.mjs';
import { project, write, item, task, backlog, artifacts, plan, engineering, prd } from './helpers.mjs';
test('fresh project starts discovery, then requires product and engineering approvals', () => {
  const root = project();
  fs.unlinkSync(path.join(root, '_flow/docs/prd.md'));
  fs.unlinkSync(path.join(root, '_flow/docs/engineering.md'));
  assert.equal(routeProject(root).phase, 'discovery');
  write(root, 'docs/prd.md', prd.replace('status: approved', 'status: draft'));
  assert.equal(routeProject(root).action, 'stop');
  write(root, 'docs/prd.md', prd);
  assert.equal(routeProject(root).phase, 'engineering');
  write(root, 'docs/engineering.md', engineering.replace('status: approved', 'status: draft'));
  assert.equal(routeProject(root).action, 'stop');
  write(root, 'docs/engineering.md', engineering);
  assert.equal(routeProject(root).phase, 'specification');
});
test('only the selected eligible work-item is deepened', () => {
  const items = [item(), item('W002', { depends_on: ['W001'], spec_maturity: 'outlined' })];
  const root = project(items);
  artifacts(root);
  plan(root);
  assert.equal(routeProject(root).phase, 'implementation');
});
test('plan missing, draft, approved and stale routes deterministically', () => {
  const root = project();
  artifacts(root);
  assert.equal(routeProject(root).phase, 'planning');
  plan(root, item(), { status: 'draft' });
  assert.equal(routeProject(root).action, 'stop');
  plan(root);
  assert.equal(routeProject(root).task, 'W001-T001');
  assert.deepEqual(routeProject(root), routeProject(root));
  write(root, 'docs/engineering.md', engineering + '\nChanged.');
  assert.equal(routeProject(root).phase, 'planning');
  write(root, 'docs/engineering.md', engineering);
  plan(root);
  fs.appendFileSync(path.join(root, '_flow/work-items/W001-example/spec.md'), '\nChanged.');
  assert.equal(routeProject(root).phase, 'planning');
});
test('selected work-item routes include the global PRD alongside bounded scope', () => {
  const root = project();
  artifacts(root);
  const expected = '_flow/docs/prd.md';
  assert.ok(routeProject(root).required_context.includes(expected));
  plan(root);
  assert.ok(routeProject(root).required_context.includes(expected));
  artifacts(root, item(), [task('T001', { state: 'completed' })]);
  assert.ok(routeProject(root).required_context.includes(expected));
});
test('numeric task order, review and final completion', () => {
  const root = project();
  artifacts(root, item(), [task('T010'), task('T002')]);
  plan(root);
  assert.equal(routeProject(root).task, 'W001-T002');
  artifacts(root, item(), [task('T002', { state: 'completed' })]);
  assert.equal(routeProject(root).phase, 'review');
  backlog(root, [item('W001', { state: 'completed' })]);
  assert.equal(routeProject(root).reason, 'finished');
});
test('unresolved external and decision blockers derive blocked status', () => {
  const blocker = {
    id: 'vendor-approval',
    type: 'external_action',
    description: 'Vendor must approve',
    status: 'unresolved'
  };
  const root = project([item('W001', { blockers: [blocker] })]);
  artifacts(root);
  assert.equal(routeProject(root).reason, 'external_action');
  const output = [];
  const originalLog = console.log;
  console.log = (message) => output.push(message);
  try {
    runStatus({ args: ['--path', root] });
  } finally {
    console.log = originalLog;
  }
  assert.match(output.join('\n'), /Blocked[\s\S]*W001[\s\S]*blocker: Vendor must approve \[vendor-approval\]/);
  const parsed = parseBacklog(fs.readFileSync(path.join(root, '_flow', 'backlog.yaml'), 'utf8'));
  assert.equal(
    deriveExecutionStatus(parsed.work_items[0], new Map(parsed.work_items.map((item) => [item.id, item]))).status,
    'blocked'
  );
  backlog(root, [item('W001', { blockers: [{ ...blocker, status: 'resolved' }] })]);
  assert.equal(routeProject(root).phase, 'planning');
  assert.throws(
    () => parseBacklog(stringify({ schema_version: 3, work_items: [item('W001', { blockers: [{}] })] })),
    /blocker/
  );
});
test('dependency edges derive status without changing lifecycle', () => {
  const value = parseBacklog(
    stringify({ schema_version: 3, work_items: [item(), item('W002', { depends_on: ['W001'] })] })
  );
  const byId = new Map(value.work_items.map((work) => [work.id, work]));
  assert.equal(deriveExecutionStatus(byId.get('W002'), byId).status, 'blocked');
  byId.get('W001').state = 'completed';
  assert.equal(deriveExecutionStatus(byId.get('W002'), byId).status, 'eligible');
});
test('serial mutation and task DAG are enforced', () => {
  assert.throws(
    () =>
      parseBacklog(
        stringify({
          schema_version: 3,
          work_items: [item('W001', { state: 'in_progress' }), item('W002', { state: 'in_progress' })]
        })
      ),
    /one mutating/
  );
  assert.throws(
    () =>
      parseTasks(
        stringify({
          schema_version: 2,
          work_item: 'W001',
          tasks: [task('T001', { state: 'in_progress' }), task('T002', { state: 'in_progress' })]
        })
      ),
    /one mutating/
  );
  assert.throws(
    () =>
      parseTasks(
        stringify({
          schema_version: 2,
          work_item: 'W001',
          tasks: [task('T001', { depends_on: ['T002'] }), task('T002', { depends_on: ['T001'] })]
        })
      ),
    /cycle/
  );
  assert.throws(
    () =>
      parseTasks(
        stringify({ schema_version: 2, work_item: 'W001', tasks: [task('T001', { traceability: 'legacy' })] })
      ),
    /completed migrated/
  );
});
test('ready native work requires artifacts and current approved plans when started', () => {
  const root = project();
  assert.ok(validateProject(root).some((f) => f.code === 'WORK_ITEM'));
  artifacts(root);
  plan(root);
  assert.deepEqual(validateProject(root), []);
  backlog(root, [item('W001', { state: 'in_progress' })]);
  plan(root, item(), { status: 'draft' });
  assert.ok(validateProject(root).some((f) => f.code === 'PLAN'));
  plan(root);
  assert.deepEqual(validateProject(root), []);
});
test('legacy completed tasks retain historical specs without requiring invented trailers', () => {
  const root = project([item('W001', { state: 'completed' })]);
  artifacts(root, item(), [task('T001', { state: 'completed', traceability: 'legacy', legacy_commit: 'deadbeef' })]);
  write(root, 'work-items/W001-example/spec.md', '# Historical spec');
  assert.deepEqual(validateProject(root), []);
});

test('completed native plans retain historical approval after outcome or engineering changes', () => {
  const root = project([item('W001', { state: 'completed' })]);
  artifacts(root, item(), [task('T001', { state: 'completed' })]);
  plan(root);
  fs.appendFileSync(path.join(root, '_flow/work-items/W001-example/spec.md'), '\n## Final outcome\nDelivered.');
  write(root, 'docs/engineering.md', engineering + '\nApproved later convention.');
  assert.deepEqual(validateProject(root), []);
});
