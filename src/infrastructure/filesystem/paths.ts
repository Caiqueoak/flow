import path from 'node:path';

export function projectRelativePath(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}
