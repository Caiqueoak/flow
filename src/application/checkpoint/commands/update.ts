import { updateCheckpoint } from '../operations/checkpoint.mjs';
import { checkpointData } from '../operations/payload.js';

export function runUpdate(root: string, args: readonly string[]) {
  return updateCheckpoint(root, checkpointData(args));
}
