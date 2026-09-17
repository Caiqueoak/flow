import { execFileSync } from 'node:child_process';

export function gitHistory(root: string): string {
  return execFileSync('git', ['log', 'HEAD', '--format=%H%x1f%ct%x1f%s%x1f%B%x1e'], {
    cwd: root,
    encoding: 'utf8'
  });
}

export function gitChangedFiles(root: string, sha: string): string[] {
  return execFileSync('git', ['show', '--format=', '--name-only', '--no-renames', sha], {
    cwd: root,
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'));
}
