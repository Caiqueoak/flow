import path from 'node:path';
import { fail } from '../../shared/cli-io.mjs';
import { valueAfter } from '../../shared/project-path.mjs';

export function positionalArguments(args: readonly string[]): string[] {
  return args.filter((value, index) => {
    const previous = args[index - 1];
    return !value.startsWith('-') && (index === 0 || !previous?.startsWith('--'));
  });
}

export function commaSeparatedValues(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function optionValue(args: readonly string[], option: string): string | undefined {
  return valueAfter([...args], option);
}

export function requiredOption(args: readonly string[], option: string): string {
  const value = optionValue(args, option);

  if (!value) {
    fail(`${option} is required.`);
  }

  return value!;
}

export function projectRelativeFiles(root: string, args: readonly string[]): string[] {
  const files = commaSeparatedValues(requiredOption(args, '--files'));

  if (!files.length) {
    fail('--files must name at least one project-relative file.');
  }

  const normalized = files.map((file) => normalizeProjectRelativePath(root, file));

  if (new Set(normalized).size !== normalized.length) {
    fail('--files contains duplicate paths.');
  }

  if (normalized.some((file) => file.startsWith('_flow/generated/'))) {
    fail('Generated projections must never be committed.');
  }

  return normalized;
}

function normalizeProjectRelativePath(root: string, file: string): string {
  if (path.isAbsolute(file)) {
    fail(`--files must be project-relative: '${file}'.`);
  }

  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved).replace(/\\/g, '/');

  if (!relative || relative === '..' || relative.startsWith('../')) {
    fail(`--files escapes the project: '${file}'.`);
  }

  return relative;
}
