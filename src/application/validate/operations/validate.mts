import { fail, projectRoot, recordOutput as writeOutput, setExitCode } from '../../command-runtime.js';
import { validateProject } from '../../project-validation.mjs';

export { validateProject } from '../../project-validation.mjs';

export function runValidate({ args }: { args: string[] }): void {
  const workItemIndex = args.indexOf('--work-item');
  const findings = validateProject(projectRoot(args), {
    preCommitTask: args.includes('--pre-commit') ? (args[args.indexOf('--pre-commit') + 1] ?? null) : null,
    workItem: workItemIndex < 0 ? null : (args[workItemIndex + 1] ?? null)
  });
  if (args.includes('--json')) writeOutput(JSON.stringify({ valid: !findings.length, findings }, null, 2));
  else if (!findings.length) writeOutput('Flow project is valid.');
  else for (const finding of findings) writeOutput(`${finding.code}: ${finding.message}`);
  if (findings.length) {
    if (!args.includes('--json')) fail(`${findings.length} validation finding(s).`);
    setExitCode(1);
  }
}
