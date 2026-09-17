import fs from 'node:fs';

export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file: string, content: string): void {
  fs.writeFileSync(file, content, 'utf8');
}
