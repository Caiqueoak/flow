import { projectPathOption } from '../../presentation/cli/command-input/options.js';
import type { CommandDefinition } from '../../presentation/cli/command-metadata/definition.js';
import { runInit } from './operations/init.mjs';

export const command: CommandDefinition = {
  name: 'init',
  description: 'Initialize Flow or refresh runtime integrations.',
  usage: 'flow init [options]',
  flags: [
    projectPathOption,
    { name: '--runtime', value: '<list>' },
    { name: '--profile', value: '<id>', default: 'readability-first' },
    { name: '--existing-code', value: '<policy>', values: ['improve', 'preserve'] }
  ],
  effects: 'Writes config and runtime skills.',
  when: 'Once per project and after an explicit package update.',
  load: async () => ({ runInit }),
  run: 'runInit'
};
