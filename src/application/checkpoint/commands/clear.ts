import { optionValue, recordOutput, requiredOption } from '../../command-runtime.js';
import { clearCheckpoint } from '../operations/checkpoint.mjs';

export function runClear(root: string, args: readonly string[]): void {
  clearCheckpoint(root, {
    targetRef: requiredOption(args, '--target-ref'),
    targetRevision: optionValue(args, '--target-revision')
  });
  recordOutput('Checkpoint cleared.');
}
