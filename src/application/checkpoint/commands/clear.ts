import { optionValue, requiredOption } from '../../command-runtime.js';
import { clearCheckpoint } from '../operations/checkpoint.mjs';

export function runClear(root: string, args: readonly string[]): null {
  const targetRevision = optionValue(args, '--revision');
  clearCheckpoint(root, {
    targetRef: requiredOption(args, '--target'),
    ...(targetRevision ? { targetRevision } : {})
  });
  return null;
}
