import { validateProject } from '../../../flow-project/validation.mjs';
import { positionalArguments, projectRelativeFiles } from '../../../cli/command-input/arguments.js';
import { fail, writeOutput } from '../../../cli/terminal/output.js';
import { assertExactStagedFiles } from '../../../environment/git.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';

interface ValidationFinding {
  code: string;
  message: string;
}

const validateProjectBoundary = validateProject as unknown as (
  root: string,
  options: { preCommitTask: string; skipTrace: boolean }
) => ValidationFinding[];

export function runScope({ args }: { args: string[] }): void {
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
