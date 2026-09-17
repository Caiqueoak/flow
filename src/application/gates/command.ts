import { positionalArguments, resolveSubcommand } from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runList } from './commands/list.js';
import { runRun } from './commands/run.js';

const gateCommands = {
  list: runList,
  run: runRun
} as const;

export const command: CommandDefinition = {
  name: 'gates',
  description: 'List or selectively run deterministic project gates.',
  usage: 'flow gates list|run [filters]',
  arguments: [{ name: 'action', required: true }],
  flags: [
    projectPathOption,
    { name: '--id', value: '<gate-id>' },
    { name: '--task', value: '<W###-T###>' },
    { name: '--work-item', value: '<W###>' },
    { name: '--stage', value: '<stage>', values: ['task', 'work-item-review', 'full'] },
    { name: '--all' },
    { name: '--json' }
  ],
  effects: 'list is read-only; run executes selected commands.',
  when: 'For the smallest safe verification scope.',
  subcommands: Object.keys(gateCommands),
  load: async () => ({ runGates }),
  run: 'runGates'
};

export function runGates({ args }: { args: string[] }): void {
  const [action] = positionalArguments(args);

  resolveSubcommand(gateCommands, action, "flow gates requires 'list' or 'run'.")({ args });
}
