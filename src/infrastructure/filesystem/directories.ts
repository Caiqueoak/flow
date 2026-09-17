import fs from 'node:fs';

export function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

export function directoryEntryNames(directory: string): string[] {
  return fs.readdirSync(directory);
}
