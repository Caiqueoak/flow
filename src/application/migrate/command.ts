import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runMigrate } from './operations/apply.mjs';

export const command: CommandDefinition = {
  name: 'migrate',
  description: 'Plan, apply, or complete deterministic migration reconciliation.',
  usage: 'flow migrate --plan|--apply|--complete-reconciliation [--json]',
  flags: [
    projectPathOption,
    { name: '--plan' },
    { name: '--apply' },
    { name: '--complete-reconciliation' },
    { name: '--json' }
  ],
  effects:
    '--plan is read-only; --apply uses validated staging and a recoverable backup; --complete-reconciliation atomically updates only validated migration state.',
  when: 'After doctor reports an artifact version mismatch or migration reconciliation is ready to finish.',
  load: async () => ({ runMigrate }),
  run: 'runMigrate'
};
