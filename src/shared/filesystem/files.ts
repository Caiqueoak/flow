import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file: string, content: string): void {
  fs.writeFileSync(file, content, 'utf8');
}

export function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

export function writeYaml(file: string, value: unknown): void {
  writeText(file, stringify(value, { lineWidth: 0 }));
}

export function readYaml<T>(file: string): T {
  return parse(readText(file)) as T;
}

export function projectRelativePath(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}
