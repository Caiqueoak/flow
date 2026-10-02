import { recordOutput, requiredOption } from '../../command-runtime.js';
import { beginCheckpoint, parseCheckpointPayload } from '../operations/checkpoint.mjs';

export function runBegin(root: string, args: readonly string[]): void {
  beginCheckpoint(root, parseCheckpointPayload(requiredOption(args, '--data')));
  recordOutput('Checkpoint started.');
}
