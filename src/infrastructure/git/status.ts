import { execFileSync } from 'node:child_process';
import type { ProcessEnvironment } from './models.js';

export function stagedFiles(root: string, env: ProcessEnvironment = process.env): string[] {
  return runGit(root, ['diff', '--cached', '--name-only'], env).split(/\r?\n/).filter(Boolean).map(normalizeGitPath);
}

function runGit(root: string, args: readonly string[], env: ProcessEnvironment): string {
  return execFileSync('git', [...args], { cwd: root, encoding: 'utf8', env });
}

function normalizeGitPath(file: string): string {
  return file.replace(/\\/g, '/');
}
