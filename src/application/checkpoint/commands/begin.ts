import { beginCheckpoint } from '../operations/checkpoint.mjs';
import { checkpointData } from '../operations/payload.js';

export function runBegin(root: string, args: readonly string[]) {
  return beginCheckpoint(root, checkpointData(args));
}
