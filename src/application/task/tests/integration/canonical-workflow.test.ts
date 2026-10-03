import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const cli = path.resolve('dist/entry.js');
const temporaryRoots = new Set<string>();
test.after(() => {
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});
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
const prdHeadings = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
];

const engineeringHeadings = [
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
];

function projectDocument(headings: readonly string[], metadata = '') {
  const body = headings.map((heading) => `${heading}\nText.`).join('\n\n');
  return `---\nschema_version: 2\nstatus: draft\n${metadata}---\n\n${body}\n`;
}

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-canonical-'));
  temporaryRoots.add(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'flow@test.local'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: root });
  assert.equal(run(root, ['init', '--runtime', 'codex', '--existing-code', 'incremental']).status, 0);
  const docs = path.join(root, '_flow', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'prd.md'), projectDocument(prdHeadings, 'experience: not_required\n'));
  fs.writeFileSync(
    path.join(docs, 'engineering.md'),
    projectDocument(
      engineeringHeadings,
      'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: incremental\n'
    )
  );
  assert.equal(run(root, ['approval', 'record', '_flow/docs/prd.md']).status, 0);
  assert.equal(run(root, ['approval', 'record', '_flow/docs/engineering.md']).status, 0);
  return root;
}
function ready(root: string, id = 'W101') {
  assert.equal(
    run(root, [
      'work-item',
      'create',
      id,
      '--title',
      'Canonical item',
      '--outcome',
      'User can complete the canonical item.'
    ]).status,
    0
  );
  const state = parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'));
  if (state.checkpoint?.target?.ref === '_flow/work-items') {
    assert.equal(run(root, ['checkpoint', 'clear', '--target-ref', '_flow/work-items']).status, 0);
  }
  const base = path.join(root, '_flow', 'work-items', `${id}-canonical-item`);
  const spec = path.join(base, 'spec.md');
  const original = fs.readFileSync(spec, 'utf8');
  fs.writeFileSync(spec, `${original}\n${headings.map((heading) => `${heading}\nText.`).join('\n\n')}\n`);
  assert.equal(run(root, ['work-item', 'promote', id]).status, 0);
  assert.equal(run(root, ['approval', 'record', path.relative(root, spec)]).status, 0);
  return base;
}

test('compiled CLI creates canonical shells and sync never mutates them', () => {
  const root = project();
  assert.equal(
    run(root, [
      'work-item',
      'create',
      'W101',
      '--title',
      'Canonical item',
      '--outcome',
      'User can complete the canonical item.'
    ]).status,
    0
  );
  const base = path.join(root, '_flow', 'work-items', 'W101-canonical-item');
  for (const file of ['spec.md', 'tasks.yaml', 'review.yaml']) assert.ok(fs.existsSync(path.join(base, file)));
  assert.equal(fs.existsSync(path.join(base, 'implementation-plan.md')), false);
  assert.match(fs.readFileSync(path.join(base, 'spec.md'), 'utf8'), /outcome: User can complete the canonical item\./);
  assert.match(
    fs.readFileSync(path.join(base, 'spec.md'), 'utf8'),
    /## Outcome\n\nUser can complete the canonical item\./
  );
  assert.deepEqual(parse(fs.readFileSync(path.join(base, 'tasks.yaml'), 'utf8')).tasks, []);
  const before = fs.readFileSync(path.join(base, 'spec.md'), 'utf8');
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(fs.readFileSync(path.join(base, 'spec.md'), 'utf8'), before);
  const generated = parse(fs.readFileSync(path.join(root, '_flow', 'generated', 'backlog.yaml'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync('schemas/backlog.schema.json', 'utf8'));
  assert.equal(generated.work_items[0].spec_maturity, 'outlined');
  assert.equal(generated.work_items[0].outcome, 'User can complete the canonical item.');
  assert.match(
    fs.readFileSync(path.join(root, '_flow', 'generated', 'graph.md'), 'utf8'),
    /W101 Canonical item.*User can complete the canonical item\./
  );
  assert.ok(schema.properties.work_items.items.required.includes('spec_maturity'));
  assert.ok(schema.properties.work_items.items.properties.state.enum.includes(generated.work_items[0].state));
  assert.equal(run(root, ['validate', '--json']).status, 0);
});

test('approved spec routes directly through task creation and start without a plan artifact', () => {
  const root = project();
  const base = ready(root);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement']).status, 0);
  assert.equal(fs.existsSync(path.join(base, 'implementation-plan.md')), false);
  fs.appendFileSync(path.join(root, '_flow', 'docs', 'engineering.md'), 'changed\n');
  const rejected = run(root, ['task', 'start', 'W101-T001']);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /engineering\.md is not authorized at its current exact revision/);
});

test('quick doctor validates canonical work-items', () => {
  const root = project();
  const base = ready(root);
  assert.equal(run(root, ['doctor', '--quick', '--json']).status, 0);

  fs.rmSync(path.join(base, 'review.yaml'));
  const broken = run(root, ['doctor', '--quick', '--json']);
  assert.notEqual(broken.status, 0);
  const diagnosis = JSON.parse(broken.stdout);
  assert.equal(diagnosis.checks.find((check: { id: string }) => check.id === 'work-items').status, 'fail');
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

test('finished projects stay finished until new scope creates new immutable work', () => {
  const root = project();
  const completedBase = ready(root, 'W101');
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Implement completed outcome']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  fs.writeFileSync(path.join(root, 'completed.txt'), 'done\n');
  execFileSync('git', ['add', 'completed.txt'], { cwd: root });
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(
    run(root, [
      'task',
      'commit',
      'W101-T001',
      '--message',
      'feat(flow): complete original outcome [W101-T001]',
      '--files',
      'completed.txt'
    ]).status,
    0
  );
  assert.equal(run(root, ['sync']).status, 0);
  assert.equal(run(root, ['work-item', 'review-complete', 'W101', '--domain', 'flow']).status, 0);

  assert.deepEqual(JSON.parse(run(root, ['route', '--json']).stdout), { action: 'stop', reason: 'finished' });

  const completedHistory = Object.fromEntries(
    ['spec.md', 'tasks.yaml', 'review.yaml'].map((file) => [
      file,
      fs.readFileSync(path.join(completedBase, file), 'utf8')
    ])
  );

  assert.deepEqual(JSON.parse(run(root, ['route', '--json']).stdout), { action: 'stop', reason: 'finished' });

  assert.equal(
    run(root, [
      'work-item',
      'create',
      'W102',
      '--title',
      'Deliver new feature',
      '--outcome',
      'User can use the newly requested feature.'
    ]).status,
    0
  );

  assert.deepEqual(JSON.parse(run(root, ['route', '--json']).stdout), {
    action: 'continue',
    phase: 'specification',
    instruction: 'specification/step-01-deepen-spec.md',
    work_item: 'W102'
  });

  for (const [file, before] of Object.entries(completedHistory)) {
    assert.equal(fs.readFileSync(path.join(completedBase, file), 'utf8'), before);
  }
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
  temporaryRoots.add(root);
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
  assert.equal(
    fs.existsSync(path.join(root, '_flow', 'work-items', 'W001-reference-item', 'implementation-plan.md')),
    false
  );
  const migratedConfig = parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8'));
  assert.equal(migratedConfig.engineering.existing_code_policy, 'undecided');
  const diagnosis = JSON.parse(run(root, ['doctor', '--quick', '--json']).stdout);
  assert.equal(diagnosis.checks.find((check: { id: string }) => check.id === 'migration-state').status, 'pass');
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
  const flowSkill = fs.readFileSync('skills/flow/SKILL.md', 'utf8');
  const newScope = fs.readFileSync('skills/flow/discovery/new-scope.md', 'utf8');

  assert.match(flowSkill, /route returns \`finished\`[\s\S]*substantive new feature\/change request/);
  assert.match(newScope, /Do not rediscover unrelated parts of the project/);
  assert.match(newScope, /reuse it unchanged/);
  assert.match(newScope, /new outcome work-items with new W### identities/);
  assert.match(newScope, /Never reopen, renumber, rewrite or append tasks to completed work-items/);

  for (const instructions of [planning, build, invariants]) {
    assert.doesNotMatch(instructions, /`traceability:/);
  }
  assert.doesNotMatch(build, /flow task complete/);
  assert.match(build, /flow task commit W###-T### --message "type\(domain\): description \[W###-T###\]" --files/);
  assert.match(review, /flow work-item review-complete W### --domain domain/);
  assert.match(readme, /flow task commit W015-T001 --message "feat\(search\): add customer query \[W015-T001\]"/);
});


test('W4 starts independent same-work-item tasks concurrently and routes through active work-item focus', () => {
  const root = project();
  ready(root);
  assert.equal(
    run(root, [
      'task',
      'create',
      'W101',
      '--title',
      'Implement A',
      '--mutation-surfaces',
      'src/a',
      '--mutation-resources',
      ''
    ]).status,
    0
  );
  assert.equal(
    run(root, [
      'task',
      'create',
      'W101',
      '--title',
      'Implement B',
      '--mutation-surfaces',
      'src/b',
      '--mutation-resources',
      ''
    ]).status,
    0
  );

  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T002']).status, 0);

  const state = parse(fs.readFileSync(path.join(root, '_flow', 'state.yaml'), 'utf8'));
  assert.equal(state.active.work_item, 'W101');
  const route = JSON.parse(run(root, ['route', '--json']).stdout);
  assert.equal(route.work_item, 'W101');
  assert.match(route.details?.join(' ') ?? '', /W101-T001, W101-T002/);
});

test('W4 blocks second writers without claims and cross-work-item execution', () => {
  const root = project();
  ready(root, 'W101');
  ready(root, 'W102');
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Legacy single task']).status, 0);
  assert.equal(run(root, ['task', 'create', 'W101', '--title', 'Second task']).status, 0);
  assert.equal(run(root, ['task', 'create', 'W102', '--title', 'Other item task']).status, 0);

  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  const missingClaims = run(root, ['task', 'start', 'W101-T002']);
  assert.notEqual(missingClaims.status, 0);
  assert.match(missingClaims.stderr, /requires mutation\.surfaces and mutation\.resources/);

  const crossItem = run(root, ['task', 'start', 'W102-T001']);
  assert.notEqual(crossItem.status, 0);
  assert.match(crossItem.stderr, /multiple work items|state\.active\.work_item/);
});

test('W4 concurrent commit stays inside its claim and outside another active claim', () => {
  const root = project();
  ready(root);
  for (const [title, surface] of [
    ['Implement A', 'src/a'],
    ['Implement B', 'src/b']
  ]) {
    assert.equal(
      run(root, [
        'task',
        'create',
        'W101',
        '--title',
        title,
        '--mutation-surfaces',
        surface,
        '--mutation-resources',
        ''
      ]).status,
      0
    );
  }
  assert.equal(run(root, ['task', 'start', 'W101-T001']).status, 0);
  assert.equal(run(root, ['task', 'start', 'W101-T002']).status, 0);
  assert.equal(run(root, ['sync']).status, 0);

  fs.mkdirSync(path.join(root, 'src', 'b'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'b', 'foreign.ts'), 'foreign\n');
  execFileSync('git', ['add', 'src/b/foreign.ts'], { cwd: root });
  const otherClaim = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(flow): reject other claim [W101-T001]',
    '--files',
    'src/b/foreign.ts'
  ]);
  assert.notEqual(otherClaim.status, 0);
  assert.match(otherClaim.stderr, /another active task's mutation surface/);
  execFileSync('git', ['reset'], { cwd: root });

  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside\n');
  execFileSync('git', ['add', 'outside.txt'], { cwd: root });
  const outsideClaim = run(root, [
    'task',
    'commit',
    'W101-T001',
    '--message',
    'feat(flow): reject outside claim [W101-T001]',
    '--files',
    'outside.txt'
  ]);
  assert.notEqual(outsideClaim.status, 0);
  assert.match(outsideClaim.stderr, /outside T001's declared mutation surfaces/);
  execFileSync('git', ['reset'], { cwd: root });

  fs.mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a', 'inside.ts'), 'inside\n');
  execFileSync('git', ['add', 'src/a/inside.ts'], { cwd: root });
  assert.equal(
    run(root, [
      'task',
      'commit',
      'W101-T001',
      '--message',
      'feat(flow): commit inside claim [W101-T001]',
      '--files',
      'src/a/inside.ts'
    ]).status,
    0
  );
});

test('W4 rejects invalid and traversing mutation surfaces before persistence', () => {
  const root = project();
  ready(root);
  for (const surface of ['/absolute/path', '../escape', 'src/**']) {
    const result = run(root, [
      'task',
      'create',
      'W101',
      '--title',
      'Invalid claim',
      '--mutation-surfaces',
      surface,
      '--mutation-resources',
      ''
    ]);
    assert.notEqual(result.status, 0);
  }
});
