import { execFileSync } from 'node:child_process';
import { fail } from '../../shared/cli-io.mjs';

export type ProcessEnvironment = NodeJS.ProcessEnv;

export interface GitCommitInput {
  root: string;
  subject: string;
  body?: string;
  env?: ProcessEnvironment;
}

export function stagedFiles(root: string, env: ProcessEnvironment = process.env): string[] {
  return runGit(root, ['diff', '--cached', '--name-only'], env)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGitPath);
}

export function stageFiles(root: string, files: readonly string[], env: ProcessEnvironment = process.env): void {
  if (!files.length) return;
  execFileSync('git', ['add', '--', ...files], { cwd: root, env });
}

export function resetFiles(root: string, files: readonly string[]): void {
  if (!files.length) return;
  execFileSync('git', ['reset', '--quiet', 'HEAD', '--', ...files], { cwd: root });
}

export function createCommit(input: GitCommitInput): void {
  const args = ['commit', '-m', input.subject];
  if (input.body) args.push('-m', input.body);

  execFileSync('git', args, {
    cwd: input.root,
    env: input.env,
    stdio: 'inherit'
  });
}

export function assertExactStagedFiles(
  root: string,
  expectedFiles: readonly string[],
  env: ProcessEnvironment = process.env
): void {
  const actualFiles = stagedFiles(root, env);
  const expected = new Set(expectedFiles);
  const unexpected = actualFiles.filter((file) => !expected.has(file));
  const missing = expectedFiles.filter((file) => !actualFiles.includes(file));

  if (!unexpected.length && !missing.length) return;

  const missingMessage = missing.length ? ` Missing: ${missing.join(', ')}.` : '';
  const unexpectedMessage = unexpected.length ? ` Unexpected: ${unexpected.join(', ')}.` : '';
  fail(`Staged scope differs from --files.${missingMessage}${unexpectedMessage}`);
}

export function assertOnlyStagedFiles(root: string, allowedFiles: readonly string[]): void {
  const allowed = new Set(allowedFiles);
  const unexpected = stagedFiles(root).filter((file) => !allowed.has(file));

  if (unexpected.length) {
    fail(`Staged scope contains unexpected files: ${unexpected.join(', ')}.`);
  }
}

function runGit(root: string, args: readonly string[], env: ProcessEnvironment): string {
  return execFileSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    env
  });
}

function normalizeGitPath(file: string): string {
  return file.replace(/\\/g, '/');
}
