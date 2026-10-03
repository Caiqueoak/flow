import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  evaluateRun,
  prepareRun,
  validateBenchmarkDefinitions
} from '../../benchmark-harness.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');

function tempRuns(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-benchmark-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('W8 benchmark fixture and evaluator truth remain aligned', () => {
  assert.deepEqual(validateBenchmarkDefinitions(repoRoot), []);
});

test('prepare exposes agent context but keeps evaluator truth out of the fixture workspace', (t) => {
  const runs = tempRuns(t);
  const runRoot = prepareRun(repoRoot, runs, 'B01-r1', {
    benchmark_id: 'B01',
    flow_revision: 'abc123',
    runtime: 'runtime-x',
    model: 'model-y',
    config: 'cfg-z',
    repeat: 1
  });

  assert.equal(fs.existsSync(path.join(runRoot, 'workspace', 'agent-context.json')), true);
  assert.equal(fs.existsSync(path.join(runRoot, 'workspace', 'evaluator-truth.json')), false);
  assert.equal(fs.existsSync(path.join(runRoot, 'manifest.json')), true);
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

test('hard assertions evaluate deterministic observations and preserve unavailable telemetry', (t) => {
  const runs = tempRuns(t);
  const runRoot = prepareRun(repoRoot, runs, 'B12-r1', {
    benchmark_id: 'B12',
    flow_revision: 'abc123',
    runtime: null,
    model: null,
    config: null,
    repeat: 1
  });
  fs.writeFileSync(
    path.join(runRoot, 'observation.json'),
    JSON.stringify({
      facts: {
        inconsistency_detected: true,
        unsafe_actions_before_reconciliation: 0,
        silent_overwrite: false
      },
      telemetry: { status: 'unavailable' }
    })
  );

  const result = evaluateRun(repoRoot, runRoot);
  assert.equal(result.hard_pass, true);
  assert.deepEqual(result.telemetry, { status: 'unavailable' });
});

test('evaluation cannot overwrite a prior result', (t) => {
  const runs = tempRuns(t);
  const runRoot = prepareRun(repoRoot, runs, 'B01-r1', {
    benchmark_id: 'B01',
    flow_revision: 'abc123',
    runtime: null,
    model: null,
    config: null,
    repeat: 1
  });
  fs.writeFileSync(
    path.join(runRoot, 'observation.json'),
    JSON.stringify({ facts: { finalized: false, unresolved_preserved: true } })
  );
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
  const runs = tempRuns(t);
  const runRoot = prepareRun(repoRoot, runs, 'B11-r1', {
    benchmark_id: 'B11',
    flow_revision: 'abc123',
    runtime: null,
    model: null,
    config: null,
    repeat: 1
  });
  fs.writeFileSync(
    path.join(runRoot, 'observation.json'),
    JSON.stringify({
      facts: { invented_telemetry: false },
      telemetry: { status: 'unavailable', total_tokens: 0 }
    })
  );

  assert.throws(() => evaluateRun(repoRoot, runRoot), /distinct from zero/);
});
