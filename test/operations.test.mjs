import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { artifacts, item, plan, project, spec, task, write } from './helpers.mjs';

const cli = path.resolve('src/cli.mjs');
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input });

test('progressive work creates tasks only after a complete spec is promoted', () => {
  const root = project([item('W001', { spec_maturity: 'outlined' })]);
  assert.equal(run(['task', 'create', 'W001', '--title', 'Too early', '--path', root]).status, 1);
  write(root, 'work-items/W001-example/spec.md', '# Work Item Specification\n');
  assert.equal(run(['work-item', 'promote', 'W001', '--path', root]).status, 1);
  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow/backlog.yaml'), 'utf8')).work_items[0].spec_maturity,
    'outlined'
  );
  write(root, 'work-items/W001-example/spec.md', spec);
  assert.equal(run(['work-item', 'promote', 'W001', '--path', root]).status, 0);
  assert.equal(
    run(['task', 'create', 'W001', '--title', 'Implement contract', '--traceability', 'commit', '--path', root]).status,
    0
  );
  const tasks = parse(fs.readFileSync(path.join(root, '_flow/work-items/W001-example/tasks.yaml'), 'utf8'));
  assert.equal(tasks.tasks[0].traceability, 'commit');
  assert.equal(tasks.tasks[0].implementation, undefined);
});

test('batch validates every operation and leaves live artifacts unchanged on failure', () => {
  const root = project([item('W001', { spec_maturity: 'outlined' })]);
  const file = path.join(root, 'batch.json');
  fs.writeFileSync(
    file,
    JSON.stringify([
      { entity: 'work_item', action: 'priority', work_item: 'W001', priority: 4 },
      { entity: 'work_item', action: 'dependencies', work_item: 'W001', depends_on: ['W999'] }
    ])
  );
  const before = fs.readFileSync(path.join(root, '_flow/backlog.yaml'), 'utf8');
  assert.equal(run(['batch', '--file', file, '--format', 'json', '--path', root]).status, 1);
  assert.equal(fs.readFileSync(path.join(root, '_flow/backlog.yaml'), 'utf8'), before);
});

test('state rejects an invalid phase and step combination without writing', () => {
  const root = project();
  const result = run(['state', 'update', '--phase', 'implementation', '--step', 'draft', '--path', root]);
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(root, '_flow/state.yaml')), false);
});

test('review-complete is the only work-item completion transition and does not route a successor', () => {
  const first = item('W001', { state: 'in_progress' });
  const second = item('W002', { depends_on: ['W001'], spec_maturity: 'outlined' });
  const root = project([first, second]);
  artifacts(root, first, [task('T001', { state: 'completed', traceability: 'none' })]);
  write(root, 'state.yaml', {
    schema_version: 2,
    execution: { phase: 'review', step: 'review_work_item' },
    active: { work_item: 'W001', task: null },
    stop_reason: null,
    migration: { status: 'not_required' }
  });
  assert.equal(run(['work-item', 'review-complete', 'W001', '--path', root]).status, 0);
  const state = parse(fs.readFileSync(path.join(root, '_flow/state.yaml'), 'utf8'));
  assert.deepEqual(state.active, { work_item: null, task: null });
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow/backlog.yaml'), 'utf8')).work_items[0].state, 'completed');
});

test('doctor detects version drift without mutating project files', () => {
  const root = project();
  const configFile = path.join(root, '_flow/config.yaml');
  const config = parse(fs.readFileSync(configFile, 'utf8'));
  config.flow_version = '0.5.3';
  write(root, 'config.yaml', config);
  const before = fs.readFileSync(configFile, 'utf8');
  const result = run(['doctor', '--quick', '--json', '--path', root]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).healthy, false);
  assert.equal(fs.readFileSync(configFile, 'utf8'), before);
});

test('task commit writes separate metadata evidence and leaves final work for review', () => {
  const root = project([item('W001', { state: 'in_progress' })]);
  artifacts(root, item(), [task('T001', { state: 'in_progress', traceability: 'commit' })]);
  plan(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'flow@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'chore: baseline'], { cwd: root });
  fs.writeFileSync(path.join(root, 'implementation.txt'), 'done');
  execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
  const result = run(['task', 'commit', 'W001-T001', '--message', 'feat: implement', '--path', root]);
  assert.equal(result.status, 0, result.stderr);
  const metadata = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(
    execFileSync('git', ['log', '-2', '--format=%B'], { cwd: root, encoding: 'utf8' }),
    /Flow-Task: W001-T001/
  );
  const tasks = parse(fs.readFileSync(path.join(root, '_flow/work-items/W001-example/tasks.yaml'), 'utf8'));
  assert.equal(tasks.tasks[0].commit_sha, undefined);
  assert.equal(tasks.tasks[0].state, 'completed');
  assert.match(
    execFileSync('git', ['show', '-s', '--format=%B', metadata], { cwd: root, encoding: 'utf8' }),
    /^chore\(flow\): persist W001-T001 metadata\s*$/
  );
  assert.doesNotMatch(
    execFileSync('git', ['show', '-s', '--format=%B', metadata], { cwd: root, encoding: 'utf8' }),
    /Flow-Task:/
  );
  const implementation = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(
    execFileSync('git', ['show', '-s', '--format=%B', implementation], { cwd: root, encoding: 'utf8' }),
    /Flow-Task: W001-T001/
  );
  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow/backlog.yaml'), 'utf8')).work_items[0].state,
    'in_progress'
  );
  const state = parse(fs.readFileSync(path.join(root, '_flow/state.yaml'), 'utf8'));
  assert.deepEqual(state.execution, { phase: 'review', step: 'review_work_item' });
});
