import { positionalArguments, projectRoot, resolveSubcommand } from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runCommit } from './commands/commit.js';
import { runCreate } from './commands/create.js';
import { runSet } from './commands/set.js';
import { runStart } from './commands/start.js';
import { assertProjectContractsAuthorized } from '../project-contracts.mjs';
import { assertWorkItemHistoryMutable } from '../work-item/operations/history.mjs';

const taskCommands = {
  create: runCreate,
  set: runSet,
  start: runStart,
  commit: runCommit
} as const;

export const command: CommandDefinition = {
  name: 'task',
  description: 'Create, update, start or commit tasks.',
  usage: 'flow task <create|set|start|commit> W###[-T###] [options]',
  arguments: [{ name: 'operation', required: true }],
  flags: [
    projectPathOption,
    { name: '--title', value: '<text>' },
    { name: '--depends-on', value: '<T###,...>' },
    { name: '--mutation-surfaces', value: '<path,...>' },
    { name: '--mutation-resources', value: '<token,...>' },
    { name: '--concurrent' },
    { name: '--workspace', value: '<shared|isolated>' },
    { name: '--message', value: '<objective commit title>' },
    { name: '--files', value: '<path,...>' }
  ],
  effects: 'Task commit creates the one canonical implementation commit.',
  when: 'Only after spec maturity is ready.',
  subcommands: Object.keys(taskCommands),
  load: async () => ({ runTask }),
  run: 'runTask'
};

export function runTask({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (action && Object.hasOwn(taskCommands, action)) {
    assertWorkItemHistoryMutable(root, workItemIdFromTarget(target));
  }
  if (['create', 'start', 'commit'].includes(action ?? '')) {
    assertProjectContractsAuthorized(root);
  }

  resolveSubcommand(taskCommands, action, `Unknown task operation '${action}'.`)(target, args);
}

function workItemIdFromTarget(target: string | undefined): string {
  return (target ?? '').split('-T')[0] ?? '';
}
