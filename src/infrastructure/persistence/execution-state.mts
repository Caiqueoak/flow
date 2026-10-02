import path from 'node:path';
import {
  emptyState,
  parseState,
  stringifyState,
  type ExecutionState
} from '../../domain/workflow/execution-state.mjs';
import { atomicWriteText, fileExists, readText } from '../filesystem/index.js';

export function executionStateFile(root: string): string {
  return path.join(root, '_flow', 'state.yaml');
}

export function loadExecutionState(root: string): ExecutionState {
  const file = executionStateFile(root);
  return fileExists(file) ? parseState(readText(file), { source: '_flow/state.yaml' }) : emptyState();
}

export function writeExecutionState(root: string, state: ExecutionState): void {
  const file = executionStateFile(root);
  const content = stringifyState(state);
  atomicWriteText(file, content, {
    validate: (candidate) => {
      parseState(candidate, { source: '_flow/state.yaml' });
    }
  });
}
