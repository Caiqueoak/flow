import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runMigrate } from './operations/apply.mjs';

export const command: CommandDefinition = {
  name: 'migrate',
  description: 'Plan or apply deterministic, recoverable structural migrations.',
  usage: 'flow migrate --plan|--apply [--json]',
  flags: [projectPathOption, { name: '--plan' }, { name: '--apply' }, { name: '--json' }],
  effects: '--plan is read-only; --apply uses validated staging and a recoverable backup.',
  when: 'After doctor reports an artifact version mismatch.',
  load: async () => ({ runMigrate }),
  run: 'runMigrate'
};
