import { recordOutput, requiredOption } from '../../command-runtime.js';
import { markCheckpointApprovalReady } from '../operations/checkpoint.mjs';

export function runReady(root: string, args: readonly string[]): void {
  markCheckpointApprovalReady(root, requiredOption(args, '--target-revision'));
  recordOutput('Checkpoint is approval-ready.');
}
