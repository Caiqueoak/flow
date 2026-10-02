import { currentCheckpoint } from '../operations/checkpoint.mjs';

export function runShow(root: string) {
  return currentCheckpoint(root);
}
