import { recordOutput, requiredOption } from '../../command-runtime.js';
import { parseCheckpointPayload, updateCheckpoint } from '../operations/checkpoint.mjs';

export function runUpdate(root: string, args: readonly string[]): void {
  updateCheckpoint(root, parseCheckpointPayload(requiredOption(args, '--data')));
  recordOutput('Checkpoint updated.');
}
