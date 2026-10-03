import { parseDocument, stringify } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';
import { REVIEW_SCHEMA_VERSION, WORK_ITEM_ID, type WorkItemId } from './work-item.js';

export const REVIEW_PASS_DISPOSITIONS = ['approved', 'changes_required', 'blocked'] as const;
export const REVIEW_FINDING_STATES = ['open', 'resolved', 'reopened', 'superseded', 'accepted_residual_risk'] as const;
export const REVIEW_FINDING_CAUSES = [
  'missing_context',
  'worker_quality',
  'integration_conflict',
  'scope_leak',
  'verification_gap',
  'orchestration_error'
] as const;

export type ReviewPassDisposition = (typeof REVIEW_PASS_DISPOSITIONS)[number];
export type ReviewFindingState = (typeof REVIEW_FINDING_STATES)[number];
export type ReviewFindingCause = (typeof REVIEW_FINDING_CAUSES)[number];

export interface LegacyWorkItemReview {
  schema_version: 1;
  work_item: WorkItemId;
  status: 'pending' | 'approved';
  reviewed_at?: string;
}

export interface ReviewFinding {
  id: string;
  blocking: boolean;
  claim: string;
  evidence: string[];
  cause: ReviewFindingCause;
}

export interface ReviewAction {
  type: 'repair_task_created' | 'repair_task_reopened';
  finding: string;
  task: string;
}

export interface ReviewResolution {
  finding: string;
  state: Exclude<ReviewFindingState, 'open'>;
  evidence: string[];
  task?: string;
  note?: string;
}

export interface ReviewPassScope {
  kind: 'work_item' | 'task';
  ref: string;
}

export interface ReviewPass {
  id: string;
  scope: ReviewPassScope;
  inspected: string[];
  parecer: string;
  disposition: ReviewPassDisposition;
  findings: ReviewFinding[];
  actions: ReviewAction[];
  resolutions: ReviewResolution[];
  residual_risk: string[];
  finalized_at: string;
}

export interface ActiveReviewPass {
  id: string;
  scope: ReviewPassScope;
  inspected?: string[];
  parecer?: string;
  disposition?: ReviewPassDisposition;
  findings?: ReviewFinding[];
  actions?: ReviewAction[];
  resolutions?: ReviewResolution[];
  residual_risk?: string[];
}

export interface WorkerRunEvidence {
  id: string;
  task?: string;
  runtime?: string;
  runtime_version?: string;
  surface?: string;
  model?: string;
  effort?: string;
  context_mode?: string;
  workspace_isolation?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface WorkItemReviewV2 {
  schema_version: 2;
  work_item: WorkItemId;
  disposition: 'pending' | ReviewPassDisposition;
  active_pass: ActiveReviewPass | null;
  worker_runs: WorkerRunEvidence[];
  passes: ReviewPass[];
}

export type SerializedWorkItemReview = LegacyWorkItemReview | WorkItemReviewV2;

export interface FoldedFinding {
  finding: ReviewFinding;
  state: ReviewFindingState;
  resolution?: ReviewResolution;
}

export function parseReview(
  text: string,
  { expectedWorkItem = null, source = 'review.yaml' }: { expectedWorkItem?: string | null; source?: string } = {}
): SerializedWorkItemReview {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${doc.errors[0]?.message ?? 'unknown YAML error'}`);
  const value: unknown = doc.toJS();
  if (!isRecord(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);

  if (value.schema_version === 1) return parseLegacyReview(value, expectedWorkItem, source);
  if (value.schema_version !== REVIEW_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be 1 or ${REVIEW_SCHEMA_VERSION}.`);

  const workItem = parseWorkItem(value.work_item, expectedWorkItem, source);
  const review: WorkItemReviewV2 = {
    schema_version: REVIEW_SCHEMA_VERSION,
    work_item: workItem,
    disposition: parseTopLevelDisposition(value.disposition, source),
    active_pass:
      value.active_pass === null ? null : parseActivePass(value.active_pass, `${source}.active_pass`, workItem),
    worker_runs: parseWorkerRuns(value.worker_runs, `${source}.worker_runs`, workItem),
    passes: parsePasses(value.passes, `${source}.passes`, workItem)
  };
  validateReviewHistory(review, source);
  return review;
}

export const stringifyReview = (value: SerializedWorkItemReview): string =>
  stringify(parseReview(stringify(value)), { lineWidth: 0 });

export function isReviewApproved(review: SerializedWorkItemReview): boolean {
  return review.schema_version === 1 ? review.status === 'approved' : review.disposition === 'approved';
}

export function upgradePendingLegacyReview(review: SerializedWorkItemReview): WorkItemReviewV2 {
  if (review.schema_version === 2) return review;
  if (review.status === 'approved')
    throw new ArtifactValidationError('Approved legacy review history is immutable and cannot be upgraded in place.');
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    work_item: review.work_item,
    disposition: 'pending',
    active_pass: null,
    worker_runs: [],
    passes: []
  };
}

export function foldFindingState(review: WorkItemReviewV2): Map<string, FoldedFinding> {
  const folded = new Map<string, FoldedFinding>();
  for (const pass of review.passes) {
    for (const finding of pass.findings) folded.set(finding.id, { finding, state: 'open' });
    for (const resolution of pass.resolutions) {
      const current = folded.get(resolution.finding);
      if (current) folded.set(resolution.finding, { finding: current.finding, state: resolution.state, resolution });
    }
  }
  return folded;
}

export function unresolvedBlockingFindings(review: WorkItemReviewV2): FoldedFinding[] {
  return [...foldFindingState(review).values()].filter(
    ({ finding, state }) => finding.blocking && (state === 'open' || state === 'reopened')
  );
}

export function reviewReadyForCompletion(review: SerializedWorkItemReview): boolean {
  if (review.schema_version === 1) return review.status === 'approved';
  return (
    review.active_pass === null && review.disposition === 'approved' && unresolvedBlockingFindings(review).length === 0
  );
}

export function completeActivePass(activePass: ActiveReviewPass, finalizedAt: string): ReviewPass {
  const source = 'review.yaml.active_pass';
  if (!activePass.inspected) throw new ArtifactValidationError(`${source}.inspected is required before finalization.`);
  if (!activePass.parecer) throw new ArtifactValidationError(`${source}.parecer is required before finalization.`);
  if (!activePass.disposition)
    throw new ArtifactValidationError(`${source}.disposition is required before finalization.`);
  if (!activePass.findings) throw new ArtifactValidationError(`${source}.findings is required before finalization.`);
  if (!activePass.actions) throw new ArtifactValidationError(`${source}.actions is required before finalization.`);
  if (!activePass.resolutions)
    throw new ArtifactValidationError(`${source}.resolutions is required before finalization.`);
  if (!activePass.residual_risk)
    throw new ArtifactValidationError(`${source}.residual_risk is required before finalization.`);
  assertIso(finalizedAt, `${source}.finalized_at`);
  return { ...activePass, finalized_at: finalizedAt } as ReviewPass;
}

function parseLegacyReview(
  value: Record<string, unknown>,
  expectedWorkItem: string | null,
  source: string
): LegacyWorkItemReview {
  const workItem = parseWorkItem(value.work_item, expectedWorkItem, source);
  if (typeof value.status !== 'string' || !['pending', 'approved'].includes(value.status))
    throw new ArtifactValidationError(`${source}.status must be pending or approved.`);
  if (
    value.reviewed_at !== undefined &&
    (typeof value.reviewed_at !== 'string' || Number.isNaN(Date.parse(value.reviewed_at)))
  )
    throw new ArtifactValidationError(`${source}.reviewed_at must be ISO.`);
  return {
    schema_version: 1,
    work_item: workItem,
    status: value.status as 'pending' | 'approved',
    ...(typeof value.reviewed_at === 'string' && value.reviewed_at ? { reviewed_at: value.reviewed_at } : {})
  };
}

function parseWorkItem(value: unknown, expectedWorkItem: string | null, source: string): WorkItemId {
  if (
    typeof value !== 'string' ||
    !WORK_ITEM_ID.test(value) ||
    (expectedWorkItem !== null && value !== expectedWorkItem)
  )
    throw new ArtifactValidationError(`${source} has an invalid work_item.`);
  return value as WorkItemId;
}

function parseTopLevelDisposition(value: unknown, source: string): WorkItemReviewV2['disposition'] {
  if (typeof value !== 'string' || !['pending', ...REVIEW_PASS_DISPOSITIONS].includes(value as ReviewPassDisposition))
    throw new ArtifactValidationError(`${source}.disposition must be pending, approved, changes_required, or blocked.`);
  return value as WorkItemReviewV2['disposition'];
}

function parsePasses(value: unknown, source: string, workItem: WorkItemId): ReviewPass[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  return value.map((pass, index) => parseFinalizedPass(pass, `${source}[${index}]`, workItem));
}

function parseFinalizedPass(value: unknown, source: string, workItem: WorkItemId): ReviewPass {
  const active = parseActivePass(value, source, workItem);
  const finalizedAt = isRecord(value) ? value.finalized_at : undefined;
  if (typeof finalizedAt !== 'string') throw new ArtifactValidationError(`${source}.finalized_at is required.`);
  assertIso(finalizedAt, `${source}.finalized_at`);
  return completeActivePass(active, finalizedAt);
}

function parseActivePass(value: unknown, source: string, workItem: WorkItemId): ActiveReviewPass {
  const item = record(value, source);
  const id = nonEmptyString(item.id, `${source}.id`);
  if (!/^R\d{3,}$/.test(id)) throw new ArtifactValidationError(`${source}.id must match R###.`);
  const scope = parseScope(item.scope, `${source}.scope`, workItem);
  return {
    id,
    scope,
    ...(item.inspected !== undefined ? { inspected: stringArray(item.inspected, `${source}.inspected`) } : {}),
    ...(item.parecer !== undefined ? { parecer: nonEmptyString(item.parecer, `${source}.parecer`) } : {}),
    ...(item.disposition !== undefined
      ? { disposition: passDisposition(item.disposition, `${source}.disposition`) }
      : {}),
    ...(item.findings !== undefined ? { findings: parseFindings(item.findings, `${source}.findings`) } : {}),
    ...(item.actions !== undefined ? { actions: parseActions(item.actions, `${source}.actions`) } : {}),
    ...(item.resolutions !== undefined
      ? { resolutions: parseResolutions(item.resolutions, `${source}.resolutions`) }
      : {}),
    ...(item.residual_risk !== undefined
      ? { residual_risk: stringArray(item.residual_risk, `${source}.residual_risk`) }
      : {})
  };
}

function parseScope(value: unknown, source: string, workItem: WorkItemId): ReviewPassScope {
  const item = record(value, source);
  if (item.kind !== 'work_item' && item.kind !== 'task')
    throw new ArtifactValidationError(`${source}.kind must be work_item or task.`);
  const ref = nonEmptyString(item.ref, `${source}.ref`);
  if (item.kind === 'work_item' && ref !== workItem)
    throw new ArtifactValidationError(`${source}.ref must match ${workItem}.`);
  if (item.kind === 'task' && !new RegExp(`^${workItem}-T\\d{3,}$`).test(ref))
    throw new ArtifactValidationError(`${source}.ref must reference a task in ${workItem}.`);
  return { kind: item.kind, ref };
}

function parseFindings(value: unknown, source: string): ReviewFinding[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  return value.map((entry, index) => {
    const item = record(entry, `${source}[${index}]`);
    const id = nonEmptyString(item.id, `${source}[${index}].id`);
    if (!/^F\d{3,}$/.test(id)) throw new ArtifactValidationError(`${source}[${index}].id must match F###.`);
    if (typeof item.blocking !== 'boolean')
      throw new ArtifactValidationError(`${source}[${index}].blocking must be boolean.`);
    const cause = nonEmptyString(item.cause, `${source}[${index}].cause`);
    if (!REVIEW_FINDING_CAUSES.includes(cause as ReviewFindingCause))
      throw new ArtifactValidationError(
        `${source}[${index}].cause must be one of ${REVIEW_FINDING_CAUSES.join(', ')}.`
      );
    return {
      id,
      blocking: item.blocking,
      claim: nonEmptyString(item.claim, `${source}[${index}].claim`),
      evidence: stringArray(item.evidence, `${source}[${index}].evidence`),
      cause: cause as ReviewFindingCause
    };
  });
}

function parseActions(value: unknown, source: string): ReviewAction[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  return value.map((entry, index) => {
    const item = record(entry, `${source}[${index}]`);
    if (item.type !== 'repair_task_created' && item.type !== 'repair_task_reopened')
      throw new ArtifactValidationError(
        `${source}[${index}].type must be repair_task_created or repair_task_reopened.`
      );
    const task = nonEmptyString(item.task, `${source}[${index}].task`);
    if (!/^W\d{3,}-T\d{3,}$/.test(task))
      throw new ArtifactValidationError(`${source}[${index}].task must match W###-T###.`);
    return { type: item.type, finding: nonEmptyString(item.finding, `${source}[${index}].finding`), task };
  });
}

function parseResolutions(value: unknown, source: string): ReviewResolution[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  return value.map((entry, index) => {
    const item = record(entry, `${source}[${index}]`);
    const state = nonEmptyString(item.state, `${source}[${index}].state`);
    if (!REVIEW_FINDING_STATES.includes(state as ReviewFindingState) || state === 'open')
      throw new ArtifactValidationError(
        `${source}[${index}].state must be resolved, reopened, superseded, or accepted_residual_risk.`
      );
    const task = optionalString(item.task, `${source}[${index}].task`);
    if (task && !/^W\d{3,}-T\d{3,}$/.test(task))
      throw new ArtifactValidationError(`${source}[${index}].task must match W###-T###.`);
    return {
      finding: nonEmptyString(item.finding, `${source}[${index}].finding`),
      state: state as Exclude<ReviewFindingState, 'open'>,
      evidence: stringArray(item.evidence, `${source}[${index}].evidence`),
      ...(task ? { task } : {}),
      ...(item.note !== undefined ? { note: nonEmptyString(item.note, `${source}[${index}].note`) } : {})
    };
  });
}

function parseWorkerRuns(value: unknown, source: string, workItem: WorkItemId): WorkerRunEvidence[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const item = record(entry, `${source}[${index}]`);
    const id = nonEmptyString(item.id, `${source}[${index}].id`);
    if (!/^E\d{3,}$/.test(id)) throw new ArtifactValidationError(`${source}[${index}].id must match E###.`);
    if (ids.has(id)) throw new ArtifactValidationError(`${source} contains duplicate worker run '${id}'.`);
    ids.add(id);
    const task = optionalString(item.task, `${source}[${index}].task`);
    if (task && !new RegExp(`^${workItem}-T\\d{3,}$`).test(task))
      throw new ArtifactValidationError(`${source}[${index}].task must reference a task in ${workItem}.`);
    const usage = item.usage === undefined ? undefined : parseUsage(item.usage, `${source}[${index}].usage`);
    return {
      id,
      ...(task ? { task } : {}),
      ...optionalFields(item, source, index, [
        'runtime',
        'runtime_version',
        'surface',
        'model',
        'effort',
        'context_mode',
        'workspace_isolation'
      ]),
      ...(usage ? { usage } : {})
    };
  });
}

function parseUsage(value: unknown, source: string): WorkerRunEvidence['usage'] {
  const item = record(value, source);
  const usage: NonNullable<WorkerRunEvidence['usage']> = {};
  for (const fieldName of ['input_tokens', 'output_tokens'] as const) {
    const count = item[fieldName];
    if (count === undefined) continue;
    if (!Number.isInteger(count) || (count as number) < 0)
      throw new ArtifactValidationError(`${source}.${fieldName} must be a non-negative integer when known.`);
    usage[fieldName] = count as number;
  }
  if (!Object.keys(usage).length)
    throw new ArtifactValidationError(`${source} must contain known usage telemetry or be omitted.`);
  return usage;
}

function optionalFields(
  item: Record<string, unknown>,
  source: string,
  index: number,
  names: readonly string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names)
    if (item[name] !== undefined) result[name] = nonEmptyString(item[name], `${source}[${index}].${name}`);
  return result;
}

function validateReviewHistory(review: WorkItemReviewV2, source: string): void {
  const passIds = new Set<string>();
  const findings = new Map<string, ReviewFinding>();
  const origins = new Map<string, string>();

  for (const pass of review.passes) {
    if (passIds.has(pass.id)) throw new ArtifactValidationError(`${source} contains duplicate pass '${pass.id}'.`);
    passIds.add(pass.id);

    const resolutions = new Set<string>();
    for (const resolution of pass.resolutions) {
      if (!findings.has(resolution.finding))
        throw new ArtifactValidationError(
          `${source} pass ${pass.id} resolves unknown or same-pass finding '${resolution.finding}'.`
        );
      if (resolutions.has(resolution.finding))
        throw new ArtifactValidationError(
          `${source} pass ${pass.id} contains multiple resolutions for '${resolution.finding}'.`
        );
      resolutions.add(resolution.finding);
    }

    for (const finding of pass.findings) {
      if (findings.has(finding.id))
        throw new ArtifactValidationError(
          `${source} finding '${finding.id}' was already introduced by ${origins.get(finding.id)}.`
        );
      findings.set(finding.id, finding);
      origins.set(finding.id, pass.id);
    }

    for (const action of pass.actions) {
      if (!findings.has(action.finding))
        throw new ArtifactValidationError(
          `${source} pass ${pass.id} action references unknown finding '${action.finding}'.`
        );
      if (!action.task.startsWith(`${review.work_item}-`))
        throw new ArtifactValidationError(
          `${source} pass ${pass.id} repair task '${action.task}' belongs to another work item.`
        );
    }
  }

  if (review.active_pass) {
    if (passIds.has(review.active_pass.id))
      throw new ArtifactValidationError(
        `${source}.active_pass '${review.active_pass.id}' collides with finalized pass history.`
      );

    const activeFindings = new Set<string>();
    for (const finding of review.active_pass.findings ?? []) {
      if (findings.has(finding.id) || activeFindings.has(finding.id))
        throw new ArtifactValidationError(
          `${source}.active_pass finding '${finding.id}' already exists in review history.`
        );
      activeFindings.add(finding.id);
    }

    const activeResolutions = new Set<string>();
    for (const resolution of review.active_pass.resolutions ?? []) {
      if (!findings.has(resolution.finding))
        throw new ArtifactValidationError(
          `${source}.active_pass resolves unknown or same-pass finding '${resolution.finding}'.`
        );
      if (activeResolutions.has(resolution.finding))
        throw new ArtifactValidationError(
          `${source}.active_pass contains multiple resolutions for '${resolution.finding}'.`
        );
      activeResolutions.add(resolution.finding);
    }

    for (const action of review.active_pass.actions ?? []) {
      if (!findings.has(action.finding) && !activeFindings.has(action.finding))
        throw new ArtifactValidationError(
          `${source}.active_pass action references unknown finding '${action.finding}'.`
        );
      if (!action.task.startsWith(`${review.work_item}-`))
        throw new ArtifactValidationError(
          `${source}.active_pass repair task '${action.task}' belongs to another work item.`
        );
    }
  }

  const expectedDisposition = review.passes.at(-1)?.disposition ?? 'pending';
  if (review.disposition !== expectedDisposition)
    throw new ArtifactValidationError(
      `${source}.disposition must equal the latest finalized pass disposition '${expectedDisposition}'.`
    );

  if (review.disposition === 'approved') {
    const unresolved = unresolvedBlockingFindings(review);
    if (unresolved.length)
      throw new ArtifactValidationError(
        `${source} cannot be approved with unresolved blocking findings: ${unresolved.map(({ finding }) => finding.id).join(', ')}.`
      );
  }
}

function passDisposition(value: unknown, source: string): ReviewPassDisposition {
  if (typeof value !== 'string' || !REVIEW_PASS_DISPOSITIONS.includes(value as ReviewPassDisposition))
    throw new ArtifactValidationError(`${source} must be approved, changes_required, or blocked.`);
  return value as ReviewPassDisposition;
}

function stringArray(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) throw new ArtifactValidationError(`${source} must be an array.`);
  return value.map((entry, index) => nonEmptyString(entry, `${source}[${index}]`));
}

function nonEmptyString(value: unknown, source: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new ArtifactValidationError(`${source} must be non-empty text.`);
  return value;
}

function optionalString(value: unknown, source: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, source);
}

function record(value: unknown, source: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ArtifactValidationError(`${source} must be a mapping.`);
  return value;
}

function assertIso(value: string, source: string): void {
  if (Number.isNaN(Date.parse(value))) throw new ArtifactValidationError(`${source} must be ISO.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
