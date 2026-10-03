import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Task } from '../../domain/task/task.js';
import { foldFindingState, parseReview, type WorkItemReviewV2 } from '../../domain/work-item/review.mjs';
import { inspectRecovery } from '../../application/recovery/recovery.mjs';
import { routeProject } from '../../application/route/operations/route.mjs';
import { loadExecutionState } from '../persistence/execution-state.mjs';
import { loadWorkItems } from '../persistence/work-items.mjs';

type EvaluatorEvent = {
  sequence: number;
  type: string;
  task?: string;
  id?: string;
  status?: string;
};

export function validatePreparedFixture(workspace: string, benchmarkId: string): string[] {
  const issues: string[] = [];
  let items: ReturnType<typeof loadWorkItems>;
  try {
    loadExecutionState(workspace);
    items = loadWorkItems(workspace);
  } catch (error) {
    return [errorMessage(error)];
  }

  const recovery = inspectRecovery(workspace);
  const route = routeProject(workspace);

  if (benchmarkId === 'B01' || benchmarkId === 'B02') {
    if (recovery.classification !== 'resumable' || recovery.checkpoint?.phase !== 'discovery')
      issues.push('discovery fixture must be resumable through canonical recovery.');
    if (route.phase !== 'discovery') issues.push('discovery fixture must route through discovery.');
  }

  if (['B05', 'B07', 'B08', 'B12'].includes(benchmarkId)) {
    const item = items.find((candidate) => candidate.id === 'W001');
    if (!item) issues.push('fixture must contain canonical W001 work-item artifacts.');
    if (benchmarkId === 'B05' && item?.tasks.tasks.length !== 4)
      issues.push('B05 must contain all four canonical task fixtures.');
  }

  if (benchmarkId === 'B12') {
    if (recovery.classification !== 'requires_reconciliation') issues.push('B12 must require reconciliation.');
    if (route.phase !== 'reconcile' || route.reason !== 'recovery_conflict')
      issues.push('B12 must route through canonical reconciliation.');
  }

  return issues;
}

export function workspaceBaselineHashes(workspace: string, paths: string[]): Record<string, string> {
  return Object.fromEntries(
    paths.map((relativePath) => [normalize(relativePath), hashFile(path.join(workspace, relativePath))])
  );
}

export function deriveEvaluatorFacts({
  repoRoot,
  runRoot,
  benchmarkId,
  seededTruth,
  baselineHashes,
  telemetry
}: {
  repoRoot: string;
  runRoot: string;
  benchmarkId: string;
  seededTruth: Record<string, unknown>;
  baselineHashes: Record<string, string>;
  telemetry: unknown;
}): Record<string, unknown> {
  const workspace = path.join(runRoot, 'workspace');

  if (benchmarkId === 'B01') {
    const state = loadExecutionState(workspace);
    const route = routeProject(workspace);
    return {
      checkpoint_active_with_unresolved:
        state.checkpoint?.status === 'active' &&
        state.checkpoint.dimensions.some((dimension) => dimension.state === 'unresolved') &&
        state.checkpoint.next_frontier.length > 0,
      route_resumes_discovery: route.phase === 'discovery' && route.instruction === 'discovery/step-01-project.md'
    };
  }

  if (benchmarkId === 'B02') {
    const state = loadExecutionState(workspace);
    const route = routeProject(workspace);
    const expected = Array.isArray(seededTruth.expected_frontier) ? seededTruth.expected_frontier : [];
    return {
      expected_frontier_preserved:
        state.checkpoint !== null && JSON.stringify(state.checkpoint.next_frontier) === JSON.stringify(expected),
      route_resumes_discovery: route.phase === 'discovery' && route.instruction === 'discovery/step-01-project.md'
    };
  }

  if (benchmarkId === 'B05') {
    const events = readEvaluatorEvents(runRoot);
    return {
      event_log_complete: events !== null && writerEventsComplete(events),
      conflicting_writers_overlapped: events === null ? true : conflictingWritersOverlapped(workspace, events)
    };
  }

  if (benchmarkId === 'B06') {
    const handoff = readOptionalJson(path.join(workspace, 'handoff.json'));
    return {
      seeded_constraint_referenced:
        handoff !== null && jsonContainsString(handoff, seededString(seededTruth, 'required_reference', benchmarkId))
    };
  }

  if (benchmarkId === 'B07') {
    const defectFile = seededString(seededTruth, 'defect_file', benchmarkId);
    const defectPresent = readWorkspaceFile(workspace, defectFile).includes(
      seededString(seededTruth, 'defect_fragment', benchmarkId)
    );
    const output = readOptionalJson(path.join(workspace, 'review-output.json'));
    const findings = isRecord(output) && Array.isArray(output.findings) ? output.findings : [];
    const findingId = seededString(seededTruth, 'finding_id', benchmarkId);
    const blockerReported = findings.some(
      (finding) =>
        isRecord(finding) &&
        finding.id === findingId &&
        finding.blocking === true &&
        Array.isArray(finding.evidence) &&
        finding.evidence.includes(defectFile)
    );
    return {
      seeded_blocker_present_in_repository: defectPresent,
      seeded_blocker_reported: defectPresent && blockerReported,
      approved_with_seeded_blocker: defectPresent && isRecord(output) && output.disposition === 'approved'
    };
  }

  if (benchmarkId === 'B08') {
    const defectFile = seededString(seededTruth, 'defect_file', benchmarkId);
    const findingId = seededString(seededTruth, 'finding_id', benchmarkId);
    const passId = seededString(seededTruth, 'original_pass_id', benchmarkId);
    const item = loadWorkItems(workspace).find((candidate) => candidate.id === 'W001');
    const review = item?.review;
    const v2 = review?.schema_version === 2 ? (review as WorkItemReviewV2) : null;
    const currentPass = v2?.passes.find((pass) => pass.id === passId);
    const fixtureReview = loadFixtureReview(repoRoot, benchmarkId);
    const baselinePass =
      fixtureReview?.schema_version === 2 ? fixtureReview.passes.find((pass) => pass.id === passId) : undefined;
    const folded = v2 ? foldFindingState(v2).get(findingId) : undefined;
    const events = readEvaluatorEvents(runRoot);
    return {
      seeded_defect_removed: !readWorkspaceFile(workspace, defectFile).includes(
        seededString(seededTruth, 'defect_fragment', benchmarkId)
      ),
      review_history_preserved:
        Boolean(currentPass && baselinePass) && JSON.stringify(currentPass) === JSON.stringify(baselinePass),
      blocking_finding_closed: Boolean(
        folded && !['open', 'reopened'].includes(folded.state) && v2 && v2.passes.length > 1
      ),
      acceptance_verification_passed: Boolean(
        events?.some(
          (event) =>
            event.type === 'verification' &&
            event.id === seededString(seededTruth, 'verification_id', benchmarkId) &&
            event.status === 'passed'
        )
      )
    };
  }

  if (benchmarkId === 'B11') return { telemetry_contract_valid: telemetry !== null };

  if (benchmarkId === 'B12') {
    const recovery = inspectRecovery(workspace);
    const route = routeProject(workspace);
    const baseline = baselineHashes['_flow/state.yaml'];
    const current = hashFile(path.join(workspace, '_flow', 'state.yaml'));
    const authorized = (readEvaluatorEvents(runRoot) ?? []).some((event) => event.type === 'reconciliation_authorized');
    return {
      reconciliation_required: recovery.classification === 'requires_reconciliation',
      route_requires_reconciliation: route.phase === 'reconcile' && route.reason === 'recovery_conflict',
      silent_state_overwrite: Boolean(baseline && baseline !== current && !authorized)
    };
  }

  throw new Error(`Unsupported benchmark evaluator: ${benchmarkId}`);
}

function loadFixtureReview(repoRoot: string, benchmarkId: string) {
  const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'benchmarks', 'fixtures.json'), 'utf8')) as {
    benchmarks: Array<{ id: string; workspace_files?: Record<string, string> }>;
  };
  const text = fixtures.benchmarks.find((item) => item.id === benchmarkId)?.workspace_files?.[
    '_flow/work-items/W001-benchmark/review.yaml'
  ];
  return typeof text === 'string' ? parseReview(text, { expectedWorkItem: 'W001' }) : null;
}

function readEvaluatorEvents(runRoot: string): EvaluatorEvent[] | null {
  const file = path.join(runRoot, 'evaluator-events.json');
  if (!fs.existsSync(file)) return null;
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw new Error('evaluator-events.json must be an array.');
  const events = value.map((event, index) => {
    if (!isRecord(event)) throw new Error(`evaluator-events.json[${index}] must be an object.`);
    if (!Number.isInteger(event.sequence) || (event.sequence as number) < 1)
      throw new Error(`evaluator-events.json[${index}].sequence must be a positive integer.`);
    if (typeof event.type !== 'string' || !event.type)
      throw new Error(`evaluator-events.json[${index}].type must be non-empty.`);
    return event as EvaluatorEvent;
  });
  if (new Set(events.map((event) => event.sequence)).size !== events.length)
    throw new Error('evaluator-events.json sequence values must be unique.');
  return [...events].sort((a, b) => a.sequence - b.sequence);
}

function writerEventsComplete(events: EvaluatorEvent[]): boolean {
  const active = new Set<string>();
  const started = new Set<string>();
  for (const event of events) {
    if (event.type === 'writer_start') {
      if (!event.task || active.has(event.task)) return false;
      active.add(event.task);
      started.add(event.task);
    } else if (event.type === 'writer_finish') {
      if (!event.task || !active.delete(event.task)) return false;
    }
  }
  return active.size === 0 && started.has('W001-T003') && started.has('W001-T004');
}

function conflictingWritersOverlapped(workspace: string, events: EvaluatorEvent[]): boolean {
  const tasks = new Map<string, Task>(
    loadWorkItems(workspace).flatMap((item) => item.tasks.tasks.map((task) => [`${item.id}-${task.id}`, task]))
  );
  const active = new Set<string>();
  for (const event of events) {
    if (event.type === 'writer_finish' && event.task) {
      active.delete(event.task);
      continue;
    }
    if (event.type !== 'writer_start' || !event.task) continue;
    const next = tasks.get(event.task);
    if (!next) return true;
    for (const activeId of active) {
      const current = tasks.get(activeId);
      if (!current || mutationsConflict(current.mutation, next.mutation)) return true;
    }
    active.add(event.task);
  }
  return false;
}

function mutationsConflict(
  left: { surfaces?: string[]; resources?: string[] } | undefined,
  right: { surfaces?: string[]; resources?: string[] } | undefined
): boolean {
  if (!left || !right) return true;
  const resources = new Set(left.resources ?? []);
  if ((right.resources ?? []).some((resource) => resources.has(resource))) return true;
  return (left.surfaces ?? []).some((a) =>
    (right.surfaces ?? []).some((b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`))
  );
}

function readOptionalJson(file: string): unknown | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as unknown) : null;
}

function readWorkspaceFile(workspace: string, relativePath: string): string {
  const file = path.resolve(workspace, relativePath);
  const relative = path.relative(workspace, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Evidence path escapes workspace.');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function hashFile(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function jsonContainsString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value.includes(expected);
  if (Array.isArray(value)) return value.some((entry) => jsonContainsString(entry, expected));
  if (isRecord(value)) return Object.values(value).some((entry) => jsonContainsString(entry, expected));
  return false;
}

function seededString(seed: Record<string, unknown>, key: string, benchmarkId: string): string {
  const value = seed[key];
  if (typeof value !== 'string' || !value) throw new Error(`${benchmarkId} seeded_truth.${key} must be a string.`);
  return value;
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
