import { positionalArguments } from '../../cli/command-input/arguments.js';
import { projectRoot } from '../../cli/command-input/project-root.js';
import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { fail, writeOutput } from '../../cli/terminal/output.js';
import { addWorkItemBlocker } from './commands/blocker-add.js';
import { resolveWorkItemBlocker } from './commands/blocker-resolve.js';
import { createWorkItem } from './commands/create.js';
import { updateWorkItemDependencies } from './commands/dependencies.js';
import { updateWorkItemPriority } from './commands/priority.js';
import { promoteWorkItem } from './commands/promote.js';
import { completeWorkItemReview } from './commands/review-complete.js';
import { updateWorkItemIdentity } from './commands/set.js';
import { findWorkItem } from './work-item-context.js';

interface WorkItemCommandContext {
  root: string;
  target: string | undefined;
  args: readonly string[];
}

type WorkItemCommandHandler = (context: WorkItemCommandContext) => void;

const workItemCommands: Record<string, WorkItemCommandHandler> = {
  create: ({ root, target, args }) => createWorkItem(root, target, args),
  set: ({ root, target, args }) => updateWorkItemIdentity(findWorkItem(root, target), args),
  priority: ({ root, target, args }) => updateWorkItemPriority(findWorkItem(root, target), args),
  dependencies: ({ root, target, args }) => updateWorkItemDependencies(findWorkItem(root, target), args),
  'blocker-add': ({ root, target, args }) => addWorkItemBlocker(findWorkItem(root, target), args),
  'blocker-resolve': ({ root, target, args }) => resolveWorkItemBlocker(findWorkItem(root, target), args),
  promote: ({ root, target }) => promoteWorkItem(findWorkItem(root, target)),
  'review-complete': ({ root, target, args }) => completeWorkItemReview(root, findWorkItem(root, target), args)
};

export const command: CommandDefinition = {
  name: 'work-item',
  description: 'Create or deterministically update backlog work-items.',
  usage: 'flow work-item <create|set|priority|dependencies|blocker-add|blocker-resolve|promote|review-complete> ...',
  arguments: [{ name: 'operation', required: true }],
  flags: [
    projectPathOption,
    { name: '--title', value: '<text>' },
    { name: '--kind', value: '<kind>', values: ['feature', 'technical', 'maintenance'] },
    { name: '--priority', value: '<integer>' },
    { name: '--depends-on', value: '<W###,...>' },
    { name: '--id', value: '<blocker-id>' },
    { name: '--type', value: '<type>', values: ['external_action', 'consequential_decision'] },
    { name: '--description', value: '<text>' },
    { name: '--domain', value: '<domain>' }
  ],
  effects: 'Writes only artifacts in the target work-item folder.',
  when: 'For deterministic backlog mutations.',
  load: async () => ({ runWorkItem }),
  run: 'runWorkItem'
};

export function runWorkItem({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (!action) {
    fail('Missing work-item operation.');
  }

  const execute = workItemCommands[action];

  if (!execute) {
    fail(`Unknown work-item operation '${action}'.`);
  }

  execute({ root, target, args });

  if (action !== 'create' && action !== 'review-complete') {
    writeOutput(`${target} updated.`);
  }
}
