import { validateProject } from '../../commands/validate.mjs';
import { fail, info } from '../../shared/cli-io.mjs';
import { positionalArguments, projectRelativeFiles } from '../../shared/cli/arguments.js';
import { assertExactStagedFiles } from '../../shared/git/git.js';
import { projectRoot } from '../../shared/project-path.mjs';

export function runScope({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const taskId = positionalArguments(args)[1];
  const findings = validateProject(root, { preCommitTask: taskId, skipTrace: true });

  if (findings.length) {
    fail(findings.map((finding: { code: string; message: string }) => `${finding.code}: ${finding.message}`).join(' | '));
  }

  assertExactStagedFiles(root, projectRelativeFiles(root, args));
  info(`${taskId} staged scope is valid.`);
}
