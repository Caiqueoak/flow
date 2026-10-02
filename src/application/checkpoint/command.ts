import {
  fail,
  positionalArguments,
  projectRoot,
  recordOutput,
  resolveSubcommand
} from '../command-runtime.js';
import { projectPathOption, type CommandDefinition } from '../command-definition.js';
import { runBegin } from './commands/begin.js';
import { runClear } from './commands/clear.js';
import { runReady } from './commands/ready.js';
import { runShow } from './commands/show.js';
import { runUpdate } from './commands/update.js';

type CheckpointCommandHandler = (root: string, args: readonly string[]) => unknown;

const checkpointCommands: Record<string, CheckpointCommandHandler> = {
  begin: runBegin,
  update: runUpdate,
  ready: runReady,
  clear: runClear,
  show: runShow
};

export const command: CommandDefinition = {
  name: 'checkpoint',
  description: 'Persist and inspect temporary decision/planning checkpoints.',
  usage: 'flow checkpoint <begin|update|ready|clear|show> [options]',
  arguments: [{ name: 'operation', required: true }],
  flags: [
    projectPathOption,
    { name: '--data', value: '<json>' },
    { name: '--target', value: '<ref>' },
    { name: '--revision', value: '<revision>' },
    { name: '--json' }
  ],
  effects: 'Atomically updates only _flow/state.yaml checkpoint state.',
  when: 'During decision-heavy discovery or planning that must survive interruption.',
  subcommands: Object.keys(checkpointCommands),
  load: async () => ({ runCheckpoint }),
  run: 'runCheckpoint'
};

export function runCheckpoint({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action] = positionalArguments(args);
  if (!action) fail('Missing checkpoint operation.');

  const execute = resolveSubcommand(checkpointCommands, action, `Unknown checkpoint operation '${action}'.`);
  const result = execute(root, args);

  if (args.includes('--json') || action === 'show') {
    recordOutput(JSON.stringify(result, null, 2));
    return;
  }

  recordOutput(action === 'clear' ? 'Checkpoint cleared.' : `Checkpoint ${action} complete.`);
}
