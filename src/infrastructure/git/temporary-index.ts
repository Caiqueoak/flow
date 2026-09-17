import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TemporaryGitIndex } from './models.js';

export function createTemporaryGitIndex(root: string): TemporaryGitIndex {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-index-'));
  const index = path.join(directory, 'index');
  const currentIndex = path.resolve(
    root,
    execFileSync('git', ['rev-parse', '--git-path', 'index'], { cwd: root, encoding: 'utf8' }).trim()
  );

  if (fs.existsSync(currentIndex)) {
    fs.copyFileSync(currentIndex, index);
  }

  const env = { ...process.env, GIT_INDEX_FILE: index };

  if (!fs.existsSync(index)) {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root, env });
  }

  return { directory, env };
}

export function removeTemporaryGitIndex(index: TemporaryGitIndex): void {
  fs.rmSync(index.directory, { recursive: true, force: true });
}
