import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface AtomicWriteOptions {
  validate?: (content: string) => void;
  replace?: (temporary: string, target: string) => void;
}

export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function atomicWriteText(file: string, content: string, options: AtomicWriteOptions = {}): void {
  options.validate?.(content);
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    (options.replace ?? fs.renameSync)(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

export function writeText(file: string, content: string): void {
  atomicWriteText(file, content);
}
