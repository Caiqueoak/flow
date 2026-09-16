import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runStatus } from './usecases/status.mjs';
export const command: CommandDefinition = {
  name: 'status',
  description: 'Show persisted progress and derived eligibility/blocking.',
  usage: 'flow status [--json]',
  flags: [projectPathOption, { name: '--json' }],
  effects: 'Read-only.',
  when: 'To inspect progress.',
  load: async () => ({ runStatus }),
  run: 'runStatus'
};
