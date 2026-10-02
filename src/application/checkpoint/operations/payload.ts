import { fail, requiredOption } from '../../command-runtime.js';
import type { CheckpointData } from './checkpoint.mjs';

export function checkpointData(args: readonly string[]): CheckpointData {
  const text = requiredOption(args, '--data');
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('--data must be a JSON object.');
    return value as CheckpointData;
  } catch (error) {
    if (error instanceof SyntaxError) fail('--data must be valid JSON.');
    throw error;
  }
}
