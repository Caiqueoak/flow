import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runTrace } from './operations/trace.mjs';

export const command: CommandDefinition = {
  name: 'trace',
  description: 'Resolve a permanent task ID against reachable Git history.',
  usage: 'flow trace W###[-T###] [--json]',
  arguments: [{ name: 'identity', required: true, description: 'Task W###-T### or aggregate work-item W###.' }],
  flags: [projectPathOption, { name: '--json' }],
  effects: 'Read-only Git inspection.',
  when: 'After task completion and during review.',
  load: async () => ({ runTrace }),
  run: 'runTrace'
};
