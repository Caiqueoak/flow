import {
  fail,
  positionalArguments,
  projectRelativeFiles,
  projectRoot,
  recordOutput as writeOutput
} from '../../command-runtime.js';
import { assertExactStagedFiles } from '../../../infrastructure/git/index.js';
import { validateProject } from '../../project-validation.mjs';

interface ValidationFinding {
  code: string;
  message: string;
}

const validateProjectBoundary = validateProject as unknown as (
  root: string,
  options: { preCommitTask: string; skipTrace: boolean }
) => ValidationFinding[];

export function runValidate({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const taskId = positionalArguments(args)[1];

  if (!taskId) {
    fail('Usage: flow scope validate W###-T### --files <path,...>.');
  }

  const findings = validateProjectBoundary(root, { preCommitTask: taskId!, skipTrace: true });

  if (findings.length) {
    fail(findings.map((finding) => `${finding.code}: ${finding.message}`).join(' | '));
  }

  assertExactStagedFiles(root, projectRelativeFiles(root, args));
  writeOutput(`${taskId} staged scope is valid.`);
}
