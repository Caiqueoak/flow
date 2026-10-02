import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file: string, content: string): void {
  atomicWriteText(file, content);
}

export function atomicWriteText(
  file: string,
  content: string,
  { validate }: { validate?: (candidate: string) => void } = {}
): void {
  validate?.(content);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.flow-tmp-${process.pid}-${randomUUID()}`);
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    validate?.(fs.readFileSync(temporary, 'utf8'));
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}
