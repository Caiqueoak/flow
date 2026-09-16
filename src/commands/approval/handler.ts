import path from 'node:path';
import { optionValue, positionalArguments } from '../../cli/command-input/arguments.js';
import { projectRoot } from '../../cli/command-input/project-root.js';
import { fail, writeOutput } from '../../cli/terminal/output.js';
import { recordApproval } from './usecases/record.js';

export function runApproval({ args }: { args: string[] }): void {
  const [action, target] = positionalArguments(args);
  if (action !== 'record' || !target) fail('Usage: flow approval record <implementation-plan.md>.');
  if (path.isAbsolute(target!)) fail('Approval path must be project-relative.');

  const approvedAt = approvalTimestamp(optionValue(args, '--at'));
  const result = recordApproval({ root: projectRoot(args), target: target!, approvedAt });
  writeOutput(`${result.workItemId} implementation plan approved.`);
}

function approvalTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp))) fail('--at must be an ISO timestamp.');
  return new Date(timestamp).toISOString();
}
