import { optionValue } from '../../command-runtime.js';
import { markCheckpointApprovalReady } from '../operations/checkpoint.mjs';

export function runReady(root: string, args: readonly string[]) {
  return markCheckpointApprovalReady(root, optionValue(args, '--revision'));
}
