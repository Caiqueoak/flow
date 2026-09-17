import { parse, stringify } from 'yaml';
import { readText, writeText } from '../files.js';

export function writeYaml(file: string, value: unknown): void {
  writeText(file, stringify(value, { lineWidth: 0 }));
}

export function readYaml<T>(file: string): T {
  return parse(readText(file)) as T;
}
