import { optionValue, requiredOption } from '../../command-runtime.js';
import { clearCheckpoint } from '../operations/checkpoint.mjs';

export function runClear(root: string, args: readonly string[]): null {
  clearCheckpoint(root, {
    targetRef: requiredOption(args, '--target'),
    targetRevision: optionValue(args, '--revision')
  });
  return null;
}
