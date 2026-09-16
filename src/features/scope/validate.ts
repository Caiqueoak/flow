import { validateProject } from '../../commands/validate.mjs';
import { fail, info } from '../../shared/cli-io.mjs';
import { positionalArguments, projectRelativeFiles } from '../../shared/cli/arguments.js';
import { assertExactStagedFiles } from '../../shared/git/git.js';
import { projectRoot } from '../../shared/project-path.mjs';

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
  info(`${taskId} staged scope is valid.`);
}
