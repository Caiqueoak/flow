import { positionalArguments } from '../../presentation/cli/command-input/arguments.js';
import { projectPathOption } from '../../presentation/cli/command-input/options.js';
import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { fail } from '../../presentation/cli/terminal/output.js';
import { runList } from './commands/list.js';
import { runRun } from './commands/run.js';

const gateCommands = {
  list: runList,
  run: runRun
} as const;

type GateCommandName = keyof typeof gateCommands;

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
  load: async () => ({ runGates }),
  run: 'runGates'
};

export function runGates({ args }: { args: string[] }): void {
  const [action] = positionalArguments(args);

  if (!isGateCommandName(action)) {
    fail("flow gates requires 'list' or 'run'.");
  }

  gateCommands[action]({ args });
}

function isGateCommandName(value: string | undefined): value is GateCommandName {
  return value !== undefined && value in gateCommands;
}
