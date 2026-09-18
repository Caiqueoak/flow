import path from 'node:path';
import {
  fail,
  optionValue,
  positionalArguments,
  projectRoot,
  recordOutput as writeOutput,
  resolveSubcommand
} from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { recordApproval } from './commands/record.js';

const approvalCommands = {
  record: runRecord
} as const;

export const command: CommandDefinition = {
  name: 'approval',
  description: 'Persist an explicit human approval for a document revision.',
  usage: 'flow approval record <work-item-spec.md> [--at <ISO timestamp>]',
  arguments: [{ name: 'operation', required: true }],
  flags: [projectPathOption, { name: '--at', value: '<timestamp>' }],
  effects: 'Updates approved frontmatter.',
  when: 'Only after explicit approval of the exact document.',
  subcommands: Object.keys(approvalCommands),
  load: async () => ({ runApproval }),
  run: 'runApproval'
};

export function runApproval({ args }: { args: string[] }): void {
  const [action, target] = positionalArguments(args);

  if (!target) {
    fail('Usage: flow approval record <spec.md>.');
  }

  resolveSubcommand(approvalCommands, action, 'Usage: flow approval record <spec.md>.')(target, args);
}

function runRecord(target: string, args: readonly string[]): void {
  if (path.isAbsolute(target)) {
    fail('Approval path must be project-relative.');
  }

  const approvedAt = approvalTimestamp(optionValue(args, '--at'));
  const result = recordApproval({ root: projectRoot(args), target, approvedAt });
  writeOutput(`${result.workItemId} specification approved.`);
}

function approvalTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(timestamp))) {
    fail('--at must be an ISO timestamp.');
  }

  return new Date(timestamp).toISOString();
}
