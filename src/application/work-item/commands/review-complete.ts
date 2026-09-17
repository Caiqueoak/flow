import path from 'node:path';
import { parseReview } from '../../../domain/work-item/review.mjs';
import { isImplementationPlanApproved } from '../../../domain/project/implementation-plan.js';
import { validateProject } from '../../project-validation.mjs';
import { evaluateGates } from '../../../infrastructure/process/gate-evaluation.mjs';
import { fail, recordOutput as writeOutput, requiredOption } from '../../command-runtime.js';
import { IMPLEMENTATION_PLAN_FILE, REVIEW_FILE, SPEC_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem, WorkItemReview } from '../../../domain/work-item/work-item.js';
import { projectRelativePath, readText, writeYaml } from '../../../infrastructure/filesystem/index.js';
import {
  assertOnlyStagedFiles,
  createCommit,
  createTemporaryGitIndex,
  removeTemporaryGitIndex,
  resetFiles,
  stageFiles
} from '../../../infrastructure/git/index.js';

interface ValidationFinding {
  code: string;
}

interface GateResult {
  id: string;
  blocking: boolean;
  status: string;
}

const parseReviewBoundary = parseReview as unknown as (
  text: string,
  options: { expectedWorkItem: string }
) => WorkItemReview;
const validateProjectBoundary = validateProject as unknown as (
  root: string,
  options: { workItem: string }
) => ValidationFinding[];
const evaluateGatesBoundary = evaluateGates as unknown as (
  root: string,
  options: { workItem: string; stage: 'work-item-review' }
) => GateResult[];

export function completeWorkItemReview(root: string, item: LoadedWorkItem, args: readonly string[]): void {
  const domain = requiredOption(args, '--domain');

  ensureReviewCanComplete(item);
  ensureApprovedImplementationPlan(item);
  ensureReviewValidationPasses(root, item.id);
  ensureReviewGatesPass(root, item.id);

  const reviewFilePath = path.join(item.base, REVIEW_FILE);
  const review = parseReviewBoundary(readText(reviewFilePath), { expectedWorkItem: item.id });
  const workItemPath = projectRelativePath(root, item.base);
  const reviewFile = `${workItemPath}/${REVIEW_FILE}`;
  const specFile = `${workItemPath}/${SPEC_FILE}`;
  const allowedFiles = [specFile, reviewFile];

  assertOnlyStagedFiles(root, allowedFiles);
  persistReviewCommit(root, item, domain, reviewFilePath, review, allowedFiles, reviewFile);
  writeOutput(`${item.id} review completed.`);
}

function persistReviewCommit(
  root: string,
  item: LoadedWorkItem,
  domain: string,
  reviewFilePath: string,
  review: WorkItemReview,
  allowedFiles: string[],
  reviewFile: string
): void {
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
  const findings = validateProjectBoundary(root, { workItem: workItemId });

  if (findings.length) {
    fail(`Review validation failed: ${findings.map((finding) => finding.code).join(', ')}.`);
  }
}

function ensureReviewGatesPass(root: string, workItemId: string): void {
  const failedGates = evaluateGatesBoundary(root, {
    workItem: workItemId,
    stage: 'work-item-review'
  }).filter((gate) => gate.blocking && gate.status !== 'passed');

  if (failedGates.length) {
    fail(`Review gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
  }
}
