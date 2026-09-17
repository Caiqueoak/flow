import path from 'node:path';
import { optionValue } from './arguments.js';

export function projectRoot(args: readonly string[]): string {
  return path.resolve(optionValue(args, '--path') ?? process.cwd());
}
