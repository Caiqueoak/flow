import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runValidate } from './operations/validate.mjs';

export const command: CommandDefinition = {
  name: 'validate',
  description: 'Run fast structural validation; gates are opt-in.',
  usage: 'flow validate [--work-item W###] [--gates] [--json]',
  flags: [
    projectPathOption,
    { name: '--work-item', value: '<W###>' },
    { name: '--gates' },
    { name: '--pre-commit', value: '<W###-T###>' },
    { name: '--skip-trace' },
    { name: '--json' }
  ],
  effects: 'Read-only; --gates may execute configured processes.',
  when: 'After structured changes and before commits.',
  load: async () => ({ runValidate }),
  run: 'runValidate'
};
