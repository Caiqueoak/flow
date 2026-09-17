import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { runSchemas } from './operations/schemas.mjs';

export const command: CommandDefinition = {
  name: 'schemas',
  description: 'Generate JSON Schemas from central contracts.',
  usage: 'flow schemas',
  flags: [],
  effects: 'Writes package schemas.',
  when: 'Build/release.',
  hidden: true,
  load: async () => ({ runSchemas }),
  run: 'runSchemas'
};
