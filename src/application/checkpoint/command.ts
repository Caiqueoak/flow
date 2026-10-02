import { positionalArguments, projectRoot, resolveSubcommand } from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runBegin } from './commands/begin.js';
import { runClear } from './commands/clear.js';
import { runReady } from './commands/ready.js';
import { runUpdate } from './commands/update.js';

const checkpointCommands = {
  begin: runBegin,
  update: runUpdate,
  ready: runReady,
  clear: runClear
} as const;

export const command: CommandDefinition = {
  name: 'checkpoint',
  description: 'Persist or clear temporary decision/planning recovery state.',
  usage: 'flow checkpoint <begin|update|ready|clear> [options]',
  arguments: [{ name: 'operation', required: true }],
  flags: [
    projectPathOption,
    { name: '--data', value: '<json>' },
    { name: '--target-ref', value: '<ref>' },
    { name: '--target-revision', value: '<revision>' }
  ],
  effects: 'Atomically updates only _flow/state.yaml.',
  when: 'For resumable decision-heavy discovery and planning checkpoints.',
  subcommands: Object.keys(checkpointCommands),
  load: async () => ({ runCheckpoint }),
  run: 'runCheckpoint'
};

export function runCheckpoint({ args }: { args: string[] }): void {
  const [action] = positionalArguments(args);
  resolveSubcommand(checkpointCommands, action, `Unknown checkpoint operation '${action}'.`)(projectRoot(args), args);
}
