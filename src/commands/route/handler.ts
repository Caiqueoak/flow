import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runRoute } from './usecases/route.mjs';
export const command: CommandDefinition = {
  name: 'route',
  description: 'Resolve the next legal workflow step and safe validation scope.',
  usage: 'flow route [--json]',
  flags: [projectPathOption, { name: '--json' }],
  effects: 'Read-only.',
  when: 'After doctor and every completed workflow step.',
  load: async () => ({ runRoute }),
  run: 'runRoute'
};
