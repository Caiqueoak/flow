import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { foldFindingState, parseReview, reviewReadyForCompletion } from '../../../../domain/work-item/review.mjs';
import { checkpointReviewPass, finalizeReviewPass } from '../../operations/review-history.mjs';

function tempReview(t: test.TestContext, initial: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-w5-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'review.yaml');
  fs.writeFileSync(file, stringify(initial));
  return file;
}

const pending = () => ({
  schema_version: 2,
  work_item: 'W001',
  disposition: 'pending',
  active_pass: null,
  worker_runs: [],
  passes: []
});

test('interrupted active pass resumes and finalization appends then clears active_pass', (t) => {
  const file = tempReview(t, pending());
  checkpointReviewPass(file, 'W001', {
    pass: { id: 'R001', scope: { kind: 'work_item', ref: 'W001' }, parecer: 'In progress.' }
  });
  const resumed = parseReview(fs.readFileSync(file, 'utf8'), { expectedWorkItem: 'W001' });
  assert.equal(resumed.schema_version, 2);
  assert.equal(resumed.schema_version === 2 ? resumed.active_pass?.id : null, 'R001');

  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R001',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: ['src/a.ts'],
      parecer: 'Clean.',
      disposition: 'approved',
      findings: [],
      actions: [],
      resolutions: [],
      residual_risk: []
    },
    worker_runs: [{ id: 'E001', runtime: 'codex', context_mode: 'fresh' }]
  });
  const finalized = finalizeReviewPass(file, 'W001', '2026-10-03T17:00:00Z');
  assert.equal(finalized.active_pass, null);
  assert.equal(finalized.passes[0]?.id, 'R001');
  assert.equal(reviewReadyForCompletion(finalized), true);
});

test('finalized passes cannot be rewritten', (t) => {
  const file = tempReview(t, pending());
  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R001',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: [],
      parecer: 'Clean.',
      disposition: 'approved',
      findings: [],
      actions: [],
      resolutions: [],
      residual_risk: []
    }
  });
  finalizeReviewPass(file, 'W001', '2026-10-03T17:00:00Z');
  assert.throws(
    () => checkpointReviewPass(file, 'W001', { pass: { id: 'R001', scope: { kind: 'work_item', ref: 'W001' } } }),
    /immutable/
  );
});

test('repair resolution preserves stable finding ID and link', (t) => {
  const file = tempReview(t, pending());
  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R001',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: ['src/a.ts'],
      parecer: 'Repair required.',
      disposition: 'changes_required',
      findings: [
        { id: 'F001', blocking: true, claim: 'Missing guard.', evidence: ['src/a.ts'], cause: 'worker_quality' }
      ],
      actions: [{ type: 'repair_task_created', finding: 'F001', task: 'W001-T002' }],
      resolutions: [],
      residual_risk: []
    }
  });
  finalizeReviewPass(file, 'W001', '2026-10-03T17:00:00Z');
  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R002',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: ['W001-T002'],
      parecer: 'Repair verified.',
      disposition: 'approved',
      findings: [],
      actions: [],
      resolutions: [{ finding: 'F001', state: 'resolved', evidence: ['W001-T002'], task: 'W001-T002' }],
      residual_risk: []
    }
  });
  const final = finalizeReviewPass(file, 'W001', '2026-10-03T18:00:00Z');
  assert.equal(final.passes[0]?.findings[0]?.id, 'F001');
  assert.equal(final.passes[1]?.resolutions[0]?.finding, 'F001');
  assert.equal(foldFindingState(final).get('F001')?.state, 'resolved');
});

test('open or reopened blocking finding prevents final approval', (t) => {
  const file = tempReview(t, pending());
  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R001',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: [],
      parecer: 'Repair required.',
      disposition: 'changes_required',
      findings: [{ id: 'F001', blocking: true, claim: 'Defect.', evidence: ['src/a.ts'], cause: 'verification_gap' }],
      actions: [],
      resolutions: [],
      residual_risk: []
    }
  });
  finalizeReviewPass(file, 'W001', '2026-10-03T17:00:00Z');
  checkpointReviewPass(file, 'W001', {
    pass: {
      id: 'R002',
      scope: { kind: 'work_item', ref: 'W001' },
      inspected: [],
      parecer: 'Still open.',
      disposition: 'approved',
      findings: [],
      actions: [],
      resolutions: [{ finding: 'F001', state: 'reopened', evidence: ['src/a.ts'] }],
      residual_risk: []
    }
  });
  assert.throws(() => finalizeReviewPass(file, 'W001', '2026-10-03T18:00:00Z'), /unresolved blocking findings/);
});

test('legacy completed review remains valid without invented findings', () => {
  const legacy = parseReview(
    stringify({
      schema_version: 1,
      work_item: 'W001',
      status: 'approved',
      reviewed_at: '2026-10-01T10:00:00Z'
    })
  );
  assert.equal(legacy.schema_version, 1);
  assert.equal(reviewReadyForCompletion(legacy), true);
});

test('superseded and accepted residual risk close blocking findings in folded state', (t) => {
  for (const state of ['superseded', 'accepted_residual_risk'] as const) {
    const file = tempReview(t, pending());
    checkpointReviewPass(file, 'W001', {
      pass: {
        id: 'R001',
        scope: { kind: 'work_item', ref: 'W001' },
        inspected: ['src/a.ts'],
        parecer: 'Finding raised.',
        disposition: 'changes_required',
        findings: [{ id: 'F001', blocking: true, claim: 'Concern.', evidence: ['src/a.ts'], cause: 'worker_quality' }],
        actions: [],
        resolutions: [],
        residual_risk: []
      }
    });
    finalizeReviewPass(file, 'W001', '2026-10-03T17:00:00Z');
    checkpointReviewPass(file, 'W001', {
      pass: {
        id: 'R002',
        scope: { kind: 'work_item', ref: 'W001' },
        inspected: ['src/a.ts'],
        parecer: 'Follow-up complete.',
        disposition: 'approved',
        findings: [],
        actions: [],
        resolutions: [{ finding: 'F001', state, evidence: ['src/a.ts'] }],
        residual_risk: state === 'accepted_residual_risk' ? ['Bounded known risk remains.'] : []
      }
    });
    const final = finalizeReviewPass(file, 'W001', '2026-10-03T18:00:00Z');
    assert.equal(foldFindingState(final).get('F001')?.state, state);
    assert.equal(reviewReadyForCompletion(final), true);
  }
});

test('malformed or inconsistent history is rejected', () => {
  assert.throws(
    () =>
      parseReview(
        stringify({
          schema_version: 2,
          work_item: 'W001',
          disposition: 'approved',
          active_pass: null,
          worker_runs: [],
          passes: [
            {
              id: 'R001',
              scope: { kind: 'work_item', ref: 'W001' },
              inspected: [],
              parecer: 'Invalid.',
              disposition: 'approved',
              findings: [
                { id: 'F001', blocking: true, claim: 'Still open.', evidence: ['src/a.ts'], cause: 'verification_gap' }
              ],
              actions: [],
              resolutions: [],
              residual_risk: [],
              finalized_at: '2026-10-03T17:00:00Z'
            }
          ]
        })
      ),
    /unresolved blocking findings/
  );
});

test('inconsistent active pass is rejected before interruption recovery can resume it', () => {
  assert.throws(
    () =>
      parseReview(
        stringify({
          schema_version: 2,
          work_item: 'W001',
          disposition: 'changes_required',
          active_pass: {
            id: 'R002',
            scope: { kind: 'work_item', ref: 'W001' },
            resolutions: [{ finding: 'F999', state: 'resolved', evidence: ['src/a.ts'] }]
          },
          worker_runs: [],
          passes: [
            {
              id: 'R001',
              scope: { kind: 'work_item', ref: 'W001' },
              inspected: ['src/a.ts'],
              parecer: 'Repair required.',
              disposition: 'changes_required',
              findings: [
                { id: 'F001', blocking: true, claim: 'Known defect.', evidence: ['src/a.ts'], cause: 'worker_quality' }
              ],
              actions: [],
              resolutions: [],
              residual_risk: [],
              finalized_at: '2026-10-03T17:00:00Z'
            }
          ]
        })
      ),
    /active_pass resolves unknown or same-pass finding 'F999'/
  );
});
