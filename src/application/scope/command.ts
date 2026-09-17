import { positionalArguments } from '../../presentation/cli/command-input/arguments.js';
import { projectPathOption } from '../../presentation/cli/command-input/options.js';
import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { fail } from '../../presentation/cli/terminal/output.js';
import { runValidate } from './commands/validate.js';

const scopeCommands = {
  validate: runValidate
} as const;

type ScopeCommandName = keyof typeof scopeCommands;

export const command: CommandDefinition = {
  name: 'scope',
  description: 'Validate the staged scope for one task before its implementation commit.',
  usage: 'flow scope validate W###-T### --files <path,...> [--json]',
  arguments: [{ name: 'operation', required: true }],
  flags: [projectPathOption, { name: '--files', value: '<path,...>' }, { name: '--json' }],
  effects: 'Read-only staged Git inspection and structural validation.',
  when: 'Immediately before a task implementation commit.',
  load: async () => ({ runScope }),
  run: 'runScope'
};

export function runScope({ args }: { args: string[] }): void {
  const [action] = positionalArguments(args);

  if (!isScopeCommandName(action)) {
    fail(`Unknown scope operation '${action}'.`);
  }

  scopeCommands[action]({ args });
}

function isScopeCommandName(value: string | undefined): value is ScopeCommandName {
  return value !== undefined && value in scopeCommands;
}
