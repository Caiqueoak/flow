import { listGates } from '../operations/gates.js';

export function runList({ args }: { args: string[] }): void {
  listGates(args);
}
