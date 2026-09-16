import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { runApproval } from './handler.js';

export const definition: CommandDefinition = {
  name: 'approval',
  description: 'Persist an explicit human approval for a document revision.',
  usage: 'flow approval record <path> [--at <ISO timestamp>]',
  arguments: [{ name: 'operation', required: true }],
  flags: [projectPathOption, { name: '--at', value: '<timestamp>' }],
  effects: 'Updates approved frontmatter.',
  when: 'Only after explicit approval of the exact document.',
  load: async () => ({ runApproval }),
  run: 'runApproval'
};
