import { execFileSync } from 'node:child_process';
import type { GitCommitInput } from './models.js';

export function createCommit(input: GitCommitInput): void {
  const args = ['commit', '-m', input.subject];

  if (input.body) {
    args.push('-m', input.body);
  }

  execFileSync('git', args, { cwd: input.root, env: input.env, stdio: 'inherit' });
}
