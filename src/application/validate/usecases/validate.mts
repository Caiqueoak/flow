// @ts-nocheck
import { fail, writeOutput } from '../../../cli/terminal/output.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';
import { validateProject } from '../../../flow-project/validation.mjs';

export { validateProject } from '../../../flow-project/validation.mjs';

export function runValidate({ args }) {
  const workItemIndex = args.indexOf('--work-item');
  const findings = validateProject(projectRoot(args), {
    preCommitTask: args.includes('--pre-commit') ? args[args.indexOf('--pre-commit') + 1] : null,
    workItem: workItemIndex < 0 ? null : args[workItemIndex + 1]
  });
  if (args.includes('--json')) writeOutput(JSON.stringify({ valid: !findings.length, findings }, null, 2));
  else if (!findings.length) writeOutput('Flow project is valid.');
  else for (const finding of findings) writeOutput(`${finding.code}: ${finding.message}`);
  if (findings.length) {
    if (!args.includes('--json')) fail(`${findings.length} validation finding(s).`);
    process.exitCode = 1;
  }
}
