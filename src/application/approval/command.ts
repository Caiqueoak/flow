import path from 'node:path';
import { optionValue, positionalArguments } from '../../presentation/cli/command-input/arguments.js';
import { projectRoot } from '../../presentation/cli/command-input/project-root.js';
import { projectPathOption } from '../../presentation/cli/command-input/options.js';
import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { fail, writeOutput } from '../../presentation/cli/terminal/output.js';
import { recordApproval } from './commands/record.js';

const approvalCommands = {
  record: runRecord
} as const;

type ApprovalCommandName = keyof typeof approvalCommands;

export const command: CommandDefinition = {
  name: 'approval',
  description: 'Persist an explicit human approval for a document revision.',
  usage: 'flow approval record <path> [--at <ISO timestamp>]',
  arguments: [{ name: 'operation', required: true }],
  flags: [projectPathOption, { name: '--at', value: '<timestamp>' }],
  effects: 'Updates approved frontmatter.',
  when: 'Only after explicit approval of the exact document.',
  load: async () => ({ runApproval }),
  run: 'runApproval'
};

export function runApproval({ args }: { args: string[] }): void {
  const [action, target] = positionalArguments(args);

  if (!isApprovalCommandName(action) || !target) {
    fail('Usage: flow approval record <implementation-plan.md>.');
  }

  approvalCommands[action](target, args);
}

function runRecord(target: string, args: readonly string[]): void {
  if (path.isAbsolute(target)) {
    fail('Approval path must be project-relative.');
  }

  const approvedAt = approvalTimestamp(optionValue(args, '--at'));
  const result = recordApproval({ root: projectRoot(args), target, approvedAt });
  writeOutput(`${result.workItemId} implementation plan approved.`);
}

function isApprovalCommandName(value: string | undefined): value is ApprovalCommandName {
  return value !== undefined && value in approvalCommands;
}

function approvalTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(timestamp))) {
    fail('--at must be an ISO timestamp.');
  }

  return new Date(timestamp).toISOString();
}
