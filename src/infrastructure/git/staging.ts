import { execFileSync } from 'node:child_process';
import { fail } from '../../presentation/cli/terminal/output.js';
import type { ProcessEnvironment } from './models.js';
import { stagedFiles } from './status.js';

export function stageFiles(root: string, files: readonly string[], env: ProcessEnvironment = process.env): void {
  if (files.length) {
    execFileSync('git', ['add', '--', ...files], { cwd: root, env });
  }
}

export function resetFiles(root: string, files: readonly string[]): void {
  if (files.length) {
    execFileSync('git', ['reset', '--quiet', 'HEAD', '--', ...files], { cwd: root });
  }
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

  if (!unexpected.length && !missing.length) {
    return;
  }

  fail(
    `Staged scope differs from --files.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}${unexpected.length ? ` Unexpected: ${unexpected.join(', ')}.` : ''}`
  );
}

export function assertOnlyStagedFiles(root: string, allowedFiles: readonly string[]): void {
  const allowed = new Set(allowedFiles);
  const unexpected = stagedFiles(root).filter((file) => !allowed.has(file));

  if (unexpected.length) {
    fail(`Staged scope contains unexpected files: ${unexpected.join(', ')}.`);
  }
}
