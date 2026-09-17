import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { UserInputError } from '../domain/errors.js';
import type { CommandOutcome } from './command-definition.js';

interface CommandRun {
  lines: string[];
  exitCode?: number;
  prompts: PromptPort;
}

export interface PromptOption {
  label: string;
  value: string;
  description?: string;
}

export interface PromptPort {
  text(message: string, defaultValue?: string): Promise<string>;
  select(input: { title: string; options: PromptOption[]; defaultIndex?: number }): Promise<string>;
  multiSelect(input: { title: string; options: PromptOption[] }): Promise<string[]>;
}

const activeRun = new AsyncLocalStorage<CommandRun>();

/** Records application results; presentation decides how they are rendered. */
export function recordOutput(value: string): void {
  const run = activeRun.getStore();
  if (run) run.lines.push(value);
}

/** Ends a command with an actionable input error for presentation to render. */
export function fail(message: string, exitCode = 1): never {
  throw new UserInputError(message, exitCode);
}

/** Records a non-success result without coupling application code to Node process state. */
export function setExitCode(exitCode: number): void {
  const run = activeRun.getStore();
  if (run) run.exitCode = exitCode;
}

export async function captureCommandOutcome(
  run: () => unknown | Promise<unknown>,
  prompts: PromptPort = unavailablePrompts
): Promise<CommandOutcome> {
  const state: CommandRun = { lines: [], prompts };
  await activeRun.run(state, run);
  return state.exitCode === undefined
    ? { kind: 'text', lines: state.lines }
    : { kind: 'text', lines: state.lines, exitCode: state.exitCode };
}

export function promptText(message: string, defaultValue = ''): Promise<string> {
  return activeRun.getStore()?.prompts.text(message, defaultValue) ?? unavailablePrompts.text(message, defaultValue);
}

export function promptSelect(input: {
  title: string;
  options: PromptOption[];
  defaultIndex?: number;
}): Promise<string> {
  return activeRun.getStore()?.prompts.select(input) ?? unavailablePrompts.select(input);
}

export function promptMultiSelect(input: { title: string; options: PromptOption[] }): Promise<string[]> {
  return activeRun.getStore()?.prompts.multiSelect(input) ?? unavailablePrompts.multiSelect(input);
}

/** Transitional adapters for command slices while they adopt CommandInvocation. */
export function positionalArguments(args: readonly string[]): string[] {
  return args.filter((value, index) => !value.startsWith('-') && !args[index - 1]?.startsWith('--'));
}

export function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

export function requiredOption(args: readonly string[], option: string): string {
  return optionValue(args, option) ?? fail(`${option} is required.`);
}

export function commaSeparatedValues(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

export function projectRoot(args: readonly string[]): string {
  return path.resolve(optionValue(args, '--path') ?? process.cwd());
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

function normalizeProjectRelativePath(root: string, file: string): string {
  if (path.isAbsolute(file)) fail(`--files must be project-relative: '${file}'.`);
  const relative = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
  if (!relative || relative === '..' || relative.startsWith('../')) fail(`--files escapes the project: '${file}'.`);
  return relative;
}

const unavailablePrompts: PromptPort = {
  text: unavailablePrompt,
  select: unavailablePrompt,
  multiSelect: unavailablePrompt
};

function unavailablePrompt(): never {
  throw new Error('Interactive prompts are available only through the CLI presentation adapter.');
}
