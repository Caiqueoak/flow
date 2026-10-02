import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const cli = path.resolve('dist/entry.js');
const run = (root: string, args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, '--path', root], { encoding: 'utf8' });

const PRD_HEADINGS = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
] as const;

const ENGINEERING_HEADINGS = [
  '# Engineering',
  '## Observed system',
  '## Adoption strategy',
  '## System shape',
  '## Modules and ownership',
  '## Dependency direction and boundaries',
  '## Vertical slices and code organization',
  '## Naming and readability conventions',
  '## Data ownership and persistence',
  '## Error handling',
  '## Testing and verification',
  '## Dependencies and external services',
  '## Security and operations',
  '## Deterministic gates',
  '## Deferred complexity',
  '## Exceptions'
] as const;

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-w2-contracts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root, ['init', '--runtime', 'codex']).status, 0);
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  return root;
}

function document(headings: readonly string[], metadata = '') {
  return `---\nschema_version: 2\nstatus: draft\n${metadata}---\n${headings
    .map((heading) => `\n${heading}\nConcrete contract.`)
    .join('\n')}\n`;
}

function writePrd(root: string, experience: 'required' | 'not_required') {
  fs.writeFileSync(path.join(root, '_flow', 'docs', 'prd.md'), document(PRD_HEADINGS, `experience: ${experience}\n`));
}

function writeEngineering(root: string) {
  fs.writeFileSync(
    path.join(root, '_flow', 'docs', 'engineering.md'),
    document(
      ENGINEERING_HEADINGS,
      'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: not_applicable\n'
    )
  );
}

function approvalCheckpoint(target: { kind: string; ref: string }, phase = 'discovery') {
  return JSON.stringify({
    phase,
    step: 'await_approval',
    target: { ...target, revision: null },
    inputs: [],
    dimensions: [{ id: 'D001', state: 'resolved', summary: 'Approval target is complete.' }],
    assumptions: [],
    latest_authorized_direction: 'Present this exact revision for approval.',
    next_frontier: []
  });
}

function beginApprovalReadyCheckpoint(root: string, target: { kind: string; ref: string }, phase = 'discovery') {
  assert.equal(run(root, ['checkpoint', 'begin', '--data', approvalCheckpoint(target, phase)]).status, 0);
  assert.equal(run(root, ['checkpoint', 'ready']).status, 0);
}

function writeReadySpec(root: string): string {
  assert.equal(run(root, ['work-item', 'create', 'W101', '--title', 'Item', '--outcome', 'Outcome']).status, 0);
  const spec = path.join(root, '_flow', 'work-items', 'W101-item', 'spec.md');
  fs.appendFileSync(
    spec,
    '\n# Work Item Specification\n## Problem\nX\n## Scope\nX\n## Non-goals\nX\n## Requirements\nX\n## Acceptance criteria\nX\n## Contracts\nX\n## Data and APIs\nX\n## Edge cases\nX\n## Risks\nX\n## Decisions\nX\n## Gates\nX\n'
  );
  assert.equal(run(root, ['work-item', 'promote', 'W101']).status, 0);
  return spec;
}

test('approval without a checkpoint remains supported for explicit manual workflows', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');

  const approved = run(root, ['approval', 'record', '_flow/docs/prd.md']);
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8'), /status: approved/);
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).checkpoint, null);
});

test('not-required experience skips directly to engineering after exact PRD approval', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');
  assert.equal(run(root, ['approval', 'record', '_flow/docs/prd.md']).status, 0);

  assert.deepEqual(JSON.parse(run(root, ['route', '--json']).stdout), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });

  fs.appendFileSync(path.join(root, '_flow', 'docs', 'prd.md'), '\nmaterial edit\n');
  const stale = JSON.parse(run(root, ['route', '--json']).stdout);
  assert.equal(stale.action, 'stop');
  assert.equal(stale.phase, 'discovery');
  assert.equal(stale.instruction, 'discovery/step-02-await-approval.md');
});

test('required experience must exist and be exactly approved before engineering', (t) => {
  const root = project(t);
  writePrd(root, 'required');
  assert.equal(run(root, ['approval', 'record', '_flow/docs/prd.md']).status, 0);

  assert.deepEqual(JSON.parse(run(root, ['route', '--json']).stdout), {
    action: 'continue',
    phase: 'experience',
    instruction: 'experience/step-01-define.md'
  });

  fs.writeFileSync(path.join(root, '_flow', 'docs', 'experience.md'), document(['# Experience']));
  let route = JSON.parse(run(root, ['route', '--json']).stdout);
  assert.equal(route.action, 'stop');
  assert.equal(route.phase, 'experience');

  assert.equal(run(root, ['approval', 'record', '_flow/docs/experience.md']).status, 0);
  route = JSON.parse(run(root, ['route', '--json']).stdout);
  assert.equal(route.phase, 'engineering');

  fs.appendFileSync(path.join(root, '_flow', 'docs', 'experience.md'), '\nchanged interaction\n');
  route = JSON.parse(run(root, ['route', '--json']).stdout);
  assert.equal(route.action, 'stop');
  assert.equal(route.phase, 'experience');
});

test('matching approval-ready revision is approved and clears its checkpoint', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');
  beginApprovalReadyCheckpoint(root, { kind: 'project_document', ref: '_flow/docs/prd.md' });

  const presentedRevision = parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).checkpoint.target.revision;
  const approved = run(root, ['approval', 'record', '_flow/docs/prd.md']);
  assert.equal(approved.status, 0, approved.stderr);

  const prd = fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8');
  assert.match(prd, new RegExp(`revision: ${presentedRevision}`));
  assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8')).checkpoint, null);
});

test('project document approval rejects edits after checkpoint ready without partial mutation', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');
  beginApprovalReadyCheckpoint(root, { kind: 'project_document', ref: '_flow/docs/prd.md' });

  fs.appendFileSync(path.join(root, '_flow', 'docs', 'prd.md'), '\nnew approval scope\n');
  const documentBeforeApproval = fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8');
  const stateBeforeApproval = fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8');

  const approval = run(root, ['approval', 'record', '_flow/docs/prd.md']);
  assert.notEqual(approval.status, 0);
  assert.match(approval.stderr, /does not match approval-ready checkpoint revision/);
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'docs', 'prd.md'), 'utf8'), documentBeforeApproval);
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'), stateBeforeApproval);
});

test('work-item spec approval rejects edits after checkpoint ready without partial mutation', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');
  writeEngineering(root);
  assert.equal(run(root, ['approval', 'record', '_flow/docs/prd.md']).status, 0);
  assert.equal(run(root, ['approval', 'record', '_flow/docs/engineering.md']).status, 0);

  const spec = writeReadySpec(root);
  const target = path.relative(root, spec).replaceAll('\\', '/');
  beginApprovalReadyCheckpoint(root, { kind: 'work_item_spec', ref: target }, 'specification');

  fs.appendFileSync(spec, '\nchanged after human presentation\n');
  const specBeforeApproval = fs.readFileSync(spec, 'utf8');
  const stateBeforeApproval = fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8');

  const approval = run(root, ['approval', 'record', target]);
  assert.notEqual(approval.status, 0);
  assert.match(approval.stderr, /does not match approval-ready checkpoint revision/);
  assert.equal(fs.readFileSync(spec, 'utf8'), specBeforeApproval);
  assert.equal(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'), stateBeforeApproval);
});

test('stale engineering approval cannot authorize task mutation', (t) => {
  const root = project(t);
  writePrd(root, 'not_required');
  writeEngineering(root);
  assert.equal(run(root, ['approval', 'record', '_flow/docs/prd.md']).status, 0);
  assert.equal(run(root, ['approval', 'record', '_flow/docs/engineering.md']).status, 0);

  const spec = writeReadySpec(root);
  assert.equal(run(root, ['approval', 'record', path.relative(root, spec)]).status, 0);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);

  fs.appendFileSync(path.join(root, '_flow', 'docs', 'engineering.md'), '\narchitecture changed\n');
  const started = run(root, ['task', 'start', 'W101-T001']);
  assert.notEqual(started.status, 0);
  assert.match(started.stderr, /engineering\.md is not authorized at its current exact revision/);
});
