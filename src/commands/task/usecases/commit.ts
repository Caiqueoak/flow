import { evaluateGates } from '../../../flow-project/gate-evaluation.mjs';
import { validateProject } from '../../../flow-project/validation.mjs';
import { optionValue, projectRelativeFiles } from '../../../cli/command-input/arguments.js';
import { fail, writeOutput } from '../../../cli/terminal/output.js';
import { isValidTaskCommitSubject } from '../../../execution/task-commit.js';
import type { QualifiedTaskId, Task, TaskCollection } from '../../../contracts/task.js';
import type { LoadedWorkItem } from '../../../contracts/work-item.js';
import { projectRelativePath, readText, writeText, writeYaml } from '../../../environment/filesystem.js';
import { assertExactStagedFiles, createCommit, resetFiles, stageFiles } from '../../../environment/git.js';
import { createTemporaryGitIndex, removeTemporaryGitIndex } from '../../../environment/temporary-git-index.js';

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
  options: { preCommitTask: string; skipTrace: boolean }
) => ValidationFinding[];
const evaluateGatesBoundary = evaluateGates as unknown as (root: string, options: { task: string }) => GateResult[];

export function commitTask(
  root: string,
  item: LoadedWorkItem,
  tasksFile: string,
  tasks: TaskCollection,
  task: Task,
  taskId: QualifiedTaskId,
  args: readonly string[]
): void {
  ensureTaskIsInProgress(task, taskId);
  const subject = validatedCommitSubject(args, taskId);

  ensurePreCommitValidation(root, taskId);
  const files = projectRelativeFiles(root, args);
  assertExactStagedFiles(root, files);
  ensureTaskGatesPass(root, taskId);

  persistTaskCommit({ root, item, tasksFile, tasks, task, taskId, subject, files });
  writeOutput(`${taskId} committed.`);
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

function persistTaskCommit(input: PersistTaskCommitInput): void {
  const originalTasks = readText(input.tasksFile);
  const temporaryIndex = createTemporaryGitIndex(input.root);
  const taskFile = projectRelativePath(input.root, input.tasksFile);

  input.task.state = 'completed';
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
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }
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

function ensureTaskGatesPass(root: string, taskId: QualifiedTaskId): void {
  const failedGates = evaluateGatesBoundary(root, { task: taskId }).filter(
    (gate) => gate.blocking && gate.status !== 'passed'
  );

  if (failedGates.length) {
    fail(`Task gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
  }
}
