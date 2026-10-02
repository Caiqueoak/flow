import path from 'node:path';
import { emptyState, parseState, stringifyState, type ExecutionState } from '../../domain/workflow/execution-state.mjs';
import {
  atomicWriteText,
  ensureDirectory,
  fileExists,
  readText,
  type AtomicWriteOptions
} from '../filesystem/index.js';

export interface WriteExecutionStateOptions {
  replace?: AtomicWriteOptions['replace'];
}

export function executionStatePath(root: string): string {
  return path.join(root, '_flow', 'state.yaml');
}

export function loadExecutionState(root: string): ExecutionState {
  const file = executionStatePath(root);
  return fileExists(file) ? parseState(readText(file), { source: file }) : emptyState();
}

export function writeExecutionState(
  root: string,
  state: ExecutionState,
  { replace }: WriteExecutionStateOptions = {}
): ExecutionState {
  const file = executionStatePath(root);
  ensureDirectory(path.dirname(file));
  const text = stringifyState(state);
  atomicWriteText(file, text, {
    replace,
    validate: (candidate) => parseState(candidate, { source: file })
  });
  return parseState(text, { source: file });
}
