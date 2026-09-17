import { projectPathOption } from '../../presentation/cli/command-input/options.js';
import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { runRoute } from './operations/route.mjs';

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
