import { runGates } from '../operations/gates.js';

export function runRun({ args }: { args: string[] }): void {
  runGates(args);
}
