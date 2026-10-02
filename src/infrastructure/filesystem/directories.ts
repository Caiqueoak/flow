import fs from 'node:fs';
import path from 'node:path';

export function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

export function directoryEntryNames(directory: string): string[] {
  return fs.readdirSync(directory);
}

export function createTemporarySiblingDirectory(target: string): string {
  const parent = path.dirname(target);
  ensureDirectory(parent);
  return fs.mkdtempSync(path.join(parent, `.${path.basename(target)}.flow-tmp-`));
}

export function publishDirectory(staged: string, target: string): void {
  fs.renameSync(staged, target);
}

export function removeDirectory(directory: string): void {
  fs.rmSync(directory, { recursive: true, force: true });
}
