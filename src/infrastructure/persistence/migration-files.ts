import fs from 'node:fs';
import path from 'node:path';

export interface MigrationDirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export function migrationPathExists(target: string): boolean {
  return fs.existsSync(target);
}

export function readMigrationText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function writeMigrationText(file: string, text: string): void {
  fs.writeFileSync(file, text);
}

export function ensureMigrationDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

export function migrationDirectoryNames(directory: string): string[] {
  return fs.readdirSync(directory);
}

export function migrationDirectoryEntries(directory: string): MigrationDirectoryEntry[] {
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory()
  }));
}

export function copyMigrationDirectory(source: string, target: string): void {
  fs.cpSync(source, target, { recursive: true });
}

export function removeMigrationPath(target: string): void {
  fs.rmSync(target, { recursive: true, force: true });
}

export function renameMigrationPath(source: string, target: string): void {
  fs.renameSync(source, target);
}

export function deleteMigrationFile(file: string): void {
  fs.unlinkSync(file);
}

export function createMigrationWorkspace(prefix: string): string {
  return fs.mkdtempSync(prefix);
}

export function moveMigrationPath(source: string, target: string): void {
  if (!fs.existsSync(source) || path.resolve(source) === path.resolve(target)) return;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    return;
  }
  if (fs.realpathSync.native(source) !== fs.realpathSync.native(target))
    throw new Error(`Migration destination already exists: ${target}`);

  const temporary = temporarySibling(source);
  fs.renameSync(source, temporary);
  try {
    fs.renameSync(temporary, target);
  } catch (error: unknown) {
    try {
      fs.renameSync(temporary, source);
    } catch (recoveryError: unknown) {
      if (isRecord(error)) {
        error.preserveRecoveryData = true;
        error.recovery = { source, target, temporary, recoveryError };
      }
    }
    throw error;
  }
}

function temporarySibling(file: string): string {
  const directory = path.dirname(file);
  const base = path.basename(file);
  let attempt = 0;
  let temporary = '';
  do {
    temporary = path.join(directory, `.${base}_flow-migration-${process.pid}-${Date.now()}-${attempt++}`);
  } while (fs.existsSync(temporary));
  return temporary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
