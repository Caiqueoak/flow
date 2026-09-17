import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runGates } from './usecases/gates.mjs';
export const command: CommandDefinition = {
  name: 'gates',
  description: 'List or selectively run deterministic project gates.',
  usage: 'flow gates list|run [filters]',
  arguments: [{ name: 'action', required: true }],
  flags: [
    projectPathOption,
    { name: '--id', value: '<gate-id>' },
    { name: '--task', value: '<W###-T###>' },
    { name: '--work-item', value: '<W###>' },
    { name: '--stage', value: '<stage>', values: ['task', 'work-item-review', 'full'] },
    { name: '--all' },
    { name: '--json' }
  ],
  effects: 'list is read-only; run executes selected commands.',
  when: 'For the smallest safe verification scope.',
  load: async () => ({ runGates }),
  run: 'runGates'
};
