import fs from 'node:fs';

export function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}
