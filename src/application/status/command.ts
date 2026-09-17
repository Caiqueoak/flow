import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runStatus } from './operations/status.mjs';

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
