import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const cli = path.resolve('src/cli.mjs');
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
  assert.ok(fs.existsSync(path.join(root, '_flow', 'generated', 'backlog.yaml')));
  assert.equal(run(root, ['validate', '--json']).status, 0);
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
    run(root, ['task', 'commit', 'W101-T001', '--message', 'feat(flow): implement item [W101-T001]']).status,
    0
  );
  assert.match(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }), /\[W101-T001\]/);
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(run(root, ['work-item', 'review-complete', 'W101', '--domain', 'flow']).status, 0);
  assert.match(
    execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }),
    /chore\(flow\): complete review \[W101\]/
  );
  assert.equal(JSON.parse(run(root, ['route', '--json']).stdout).work_item, 'W102');
});

test('validate identifies missing, stale and malformed projections', () => {
  const root = project();
  ready(root);
  let report = JSON.parse(run(root, ['validate', '--json']).stdout);
  assert.ok(report.findings.some((finding) => finding.code === 'PROJECTION_MISSING'));
  assert.equal(run(root, ['sync']).status, 0);
  const projection = path.join(root, '_flow', 'generated', 'backlog.yaml');
  fs.writeFileSync(projection, 'not: [yaml');
  report = JSON.parse(run(root, ['validate', '--json']).stdout);
  assert.ok(report.findings.some((finding) => finding.code === 'PROJECTION_INCONSISTENT'));
});
