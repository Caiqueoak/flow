import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runSchemas } from './usecases/schemas.mjs';
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
