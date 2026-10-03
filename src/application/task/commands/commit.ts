import {
  fail,
  optionValue,
  projectRelativeFiles,
  projectRoot,
  recordOutput as writeOutput
} from '../../command-runtime.js';
import { isValidTaskCommitSubject } from '../../../domain/task/commit.js';
import type { QualifiedTaskId, Task, TaskCollection } from '../../../domain/task/task.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { validateConcurrentCommitFiles } from '../../../domain/work-item/concurrency.mjs';
import { projectRelativePath, readText, writeText, writeYaml } from '../../../infrastructure/filesystem/index.js';
import { loadExecutionState, writeExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';
import {
  assertExactStagedFiles,
  createCommit,
  createTemporaryGitIndex,
  removeTemporaryGitIndex,
  resetFiles,
  stageFiles
} from '../../../infrastructure/git/index.js';
import { evaluateGates } from '../../../infrastructure/process/gate-evaluation.mjs';
import { validateProject } from '../../project-validation.mjs';
import { findTask, loadTaskContext } from '../task-context.js';

interface ValidationFinding {
  code: string;
}

interface GateResult {
  id: string;
  blocking: boolean;
  status: string;
}

interface PersistTaskCommitInput {
  root: string;
  item: LoadedWorkItem;
  tasksFile: string;
  tasks: TaskCollection;
  task: Task;
  taskId: QualifiedTaskId;
  subject: string;
  files: string[];
}

const validateProjectBoundary = validateProject as unknown as (
  root: string,
  options: { preCommitTask: string; skipTrace: boolean }
) => ValidationFinding[];
const evaluateGatesBoundary = evaluateGates as unknown as (root: string, options: { task: string }) => GateResult[];

export function runCommit(target: string | undefined, args: readonly string[]): void {
  const root = projectRoot(args);
  const context = loadTaskContext(root, target);
  const task = findTask(context.tasks.tasks, target);
  const taskId = target as QualifiedTaskId;

  ensureTaskIsInProgress(task, taskId);
  const subject = validatedCommitSubject(args, taskId);

  ensurePreCommitValidation(root, taskId);
  const files = projectRelativeFiles(root, args);
  assertExactStagedFiles(root, files);
  ensureConcurrentCommitScope(task, context.tasks, files, taskId);
  ensureTaskGatesPass(root, taskId);

  persistTaskCommit({
    root,
    item: context.item,
    tasksFile: context.tasksFile,
    tasks: context.tasks,
    task,
    taskId,
    subject,
    files
  });
  writeOutput(`${taskId} committed.`);
}

function persistTaskCommit(input: PersistTaskCommitInput): void {
  const originalTasks = readText(input.tasksFile);
  const state = loadExecutionState(input.root);
  const previousConcurrency = state.active.concurrency;
  const temporaryIndex = createTemporaryGitIndex(input.root);
  const taskFile = projectRelativePath(input.root, input.tasksFile);

  input.task.state = 'completed';
  reconcileConcurrencyState(state, input.item.id, input.tasks);
  writeExecutionState(input.root, state);
  writeYaml(input.tasksFile, input.tasks);

  try {
    stageFiles(input.root, [taskFile], temporaryIndex.env);
    assertExactStagedFiles(input.root, [...input.files, taskFile], temporaryIndex.env);
    createCommit({
      root: input.root,
      subject: input.subject,
      body: `Flow-Work-Item: ${input.item.id}\nFlow-Task: ${input.taskId}`,
      env: temporaryIndex.env
    });
    resetFiles(input.root, [...input.files, taskFile]);
  } catch (error) {
    writeText(input.tasksFile, originalTasks);
    state.active.concurrency = previousConcurrency;
    writeExecutionState(input.root, state);
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }
}

function reconcileConcurrencyState(
  state: ReturnType<typeof loadExecutionState>,
  workItemId: LoadedWorkItem['id'],
  tasks: TaskCollection
): void {
  if (!state.active.concurrency) return;
  const activeTaskIds = tasks.tasks
    .filter((candidate) => candidate.state === 'in_progress')
    .map((candidate) => `${workItemId}-${candidate.id}`)
    .sort();
  state.active.concurrency =
    activeTaskIds.length > 1
      ? { ...state.active.concurrency, tasks: activeTaskIds as typeof state.active.concurrency.tasks }
      : null;
}

function ensureTaskIsInProgress(task: Task, taskId: QualifiedTaskId): void {
  if (task.state !== 'in_progress') {
    fail(`${taskId} must be in_progress.`);
  }
}

function validatedCommitSubject(args: readonly string[], taskId: QualifiedTaskId): string {
  const subject = optionValue(args, '--message')?.trim();

  if (!subject || !isValidTaskCommitSubject(subject, taskId)) {
    fail(`--message must be type(domain): description [${taskId}].`);
  }

  return subject!;
}

function ensurePreCommitValidation(root: string, taskId: QualifiedTaskId): void {
  const findings = validateProjectBoundary(root, { preCommitTask: taskId, skipTrace: true });

  if (findings.length) {
    fail(`Pre-commit validation failed: ${findings.map((finding) => finding.code).join(', ')}.`);
  }
}

function ensureConcurrentCommitScope(
  task: Task,
  tasks: TaskCollection,
  files: string[],
  taskId: QualifiedTaskId
): void {
  const otherActiveTasks = tasks.tasks.filter(
    (candidate) => candidate.id !== task.id && candidate.state === 'in_progress'
  );
  if (!otherActiveTasks.length) return;

  const findings = validateConcurrentCommitFiles(task, otherActiveTasks, files);
  if (findings.length) {
    fail(`${taskId} commit violates concurrent mutation claims: ${findings.join(' ')}`);
  }
}

function ensureTaskGatesPass(root: string, taskId: QualifiedTaskId): void {
  const failedGates = evaluateGatesBoundary(root, { task: taskId }).filter(
    (gate) => gate.blocking && gate.status !== 'passed'
  );

  if (failedGates.length) {
    fail(`Task gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
  }
}
