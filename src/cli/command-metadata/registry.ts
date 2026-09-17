import { command as approval } from '../../application/approval/command.js';
import { command as diagnostics } from '../../application/doctor/command.js';
import { command as gates } from '../../application/gates/command.js';
import { command as initialization } from '../../application/init/command.js';
import { command as migration } from '../../application/migrate/command.js';
import { command as projections } from '../../application/sync/command.js';
import { command as routing } from '../../application/route/command.js';
import { command as schemaGeneration } from '../../application/schemas/command.js';
import { command as scope } from '../../application/scope/command.js';
import { command as status } from '../../application/status/command.js';
import { command as tasks } from '../../application/task/command.js';
import { command as traceability } from '../../application/trace/command.js';
import { command as validation } from '../../application/validate/command.js';
import { command as workItems } from '../../application/work-item/command.js';
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
