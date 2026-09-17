import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runSync } from './operations/sync.mjs';

export const command: CommandDefinition = {
  name: 'sync',
  description: 'Materialize disposable projections from canonical work-items.',
  usage: 'flow sync',
  flags: [projectPathOption],
  effects: 'Reads only canonical work-items; writes _flow/generated/ only.',
  when: 'After canonical work-item changes.',
  load: async () => ({ runSync }),
  run: 'runSync'
};
