import {
  completeActivePass,
  parseReview,
  stringifyReview,
  upgradePendingLegacyReview,
  type ActiveReviewPass,
  type SerializedWorkItemReview,
  type WorkerRunEvidence,
  type WorkItemReviewV2
} from '../../../domain/work-item/review.mjs';
import type { WorkItemId } from '../../../domain/work-item/work-item.js';
import { atomicWriteText, readText } from '../../../infrastructure/filesystem/index.js';

export interface ReviewCheckpointInput {
  pass: ActiveReviewPass;
  worker_runs?: WorkerRunEvidence[];
}

export function checkpointReviewPass(
  reviewFile: string,
  workItem: WorkItemId,
  input: ReviewCheckpointInput
): WorkItemReviewV2 {
  const current = upgradePendingLegacyReview(readReview(reviewFile, workItem));
  if (current.passes.some((pass) => pass.id === input.pass.id)) {
    throw new Error(`Finalized review pass '${input.pass.id}' is immutable.`);
  }
  if (current.active_pass && current.active_pass.id !== input.pass.id) {
    throw new Error(
      `Review pass '${current.active_pass.id}' is already active; finalize it before starting '${input.pass.id}'.`
    );
  }

  const existingWorkerIds = new Set(current.worker_runs.map((run) => run.id));
  const workerRuns = input.worker_runs ?? [];
  for (const run of workerRuns) {
    if (existingWorkerIds.has(run.id)) throw new Error(`Worker run '${run.id}' is already persisted and immutable.`);
    existingWorkerIds.add(run.id);
  }

  const next: WorkItemReviewV2 = {
    ...current,
    active_pass: input.pass,
    worker_runs: [...current.worker_runs, ...workerRuns]
  };
  writeReview(reviewFile, workItem, next);
  return next;
}

export function finalizeReviewPass(
  reviewFile: string,
  workItem: WorkItemId,
  finalizedAt = new Date().toISOString()
): WorkItemReviewV2 {
  const current = upgradePendingLegacyReview(readReview(reviewFile, workItem));
  if (!current.active_pass) throw new Error(`${workItem} has no active review pass to finalize.`);
  if (current.passes.some((pass) => pass.id === current.active_pass?.id))
    throw new Error(`Finalized review pass '${current.active_pass.id}' is immutable.`);

  const finalized = completeActivePass(current.active_pass, finalizedAt);
  const next: WorkItemReviewV2 = {
    ...current,
    disposition: finalized.disposition,
    active_pass: null,
    passes: [...current.passes, finalized]
  };
  writeReview(reviewFile, workItem, next);
  return next;
}

function readReview(reviewFile: string, workItem: WorkItemId): SerializedWorkItemReview {
  return parseReview(readText(reviewFile), { expectedWorkItem: workItem });
}

function writeReview(reviewFile: string, workItem: WorkItemId, review: WorkItemReviewV2): void {
  const content = stringifyReview(review);
  atomicWriteText(reviewFile, content, {
    validate: (candidate) => parseReview(candidate, { expectedWorkItem: workItem })
  });
}
