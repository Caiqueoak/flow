import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const cli = path.resolve('dist/entry.js');
const run = (root, args) => spawnSync(process.execPath, [cli, ...args, '--path', root], { encoding: 'utf8' });
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
function ready(root, id = 'W101') {
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
  const base = ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  const source = path.join(root, 'source.js');
  fs.writeFileSync(source, 'export const value = 1;\n');
  execFileSync('git', ['add', 'source.js'], { cwd: root });
  const commit = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(core): implement canonical item [W101-T001]',
    '--files',
    'source.js'
  ]);
  assert.equal(commit.status, 0, commit.stderr);
  assert.equal(run(root, ['work-item', 'review-complete', 'W101', '--domain', 'core']).status, 0);
  assert.equal(parse(fs.readFileSync(path.join(base, 'review.yaml'), 'utf8')).status, 'approved');
});

test('task commit rejects unrelated staged files', () => {
  const root = project();
  ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'allowed.js'), 'export const allowed = true;\n');
  fs.writeFileSync(path.join(root, 'unrelated.js'), 'export const unrelated = true;\n');
  execFileSync('git', ['add', 'allowed.js', 'unrelated.js'], { cwd: root });
  const commit = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(core): implement canonical item [W101-T001]',
    '--files',
    'allowed.js'
  ]);
  assert.notEqual(commit.status, 0);
  assert.match(commit.stderr, /Staged scope differs from --files/);
});

test('work-item dependencies and blockers remain canonical in spec frontmatter', () => {
  const root = project();
  assert.equal(run(root, ['work-item', 'create', 'W101', '--title', 'First']).status, 0);
  assert.equal(run(root, ['work-item', 'create', 'W102', '--title', 'Second']).status, 0);
  assert.equal(run(root, ['work-item', 'dependencies', 'W102', '--depends-on', 'W101']).status, 0);
  assert.equal(
    run(root, [
      'work-item',
      'blocker-add',
      'W102',
      '--id',
      'vendor',
      '--type',
      'external_action',
      '--description',
      'Vendor approval'
    ]).status,
    0
  );
  const spec = fs.readFileSync(path.join(root, '_flow', 'work-items', 'W102-second', 'spec.md'), 'utf8');
  assert.match(spec, /W101/);
  assert.match(spec, /vendor/);
});

test('schema generator remains deterministic', () => {
  const before = fs.readFileSync('schemas/tasks.schema.json', 'utf8');
  const runSchema = spawnSync(process.execPath, [cli, 'schemas'], { encoding: 'utf8' });
  assert.equal(runSchema.status, 0, runSchema.stderr);
  assert.equal(fs.readFileSync('schemas/tasks.schema.json', 'utf8'), before);
});
