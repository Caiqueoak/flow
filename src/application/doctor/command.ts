import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runDoctor } from './operations/doctor.mjs';

export const command: CommandDefinition = {
  name: 'doctor',
  description: 'Diagnose versions, artifacts, schemas and integrations without writing.',
  usage: 'flow doctor [--quick] [--json]',
  flags: [projectPathOption, { name: '--quick' }, { name: '--json' }],
  effects: 'Read-only.',
  when: 'At every /flow start with --quick --json, or before migration.',
  load: async () => ({ runDoctor }),
  run: 'runDoctor'
};
