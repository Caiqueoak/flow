import path from 'node:path';
import type { CommandDefinition, CommandInvocation } from '../../../application/command-definition.js';
import { fail } from '../terminal/output.js';

export function positionalArguments(args: readonly string[]): string[] {
  return args.filter((value, index) => !value.startsWith('-') && !args[index - 1]?.startsWith('--'));
}

export function commaSeparatedValues(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

export function requiredOption(args: readonly string[], option: string): string {
  const value = optionValue(args, option);
  if (!value) fail(`${option} is required.`);
  return value;
}

export function projectRelativeFiles(root: string, args: readonly string[]): string[] {
  const files = commaSeparatedValues(requiredOption(args, '--files'));
  if (!files.length) fail('--files must name at least one project-relative file.');
  const normalized = files.map((file) => normalizeProjectRelativePath(root, file));
  if (new Set(normalized).size !== normalized.length) fail('--files contains duplicate paths.');
  if (normalized.some((file) => file.startsWith('_flow/generated/')))
    fail('Generated projections must never be committed.');
  return normalized;
}

export function parseCommandInvocation(
  command: CommandDefinition,
  args: readonly string[],
  packageMetadata: Omit<CommandInvocation, 'positionals' | 'options' | 'projectRoot'>
): CommandInvocation {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (!value.startsWith('-')) {
      positionals.push(value);
      continue;
    }

    const definition = command.flags?.find((flag) => flag.name === value);
    if (!definition) throw new Error(`unknown option '${value}' for flow ${command.name}.`);
    if (!definition.value) {
      options.set(value, true);
      continue;
    }

    const optionValue = args[++index];
    if (!optionValue || optionValue.startsWith('-')) throw new Error(`${value} requires ${definition.value}.`);
    options.set(value, optionValue);
  }

  return {
    ...packageMetadata,
    positionals,
    options,
    projectRoot: path.resolve(optionString(options, '--path') ?? process.cwd())
  };
}

function optionString(options: ReadonlyMap<string, string | true>, name: string): string | undefined {
  const value = options.get(name);
  return typeof value === 'string' ? value : undefined;
}

function normalizeProjectRelativePath(root: string, file: string): string {
  if (path.isAbsolute(file)) fail(`--files must be project-relative: '${file}'.`);
  const relative = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
  if (!relative || relative === '..' || relative.startsWith('../')) fail(`--files escapes the project: '${file}'.`);
  return relative;
}
