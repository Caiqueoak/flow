import { positionalArguments, resolveSubcommand } from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runCommit } from './commands/commit.js';
import { runCreate } from './commands/create.js';
import { runSet } from './commands/set.js';
import { runStart } from './commands/start.js';

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
  const [action, target] = positionalArguments(args);

  resolveSubcommand(taskCommands, action, `Unknown task operation '${action}'.`)(target, args);
}
