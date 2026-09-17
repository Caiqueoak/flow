import {
  positionalArguments,
  projectRelativeFiles
} from '../../../presentation/cli/command-input/arguments.js';
import { projectRoot } from '../../../presentation/cli/command-input/project-root.js';
import { fail, writeOutput } from '../../../presentation/cli/terminal/output.js';
import { assertExactStagedFiles } from '../../../infrastructure/git/index.js';
import { validateProject } from '../../../flow-project/validation.mjs';

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
