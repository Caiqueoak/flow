import path from 'node:path';
import { parseReview } from '../../artifacts/review.mjs';
import { validateProject } from '../../commands/validate.mjs';
import { evaluateGates } from '../../commands/gates.mjs';
import { fail, info } from '../../shared/cli-io.mjs';
import { IMPLEMENTATION_PLAN_FILE, REVIEW_FILE, SPEC_FILE } from '../../shared/domain/constants.js';
import type { LoadedWorkItem, WorkItemReview } from '../../shared/domain/work-item.js';
import { isImplementationPlanApproved } from '../../shared/documents/implementation-plan.js';
import { projectRelativePath, readText, writeYaml } from '../../shared/filesystem/files.js';
import { assertOnlyStagedFiles, createCommit, resetFiles, stageFiles } from '../../shared/git/git.js';
import { createTemporaryGitIndex, removeTemporaryGitIndex } from '../../shared/git/git-index.js';
import { requiredOption } from '../../shared/cli/arguments.js';

export function completeWorkItemReview(root: string, item: LoadedWorkItem, args: readonly string[]): void {
  const domain = requiredOption(args, '--domain');

  ensureReviewCanComplete(item);
  ensureApprovedImplementationPlan(item);
  ensureReviewValidationPasses(root, item.id);
  ensureReviewGatesPass(root, item.id);

  const reviewFilePath = path.join(item.base, REVIEW_FILE);
  const review = parseReview(readText(reviewFilePath), { expectedWorkItem: item.id }) as WorkItemReview;
  const workItemPath = projectRelativePath(root, item.base);
  const reviewFile = `${workItemPath}/${REVIEW_FILE}`;
  const specFile = `${workItemPath}/${SPEC_FILE}`;
  const allowedFiles = [specFile, reviewFile];

  assertOnlyStagedFiles(root, allowedFiles);

  const temporaryIndex = createTemporaryGitIndex(root);

  try {
    review.status = 'approved';
    review.reviewed_at = new Date().toISOString();
    writeYaml(reviewFilePath, review);
    stageFiles(root, [reviewFile], temporaryIndex.env);
    createCommit({
      root,
      subject: `chore(${domain}): complete review [${item.id}]`,
      env: temporaryIndex.env
    });
    resetFiles(root, allowedFiles);
  } catch (error) {
    review.status = 'pending';
    delete review.reviewed_at;
    writeYaml(reviewFilePath, review);
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }

  info(`${item.id} review completed.`);
}

function ensureReviewCanComplete(item: LoadedWorkItem): void {
  const hasTasks = item.tasks.tasks.length > 0;
  const allTasksCompleted = item.tasks.tasks.every((task) => task.state === 'completed');

  if (item.maturity !== 'ready' || !hasTasks || !allTasksCompleted) {
    fail(`${item.id} is not ready for review completion.`);
  }
}

function ensureApprovedImplementationPlan(item: LoadedWorkItem): void {
  const planFile = path.join(item.base, IMPLEMENTATION_PLAN_FILE);

  if (!isImplementationPlanApproved(readText(planFile))) {
    fail(`${item.id} requires an approved implementation plan.`);
  }
}

function ensureReviewValidationPasses(root: string, workItemId: string): void {
  const findings = validateProject(root, { workItem: workItemId });

  if (findings.length) {
    fail(`Review validation failed: ${findings.map((finding: { code: string }) => finding.code).join(', ')}.`);
  }
}

function ensureReviewGatesPass(root: string, workItemId: string): void {
  const failedGates = evaluateGates(root, {
    workItem: workItemId,
    stage: 'work-item-review'
  }).filter((gate: { blocking: boolean; status: string }) => gate.blocking && gate.status !== 'passed');

  if (failedGates.length) {
    fail(`Review gates failed: ${failedGates.map((gate: { id: string }) => gate.id).join(', ')}.`);
  }
}
