import path from 'node:path';
import { parseReview, reviewReadyForCompletion } from '../../../domain/work-item/review.mjs';
import { validateProject } from '../../project-validation.mjs';
import { evaluateGates } from '../../../infrastructure/process/gate-evaluation.mjs';
import { fail, recordOutput as writeOutput, requiredOption } from '../../command-runtime.js';
import { REVIEW_FILE, SPEC_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem, WorkItemId } from '../../../domain/work-item/work-item.js';
import { projectRelativePath, readText, writeText } from '../../../infrastructure/filesystem/index.js';
import {
  loadExecutionState,
  writeExecutionState,
  executionStateFile
} from '../../../infrastructure/persistence/execution-state.mjs';
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
  ensureReviewValidationPasses(root, item.id);
  ensureReviewGatesPass(root, item.id);

  const reviewFilePath = path.join(item.base, REVIEW_FILE);
  const review = parseReview(readText(reviewFilePath), { expectedWorkItem: item.id });
  if (!reviewReadyForCompletion(review)) fail(`${item.id} review history is not cleanly approved.`);

  const workItemPath = projectRelativePath(root, item.base);
  const reviewFile = `${workItemPath}/${REVIEW_FILE}`;
  const specFile = `${workItemPath}/${SPEC_FILE}`;
  const state = loadExecutionState(root);
  const stateFilePath = executionStateFile(root);
  const stateFile = projectRelativePath(root, stateFilePath);
  const clearsActiveFocus = state.active.work_item === item.id;
  const allowedFiles = [specFile, reviewFile, stateFile];

  assertOnlyStagedFiles(root, allowedFiles);
  persistReviewCommit(
    root,
    item,
    domain,
    allowedFiles,
    reviewFile,
    clearsActiveFocus ? { state, stateFilePath, stateFile } : null
  );
  writeOutput(`${item.id} review completed.`);
}

function persistReviewCommit(
  root: string,
  item: LoadedWorkItem,
  domain: string,
  allowedFiles: string[],
  reviewFile: string,
  activeState: {
    state: ReturnType<typeof loadExecutionState>;
    stateFilePath: string;
    stateFile: string;
  } | null
): void {
  const temporaryIndex = createTemporaryGitIndex(root);
  const originalState = activeState ? readText(activeState.stateFilePath) : null;

  try {
    const filesToStage = [reviewFile];
    if (activeState) {
      activeState.state.active.work_item = null;
      activeState.state.active.concurrency = null;
      writeExecutionState(root, activeState.state);
      filesToStage.push(activeState.stateFile);
    }
    stageFiles(root, filesToStage, temporaryIndex.env);
    createCommit({
      root,
      subject: `chore(${domain}): complete review [${item.id}]`,
      env: temporaryIndex.env
    });
    resetFiles(root, allowedFiles);
  } catch (error) {
    if (activeState && originalState !== null) writeText(activeState.stateFilePath, originalState);
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }
}

function ensureReviewCanComplete(item: LoadedWorkItem): void {
  const hasTasks = item.tasks.tasks.length > 0;
  const allTasksCompleted = item.tasks.tasks.every((task) => task.state === 'completed');

  if (item.maturity !== 'ready' || !hasTasks || !allTasksCompleted || !reviewReadyForCompletion(item.review))
    fail(`${item.id} is not ready for review completion.`);
}

function ensureReviewValidationPasses(root: string, workItemId: WorkItemId): void {
  const findings = validateProjectBoundary(root, { workItem: workItemId });
  if (findings.length) fail(`Review validation failed: ${findings.map((finding) => finding.code).join(', ')}.`);
}

function ensureReviewGatesPass(root: string, workItemId: WorkItemId): void {
  const failedGates = evaluateGatesBoundary(root, {
    workItem: workItemId,
    stage: 'work-item-review'
  }).filter((gate) => gate.blocking && gate.status !== 'passed');

  if (failedGates.length) fail(`Review gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
}
