import path from 'node:path';
import { REVIEW_FILE } from '../../../domain/project/project.js';
import type { ActiveReviewPass, WorkerRunEvidence } from '../../../domain/work-item/review.mjs';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { fail, optionValue, requiredOption } from '../../command-runtime.js';
import { checkpointReviewPass, finalizeReviewPass } from '../operations/review-history.mjs';

interface ReviewPassPayload {
  pass: ActiveReviewPass;
  worker_runs?: WorkerRunEvidence[];
}

export function persistWorkItemReviewPass(item: LoadedWorkItem, args: readonly string[]): void {
  const mode = requiredOption(args, '--mode');
  const reviewFile = path.join(item.base, REVIEW_FILE);

  if (mode === 'finalize') {
    if (optionValue(args, '--data')) fail('--data is not accepted when --mode finalize is used.');
    finalizeReviewPass(reviewFile, item.id);
    return;
  }

  if (mode !== 'checkpoint') fail("--mode must be 'checkpoint' or 'finalize'.");
  checkpointReviewPass(reviewFile, item.id, parsePayload(requiredOption(args, '--data')));
}

function parsePayload(value: string): ReviewPassPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('--data must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('pass' in parsed))
    fail('--data must contain a pass object.');
  return parsed as ReviewPassPayload;
}
