import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runInit } from './operations/init.mjs';

export const command: CommandDefinition = {
  name: 'init',
  description: 'Initialize Flow or refresh runtime integrations.',
  usage: 'flow init [options]',
  flags: [
    projectPathOption,
    { name: '--runtime', value: '<list>' },
    { name: '--profile', value: '<id>', default: 'readability-first' },
    { name: '--existing-code', value: '<policy>', values: ['preserve', 'incremental', 'refactor'] }
  ],
  effects: 'Writes config and runtime skills.',
  when: 'Once per project and after an explicit package update.',
  load: async () => ({ runInit }),
  run: 'runInit'
};
