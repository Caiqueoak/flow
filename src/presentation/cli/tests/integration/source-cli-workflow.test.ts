import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { runCli } from '../../dispatch-command.js';
import { migrateProject } from '../../../../application/migrate/operations/apply.mjs';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';

const PRD_HEADINGS = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
];

const headings = [
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

async function flow(root: string, args: string[]) {
  const output: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => output.push(values.map(String).join(' '));
  try {
    await runCli([...args, '--path', root]);
  } finally {
    console.log = original;
  }
  return output.join('\n');
}

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-source-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'flow@test.local'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: root });
  return root;
}

function prdDocument(status: 'draft' | 'approved') {
  const approvedAt = status === 'approved' ? 'approved_at: 2026-01-01T00:00:00.000Z\n' : '';
  return `---\nschema_version: 1\nstatus: ${status}\n${approvedAt}---\n\n${PRD_HEADINGS.map((heading) => `${heading}\nText.`).join('\n\n')}\n`;
}

function engineeringDocument(status: 'draft' | 'approved', policy: string) {
  const approvedAt = status === 'approved' ? 'approved_at: 2026-01-01T00:00:00.000Z\n' : '';
  return `---\nschema_version: 1\nstatus: ${status}\n${approvedAt}baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: ${policy}\n---\n\n${ENGINEERING_HEADINGS.map((heading) => `${heading}\nText.`).join('\n\n')}\n`;
}

function writeApprovedProjectBaseline(root: string, policy = 'not_applicable') {
  const docs = path.join(root, '_flow', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'prd.md'), prdDocument('approved'));
  fs.writeFileSync(path.join(docs, 'engineering.md'), engineeringDocument('approved', policy));
}

function setRecordedFlowVersion(root: string, version: string) {
  const configPath = path.join(root, '_flow', 'config.yaml');
  const config = parse(fs.readFileSync(configPath, 'utf8'));
  config.flow_version = version;
  fs.writeFileSync(configPath, stringify(config, { lineWidth: 0 }));
}

test('global help lists the stable public command surface', async () => {
  const output: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => output.push(values.map(String).join(' '));
  try {
    await runCli(['--help']);
  } finally {
    console.log = original;
  }

  const help = output.join('\n');
  for (const command of [
    'init',
    'doctor',
    'migrate',
    'status',
    'validate',
    'route',
    'sync',
    'trace',
    'gates',
    'work-item',
    'task',
    'approval',
    'scope'
  ]) {
    assert.match(help, new RegExp(`^  ${command}\\s`, 'm'));
  }
});

test('greenfield bootstrap routes discovery, approvals, engineering, then backlog generation', async (t) => {
  const root = project(t);
  await flow(root, ['init', '--runtime', 'codex']);

  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).engineering.existing_code_policy,
    'not_applicable'
  );
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'discovery',
    instruction: 'discovery/step-01-project.md'
  });

  const docs = path.join(root, '_flow', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'prd.md'), prdDocument('draft'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'stop',
    reason: 'consequential_decision',
    phase: 'discovery',
    instruction: 'discovery/step-02-await-approval.md'
  });

  fs.writeFileSync(path.join(docs, 'prd.md'), prdDocument('approved'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });

  fs.writeFileSync(path.join(docs, 'engineering.md'), engineeringDocument('draft', 'not_applicable'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'stop',
    reason: 'consequential_decision',
    phase: 'engineering',
    instruction: 'engineering/step-05-present.md'
  });

  fs.writeFileSync(path.join(docs, 'engineering.md'), engineeringDocument('approved', 'not_applicable'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'planning',
    instruction: 'planning/step-01-plan-work-item.md'
  });

  await flow(root, [
    'work-item',
    'create',
    'W001',
    '--title',
    'First MVP outcome',
    '--outcome',
    'User can complete the first MVP outcome.'
  ]);
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'specification',
    instruction: 'specification/step-01-deepen-spec.md',
    work_item: 'W001'
  });
});

test('brownfield bootstrap discovers product before engineering adoption and trusts approved engineering', async (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {};\n');
  await flow(root, ['init', '--runtime', 'codex']);

  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).engineering.existing_code_policy,
    'undecided'
  );
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'discovery',
    instruction: 'discovery/step-01-project.md'
  });

  const docs = path.join(root, '_flow', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'prd.md'), prdDocument('approved'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });

  fs.writeFileSync(path.join(docs, 'engineering.md'), engineeringDocument('approved', 'incremental'));
  assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
    action: 'continue',
    phase: 'planning',
    instruction: 'planning/step-01-plan-work-item.md'
  });

  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).engineering.existing_code_policy,
    'undecided'
  );
});

test('explicit brownfield adoption is preserved by init', async (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {};\n');

  await flow(root, ['init', '--runtime', 'codex', '--existing-code', 'incremental']);

  assert.equal(
    parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).engineering.existing_code_policy,
    'incremental'
  );
});

test('source CLI lifecycle has observable, deterministic transitions', async (t) => {
  const root = project(t);
  const base = path.join(root, '_flow', 'work-items', 'W101-source-workflow');

  await t.test('initializes and diagnoses the project', async () => {
    assert.match(await flow(root, ['init', '--runtime', 'codex', '--existing-code', 'incremental']), /Flow is ready/);
    const diagnosis = JSON.parse(await flow(root, ['doctor', '--quick', '--json']));
    assert.equal(diagnosis.healthy, true);
    assert.equal(diagnosis.mode, 'quick');
    assert.equal(fs.existsSync(path.join(root, '_flow', 'config.yaml')), true);
    writeApprovedProjectBaseline(root, 'incremental');
  });

  await t.test('creates, updates and promotes canonical work-item metadata', async () => {
    assert.equal(
      await flow(root, [
        'work-item',
        'create',
        'W101',
        '--title',
        'Source workflow',
        '--outcome',
        'User can complete the source workflow.'
      ]),
      'W101 created.'
    );
    await flow(root, ['work-item', 'priority', 'W101', '--priority', '2']);
    await flow(root, [
      'work-item',
      'blocker-add',
      'W101',
      '--id',
      'B001',
      '--type',
      'external_action',
      '--description',
      'Awaiting input'
    ]);
    await flow(root, ['work-item', 'blocker-resolve', 'W101', '--id', 'B001']);
    const spec = path.join(base, 'spec.md');
    assert.match(fs.readFileSync(spec, 'utf8'), /priority: 2[\s\S]*status: resolved/);
    fs.appendFileSync(spec, `\n${headings.map((heading) => `${heading}\nText.`).join('\n\n')}\n`);
    assert.equal(await flow(root, ['work-item', 'promote', 'W101']), 'W101 updated.');
    assert.match(fs.readFileSync(spec, 'utf8'), /maturity: ready/);
  });

  await t.test('approves, executes and commits one task with exact evidence', async () => {
    assert.match(
      await flow(root, ['approval', 'record', '_flow/work-items/W101-source-workflow/spec.md', '--at', '2026-01-01']),
      /specification approved/
    );
    await flow(root, ['task', 'create', 'W101', '--title', 'Implement source workflow']);
    await flow(root, ['task', 'set', 'W101-T001', '--title', 'Implement updated source workflow']);
    assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), {
      action: 'continue',
      phase: 'implementation',
      instruction: 'build/step-01-execute-task.md',
      work_item: 'W101',
      task: 'W101-T001'
    });
    assert.equal(await flow(root, ['task', 'start', 'W101-T001']), 'W101-T001 started.');
    await flow(root, ['sync']);
    fs.writeFileSync(path.join(root, 'implementation.txt'), 'done\n');
    execFileSync('git', ['add', 'implementation.txt'], { cwd: root });
    assert.match(
      await flow(root, ['scope', 'validate', 'W101-T001', '--files', 'implementation.txt']),
      /staged scope is valid/
    );
    assert.equal(
      await flow(root, [
        'task',
        'commit',
        'W101-T001',
        '--message',
        'feat(flow): source workflow [W101-T001]',
        '--files',
        'implementation.txt'
      ]),
      'W101-T001 committed.'
    );
    assert.deepEqual(
      execFileSync('git', ['show', '--format=', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' })
        .trim()
        .split(/\r?\n/),
      ['_flow/work-items/W101-source-workflow/tasks.yaml', 'implementation.txt']
    );
  });

  await t.test('reports, reviews, routes and migrates without mutating canonical evidence', async () => {
    await flow(root, ['sync']);
    assert.equal(JSON.parse(await flow(root, ['validate', '--json'])).valid, true);
    assert.equal(JSON.parse(await flow(root, ['status', '--json'])).work_items[0].status, 'review');
    const trace = JSON.parse(await flow(root, ['trace', 'W101', '--json']));
    assert.equal(trace.tasks[0].task, 'W101-T001');
    assert.deepEqual(JSON.parse(await flow(root, ['gates', 'list', '--json'])), []);
    const canonicalBeforeReview = fs.readFileSync(path.join(base, 'tasks.yaml'), 'utf8');
    assert.match(await flow(root, ['work-item', 'review-complete', 'W101', '--domain', 'flow']), /review completed/);
    assert.deepEqual(JSON.parse(await flow(root, ['route', '--json'])), { action: 'stop', reason: 'finished' });
    const plan = JSON.parse(await flow(root, ['migrate', '--plan', '--json']));
    assert.deepEqual(plan.changes, []);

    setRecordedFlowVersion(root, '0.8.0');
    const migration = migrateProject(root, { targetVersion: '0.9.0' });

    assert.equal(migration.unchanged, false);
    assert.equal(parse(fs.readFileSync(path.join(root, '_flow', 'config.yaml'), 'utf8')).flow_version, '0.9.0');
    assert.equal(fs.readFileSync(path.join(base, 'tasks.yaml'), 'utf8'), canonicalBeforeReview);
    assert.equal(fs.existsSync(path.join(root, '_flow', 'generated', 'backlog.yaml')), true);
    assert.match(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8' }), /complete review/);
  });
});

test('source CLI rejects invalid command shapes without writing project data', async (t) => {
  const root = project(t);
  await assert.rejects(() => flow(root, ['migrate', '--plan', '--apply']), /requires exactly one/);
  await assert.rejects(() => flow(root, ['unknown']), /unknown command/);
  assert.equal(fs.existsSync(path.join(root, '_flow')), false);
});
