import { definition as approval } from '../../commands/approval/definition.js';
import { definition as diagnostics } from '../../commands/doctor/definition.js';
import { definition as gates } from '../../commands/gates/definition.js';
import { definition as initialization } from '../../commands/init/definition.js';
import { definition as migration } from '../../commands/migrate/definition.js';
import { definition as projections } from '../../commands/sync/definition.js';
import { definition as routing } from '../../commands/route/definition.js';
import { definition as schemaGeneration } from '../../commands/schemas/definition.js';
import { definition as scope } from '../../commands/scope/definition.js';
import { definition as status } from '../../commands/status/definition.js';
import { definition as tasks } from '../../commands/task/definition.js';
import { definition as traceability } from '../../commands/trace/definition.js';
import { definition as validation } from '../../commands/validate/definition.js';
import { definition as workItems } from '../../commands/work-item/definition.js';
import type { CommandDefinition } from './definition.js';

export const commands: readonly CommandDefinition[] = [
  initialization,
  diagnostics,
  migration,
  status,
  validation,
  routing,
  projections,
  traceability,
  gates,
  workItems,
  tasks,
  approval,
  scope,
  schemaGeneration
];

export function commandByName(name: string): CommandDefinition | undefined {
  return commands.find((command) => command.name === name);
}

export function renderGlobalHelp(version: string): string {
  const rows = commands
    .filter((command) => !command.hidden)
    .map((command) => `  ${command.name.padEnd(11)} ${command.description}`);
  return `Flow ${version}\n\nUsage: npx --no-install flow <command> [options]\nEngineering baseline: Readability First.\n\nGlobal parameters:\n  --help, -h       Show help.\n  --version, -v    Show version.\n  --path <project> Select project root (default: current directory).\n\nCommands:\n${rows.join('\n')}\n\nRun flow <command> --help for syntax, values, effects and usage guidance.`;
}

export function renderCommandHelp(command: CommandDefinition): string {
  const argumentsText = command.arguments?.length ? command.arguments.map(renderArgument).join('\n') : '  (none)';
  const flags = command.flags?.length ? command.flags.map(renderOption).join('\n') : '  (none)';
  return `${command.description}\n\nSyntax:\n  ${command.usage}\n\nArguments:\n${argumentsText}\n\nOptions:\n${flags}\n\nEffects:\n  ${command.effects}\n\nUse when:\n  ${command.when}`;
}

export function validateCommandArguments(command: CommandDefinition, args: readonly string[]): void {
  const allowed = new Map((command.flags ?? []).map((flag) => [flag.name, flag]));
  const positional = [] as string[];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (!value.startsWith('-')) {
      positional.push(value);
      continue;
    }
    const flag = allowed.get(value);
    if (!flag) throw new Error(`unknown option '${value}' for flow ${command.name}.`);
    if (!flag.value) continue;
    const next = args[++index];
    if (!next || next.startsWith('-')) throw new Error(`${value} requires ${flag.value}.`);
    if (flag.values && !flag.values.includes(next))
      throw new Error(`${value} must be one of: ${flag.values.join(', ')}.`);
  }

  if (command.arguments?.some((argument) => argument.required) && !positional.length)
    throw new Error(`flow ${command.name} requires ${command.arguments[0]?.name}.`);
  if (command.name === 'migrate' && args.includes('--plan') === args.includes('--apply'))
    throw new Error('flow migrate requires exactly one of --plan or --apply.');
}

function renderArgument(argument: NonNullable<CommandDefinition['arguments']>[number]): string {
  return `  ${argument.name}${argument.required ? ' (required)' : ''} — ${argument.description ?? 'Command argument.'}`;
}

function renderOption(option: NonNullable<CommandDefinition['flags']>[number]): string {
  const value = option.value ? ` ${option.value}` : '';
  const choices = option.values ? ` (${option.values.join('|')})` : '';
  const defaultValue = option.default ? ` [default: ${option.default}]` : '';
  return `  ${option.name}${value}${choices}${defaultValue} — ${option.description ?? 'Command option.'}`;
}
