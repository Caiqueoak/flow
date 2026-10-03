import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  evaluateRun,
  prepareRun,
  validateBenchmarkDefinitions,
  validatePreparedFixture
} from '../../benchmark-harness.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
const benchmarkIds = ['B01', 'B02', 'B05', 'B06', 'B07', 'B08', 'B11', 'B12'];

function tempRuns(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-benchmark-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function prepare(t: test.TestContext, benchmarkId: string, runId = `${benchmarkId}-r1`) {
  const runs = tempRuns(t);
  const runRoot = prepareRun(repoRoot, runs, runId, {
    benchmark_id: benchmarkId,
    flow_revision: 'abc123',
    runtime: null,
    model: null,
    config: null,
    repeat: 1
  });
  return { runs, runRoot };
}

test('W8 benchmark fixture and evaluator truth remain aligned and executable', () => {
  assert.deepEqual(validateBenchmarkDefinitions(repoRoot), []);
});

test('every prepared benchmark is structurally valid for its intended Flow path', (t) => {
  for (const id of benchmarkIds) {
    const runs = fs.mkdtempSync(path.join(os.tmpdir(), `flow-benchmark-${id}-`));
    t.after(() => fs.rmSync(runs, { recursive: true, force: true }));
    const runRoot = prepareRun(repoRoot, runs, `${id}-r1`, {
      benchmark_id: id,
      flow_revision: 'abc123',
      runtime: null,
      model: null,
      config: null,
      repeat: 1
    });
    assert.deepEqual(validatePreparedFixture(path.join(runRoot, 'workspace'), id), [], id);
  }
});

test('prepare exposes agent context but keeps evaluator truth and evidence channel out of the workspace', (t) => {
  const { runRoot } = prepare(t, 'B01');
  assert.equal(fs.existsSync(path.join(runRoot, 'workspace', 'agent-context.json')), true);
  assert.equal(fs.existsSync(path.join(runRoot, 'workspace', 'evaluator-truth.json')), false);
  assert.equal(fs.existsSync(path.join(runRoot, 'evaluator-events.json')), false);
  assert.equal(fs.existsSync(path.join(runRoot, 'manifest.json')), true);
});

test('malformed Flow fixture is rejected by canonical parser validation', (t) => {
  const workspace = tempRuns(t);
  fs.mkdirSync(path.join(workspace, '_flow'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '_flow', 'state.yaml'), 'schema_version: 3\ncheckpoint: {}\n');
  const issues = validatePreparedFixture(workspace, 'B01');
  assert.equal(issues.length > 0, true);
});

test('fake self-reported hard facts cannot override contradictory repository evidence', (t) => {
  const { runRoot } = prepare(t, 'B01');
  fs.writeFileSync(
    path.join(runRoot, 'workspace', '_flow', 'state.yaml'),
    'schema_version: 3\nactive:\n  work_item: null\n  concurrency: null\ncheckpoint: null\nmigration:\n  status: not_required\n'
  );
  fs.writeFileSync(
    path.join(runRoot, 'observation.json'),
    JSON.stringify({ facts: { checkpoint_active_with_unresolved: true, route_resumes_discovery: true } })
  );

  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, false);
  const assertions = result.hard_assertions as Array<{ path: string; actual: unknown }>;
  assert.equal(assertions.find((item) => item.path === 'derived.checkpoint_active_with_unresolved')?.actual, false);
});

test('B05 safe sequential fallback is accepted when conflicting writers do not overlap', (t) => {
  const { runRoot } = prepare(t, 'B05');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  fs.writeFileSync(
    path.join(runRoot, 'evaluator-events.json'),
    JSON.stringify([
      { sequence: 1, type: 'writer_start', task: 'W001-T003' },
      { sequence: 2, type: 'writer_finish', task: 'W001-T003' },
      { sequence: 3, type: 'writer_start', task: 'W001-T004' },
      { sequence: 4, type: 'writer_finish', task: 'W001-T004' }
    ])
  );
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
});

test('B05 rejects conflicting concurrent writers from evaluator-owned events', (t) => {
  const { runRoot } = prepare(t, 'B05');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  fs.writeFileSync(
    path.join(runRoot, 'evaluator-events.json'),
    JSON.stringify([
      { sequence: 1, type: 'writer_start', task: 'W001-T003' },
      { sequence: 2, type: 'writer_start', task: 'W001-T004' },
      { sequence: 3, type: 'writer_finish', task: 'W001-T004' },
      { sequence: 4, type: 'writer_finish', task: 'W001-T003' }
    ])
  );
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, false);
});

test('B02 derives fresh-chat resume evidence from the canonical checkpoint', (t) => {
  const { runRoot } = prepare(t, 'B02');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
});

test('B06 derives constraint preservation from the actual worker handoff artifact', (t) => {
  const { runRoot } = prepare(t, 'B06');
  fs.writeFileSync(
    path.join(runRoot, 'workspace', 'handoff.json'),
    JSON.stringify({
      objective: 'Implement the bounded parser change.',
      references: ['AGENTS.md#INGESTION_DEPENDENCY'],
      owned_surface: 'src/application/ingestion'
    })
  );
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
});

test('B07 derives seeded blocker detection from repository and review artifacts', (t) => {
  const { runRoot } = prepare(t, 'B07');
  fs.writeFileSync(
    path.join(runRoot, 'workspace', 'review-output.json'),
    JSON.stringify({
      disposition: 'changes_required',
      findings: [
        {
          id: 'acceptance-mismatch',
          blocking: true,
          evidence: ['src/parser.ts']
        }
      ]
    })
  );
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
});

test('B08 derives truthful repair closure from code, append-only review history, and verification events', (t) => {
  const { runRoot } = prepare(t, 'B08');
  fs.writeFileSync(
    path.join(runRoot, 'workspace', 'src', 'parser.ts'),
    [
      'export function parseRecord(value: string): string {',
      '  const normalized = value.trim();',
      "  if (!normalized) throw new Error('record is empty');",
      '  return normalized;',
      '}',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(runRoot, 'workspace', '_flow', 'work-items', 'W001-benchmark', 'review.yaml'),
    [
      'schema_version: 2',
      'work_item: W001',
      'disposition: approved',
      'active_pass: null',
      'worker_runs: []',
      'passes:',
      '  - id: R001',
      '    scope:',
      '      kind: work_item',
      '      ref: W001',
      '    inspected:',
      '      - src/parser.ts',
      '    parecer: Empty-record handling violates acceptance.',
      '    disposition: changes_required',
      '    findings:',
      '      - id: F001',
      '        blocking: true',
      '        claim: Empty records are accepted.',
      '        evidence:',
      '          - src/parser.ts',
      '        cause: verification_gap',
      '    actions: []',
      '    resolutions: []',
      '    residual_risk: []',
      '    finalized_at: 2026-10-03T12:00:00.000Z',
      '  - id: R002',
      '    scope:',
      '      kind: work_item',
      '      ref: W001',
      '    inspected:',
      '      - src/parser.ts',
      '    parecer: F001 is repaired and acceptance verification passed.',
      '    disposition: approved',
      '    findings: []',
      '    actions: []',
      '    resolutions:',
      '      - finding: F001',
      '        state: resolved',
      '        evidence:',
      '          - src/parser.ts',
      '          - parser-acceptance',
      '    residual_risk: []',
      '    finalized_at: 2026-10-03T12:05:00.000Z',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(runRoot, 'evaluator-events.json'),
    JSON.stringify([{ sequence: 1, type: 'verification', id: 'parser-acceptance', status: 'passed' }])
  );
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
});

test('B11 accepts unavailable telemetry without inventing zero values', (t) => {
  const { runRoot } = prepare(t, 'B11');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({ telemetry: { status: 'unavailable' } }));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
  assert.deepEqual(result.telemetry, { status: 'unavailable' });
});

test('B12 initial fixture exercises canonical recovery and reconciliation routing', (t) => {
  const { runRoot } = prepare(t, 'B12');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({ telemetry: { status: 'unavailable' } }));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
  assert.deepEqual(result.telemetry, { status: 'unavailable' });
});

test('B12 detects silent state overwrite without evaluator authorization', (t) => {
  const { runRoot } = prepare(t, 'B12');
  fs.writeFileSync(
    path.join(runRoot, 'workspace', '_flow', 'state.yaml'),
    'schema_version: 3\nactive:\n  work_item: W001\n  concurrency: null\ncheckpoint: null\nmigration:\n  status: not_required\n'
  );
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, false);
  assert.equal((result.derived_facts as Record<string, unknown>).silent_state_overwrite, true);
});

test('repeated runs never overwrite an existing run directory', (t) => {
  const runs = tempRuns(t);
  const identity = {
    benchmark_id: 'B02',
    flow_revision: 'abc123',
    runtime: null,
    model: null,
    config: null,
    repeat: 1
  };
  prepareRun(repoRoot, runs, 'B02-r1', identity);
  assert.throws(() => prepareRun(repoRoot, runs, 'B02-r1', identity), /already exists|EEXIST/i);
});

test('evaluation cannot overwrite a prior result', (t) => {
  const { runRoot } = prepare(t, 'B01');
  fs.writeFileSync(path.join(runRoot, 'observation.json'), JSON.stringify({}));
  evaluateRun(repoRoot, runRoot);
  assert.throws(() => evaluateRun(repoRoot, runRoot), /already exists/);
});

test('unsafe run paths cannot escape the configured fixture workspace root', (t) => {
  const runs = tempRuns(t);
  assert.throws(
    () =>
      prepareRun(repoRoot, runs, '../escape', {
        benchmark_id: 'B01',
        flow_revision: 'abc123',
        runtime: null,
        model: null,
        config: null,
        repeat: 1
      }),
    /child/
  );
});

test('unavailable telemetry cannot be encoded as zero-valued telemetry', (t) => {
  const { runRoot } = prepare(t, 'B11');
  fs.writeFileSync(
    path.join(runRoot, 'observation.json'),
    JSON.stringify({ telemetry: { status: 'unavailable', total_tokens: 0 } })
  );
  assert.throws(() => evaluateRun(repoRoot, runRoot), /distinct from zero/);
});
