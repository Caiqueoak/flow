import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const cli = path.resolve('dist/entry.js');
const run = (root: string, args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, '--path', root], { encoding: 'utf8' });
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
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-canonical-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'flow@test.local'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: root });
  assert.equal(run(root, ['init', '--runtime', 'codex', '--existing-code', 'improve']).status, 0);
  return root;
}
function ready(root: string, id = 'W101') {
  assert.equal(run(root, ['work-item', 'create', id, '--title', 'Canonical item']).status, 0);
  const base = path.join(root, '_flow', 'work-items', `${id}-canonical-item`);
  const spec = path.join(base, 'spec.md');
  const original = fs.readFileSync(spec, 'utf8');
  fs.writeFileSync(spec, `${original}\n${headings.map((heading) => `${heading}\nText.`).join('\n\n')}\n`);
  assert.equal(run(root, ['work-item', 'promote', id]).status, 0);
  fs.writeFileSync(
    path.join(base, 'implementation-plan.md'),
    `---\nschema_version: 1\nwork_item: ${id}\nstatus: approved\n---\n\n# Implementation Plan\n`
  );
  assert.equal(
    run(root, ['approval', 'record', path.relative(root, path.join(base, 'implementation-plan.md'))]).status,
    0
  );
  return base;
}

test('work-item creation produces four canonical shells and sync never mutates them', () => {
  const root = project();
  assert.equal(run(root, ['work-item', 'create', 'W101', '--title', 'Canonical item']).status, 0);
  const base = path.join(root, '_flow', 'work-items', 'W101-canonical-item');
  for (const file of ['spec.md', 'tasks.yaml', 'implementation-plan.md', 'review.yaml'])
    assert.ok(fs.existsSync(path.join(base, file)));
  assert.deepEqual(parse(fs.readFileSync(path.join(base, 'tasks.yaml'), 'utf8')).tasks, []);
  const before = fs.readFileSync(path.join(base, 'spec.md'), 'utf8');
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(fs.readFileSync(path.join(base, 'spec.md'), 'utf8'), before);
  const generated = parse(fs.readFileSync(path.join(root, '_flow', 'generated', 'backlog.yaml'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync('schemas/backlog.schema.json', 'utf8'));
  assert.equal(generated.work_items[0].spec_maturity, 'outlined');
  assert.ok(schema.properties.work_items.items.required.includes('spec_maturity'));
  assert.ok(schema.properties.work_items.items.properties.state.enum.includes(generated.work_items[0].state));
  assert.equal(run(root, ['validate', '--json']).status, 0);
});

test('changing an approved plan invalidates its approval', () => {
  const root = project();
  const base = ready(root);
  fs.appendFileSync(path.join(base, 'implementation-plan.md'), '\nChanged after approval.\n');
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  const start = run(root, ['task', 'start', 'W101-T001']);
  assert.notEqual(start.status, 0);
  assert.match(start.stderr, /requires an approved implementation plan/);
});

test('task and review use canonical subjects and release dependent work', () => {
  const root = project();
  ready(root, 'W101');
  ready(root, 'W102');
  assert.equal(run(root, ['work-item', 'dependencies', 'W102', '--depends-on', 'W101']).status, 0);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'implementation.txt'), 'done\n');
  execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(
    run(root, [
      'task',
      'commit',
      'W101-T001',
      '--message',
      'feat(flow): implement item [W101-T001]',
      '--files',
      'implementation.txt'
    ]).status,
    0
  );
  assert.match(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }), /\[W101-T001\]/);
  assert.match(
    execFileSync('git', ['log', '-1', '--format=%B'], { cwd: root, encoding: 'utf8' }),
    /Flow-Work-Item: W101\r?\nFlow-Task: W101-T001/
  );
  const trace = JSON.parse(run(root, ['trace', 'W101', '--json']).stdout);
  assert.deepEqual(trace.tasks[0].task, 'W101-T001');
  assert.match(trace.tasks[0].sha, /^[0-9a-f]{40}$/);
  assert.equal(trace.tasks[0].title, 'implement item');
  assert.ok(trace.tasks[0].files.includes('implementation.txt'));
  const traceText = run(root, ['trace', 'W101']).stdout;
  assert.match(traceText, /W101-T001 {1}[0-9a-f]{40} {1}implement item/);
  assert.match(traceText, / {2}implementation\.txt/);
  assert.equal(run(root, ['sync']).status, 0);
  const base = path.join(root, '_flow', 'work-items', 'W101-canonical-item');
  fs.writeFileSync(path.join(base, 'notes.md'), 'not review evidence\n');
  assert.equal(run(root, ['work-item', 'review-complete', 'W101', '--domain', 'flow']).status, 0);
  assert.match(
    execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }),
    /chore\(flow\): complete review \[W101\]/
  );
  assert.doesNotMatch(
    execFileSync('git', ['show', '--format=', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }),
    /notes\.md/
  );
  assert.equal(JSON.parse(run(root, ['route', '--json']).stdout).work_item, 'W102');
});

test('validate identifies missing, stale and malformed projections', () => {
  const root = project();
  ready(root);
  let report = JSON.parse(run(root, ['validate', '--json']).stdout);
  assert.ok(report.findings.some((finding: { code: string }) => finding.code === 'PROJECTION_MISSING'));
  assert.equal(run(root, ['sync']).status, 0);
  const projection = path.join(root, '_flow', 'generated', 'backlog.yaml');
  fs.writeFileSync(projection, 'not: [yaml');
  report = JSON.parse(run(root, ['validate', '--json']).stdout);
  assert.ok(report.findings.some((finding: { code: string }) => finding.code === 'PROJECTION_INCONSISTENT'));
});

test('task commit rejects undeclared staged files and trace requires canonical trailers', () => {
  const root = project();
  ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'implementation.txt'), 'done\n');
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'do not commit\n');
  execFileSync('git', ['add', 'implementation.txt', 'unrelated.txt'], { cwd: root });
  assert.equal(run(root, ['sync']).status, 0);
  const rejected = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(flow): implement item [W101-T001]',
    '--files',
    'implementation.txt'
  ]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Unexpected: unrelated.txt/);
  execFileSync('git', ['reset'], { cwd: root });
  execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
  assert.equal(run(root, ['scope', 'validate', 'W101-T001', '--files', 'implementation.txt']).status, 0);
  execFileSync('git', ['commit', '-m', 'feat(flow): old evidence [W101-T009]'], { cwd: root });
  const trace = run(root, ['trace', 'W101-T009']);
  assert.notEqual(trace.status, 0);
  assert.match(trace.stderr, /invalid canonical subject evidence/);
  const batch = run(root, ['batch']);
  assert.notEqual(batch.status, 0);
  assert.match(batch.stderr, /unknown command 'batch'/);
});

test('migration preserves legacy work-items and creates valid outlined shells', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-legacy-'));
  const flow = path.join(root, '.flow');
  fs.mkdirSync(path.join(flow, 'work-items', 'W001-reference-item'), { recursive: true });
  fs.writeFileSync(flow + '/config.yaml', 'schema_version: 2\nruntimes: []\nengineering: {}\n');
  fs.writeFileSync(
    flow + '/backlog.yaml',
    'schema_version: 2\nwork_items:\n  - id: W001\n    folder: W001-reference-item\n    title: Reference item\n    kind: feature\n    state: completed\n    priority: 1\n    depends_on: []\n    blockers: []\n'
  );
  fs.writeFileSync(path.join(flow, 'work-items', 'W001-reference-item', 'spec.md'), '# Legacy specification\n');
  fs.writeFileSync(
    path.join(flow, 'work-items', 'W001-reference-item', 'tasks.yaml'),
    'schema_version: 1\nwork_item: W001\ntasks:\n  - id: T001\n    title: Legacy task\n    state: completed\n    implementation: legacy\n'
  );
  const migration = run(root, ['migrate', '--apply']);
  assert.equal(migration.status, 0, migration.stderr);
  assert.ok(fs.existsSync(path.join(root, '_flow', 'docs', 'legacy-work-items', 'W001-reference-item', 'tasks.yaml')));
  const tasks = parse(
    fs.readFileSync(path.join(root, '_flow', 'work-items', 'W001-reference-item', 'tasks.yaml'), 'utf8')
  );
  assert.deepEqual(tasks.tasks, []);
  assert.equal(run(root, ['validate', '--json']).status, 0);
});

test('migration is a no-op for the current canonical layout', () => {
  const root = project();
  const plan = JSON.parse(run(root, ['migrate', '--plan', '--json']).stdout);
  assert.deepEqual(plan.changes, []);
  assert.equal(run(root, ['migrate', '--apply']).status, 0);
  assert.equal(fs.existsSync(path.join(root, '_flow-backups')), false);
});

test('failed task commits preserve the real index and task state', () => {
  const root = project();
  ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'implementation.txt'), 'done\n');
  execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
  assert.equal(run(root, ['sync']).status, 0);
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  const result = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(flow): implement item [W101-T001]',
    '--files',
    'implementation.txt'
  ]);
  assert.notEqual(result.status, 0);
  const tasks = parse(
    fs.readFileSync(path.join(root, '_flow', 'work-items', 'W101-canonical-item', 'tasks.yaml'), 'utf8')
  );
  assert.equal(tasks.tasks[0].state, 'in_progress');
  assert.deepEqual(
    execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/),
    ['implementation.txt']
  );
});

test('failed review commits preserve the real index and pending review', () => {
  const root = project();
  ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'implementation.txt'), 'done\n');
  execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(
    run(root, [
      'task',
      'commit',
      'W101-T001',
      '--message',
      'feat(flow): implement item [W101-T001]',
      '--files',
      'implementation.txt'
    ]).status,
    0
  );
  assert.equal(run(root, ['sync']).status, 0);
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  const result = run(root, ['work-item', 'review-complete', 'W101', '--domain', 'flow']);
  assert.notEqual(result.status, 0);
  const review = parse(
    fs.readFileSync(path.join(root, '_flow', 'work-items', 'W101-canonical-item', 'review.yaml'), 'utf8')
  );
  assert.equal(review.status, 'pending');
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim(), '');
});

test('packaged workflow instructions use the canonical task and review commands', () => {
  const planning = fs.readFileSync('skills/flow/planning/step-01-create-tasks.md', 'utf8');
  const build = fs.readFileSync('skills/flow/build/step-01-execute-task.md', 'utf8');
  const review = fs.readFileSync('skills/flow/review/step-01-review-work-item.md', 'utf8');
  const invariants = fs.readFileSync('skills/flow/invariants.md', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');

  for (const instructions of [planning, build, invariants]) {
    assert.doesNotMatch(instructions, /`traceability:/);
  }
  assert.doesNotMatch(build, /flow task complete/);
  assert.match(build, /flow task commit W###-T### --message "type\(domain\): description \[W###-T###\]" --files/);
  assert.match(review, /flow work-item review-complete W### --domain domain/);
  assert.match(readme, /flow task commit W015-T001 --message "feat\(search\): add customer query \[W015-T001\]"/);
});
