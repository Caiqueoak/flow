import { positionalArguments, resolveSubcommand } from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runValidate } from './commands/validate.js';

const scopeCommands = {
  validate: runValidate
} as const;

export const command: CommandDefinition = {
  name: 'scope',
  description: 'Validate the staged scope for one task before its implementation commit.',
  usage: 'flow scope validate W###-T### --files <path,...> [--json]',
  arguments: [{ name: 'operation', required: true }],
  flags: [projectPathOption, { name: '--files', value: '<path,...>' }, { name: '--json' }],
  effects: 'Read-only staged Git inspection and structural validation.',
  when: 'Immediately before a task implementation commit.',
  subcommands: Object.keys(scopeCommands),
  load: async () => ({ runScope }),
  run: 'runScope'
};

export function runScope({ args }: { args: string[] }): void {
  const [action] = positionalArguments(args);

  resolveSubcommand(scopeCommands, action, `Unknown scope operation '${action}'.`)({ args });
}
