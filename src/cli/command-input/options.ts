import type { CommandOption } from '../command-metadata/definition.js';

export const projectPathOption: CommandOption = {
  name: '--path',
  value: '<project>',
  description: 'Project root (default: current directory).'
};
