import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { positionalArguments } from '../../cli/command-input/arguments.js';
import { fail, writeOutput } from '../../cli/terminal/output.js';
import { projectRoot } from '../../cli/command-input/project-root.js';
import { createWorkItem } from './usecases/create.js';
import { promoteWorkItem } from './usecases/promote.js';
import { completeWorkItemReview } from './usecases/review-complete.js';
import {
  addWorkItemBlocker,
  resolveWorkItemBlocker,
  updateWorkItemDependencies,
  updateWorkItemIdentity,
  updateWorkItemPriority
} from './usecases/set.js';
import { findWorkItem } from './work-item-context.js';
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
  if (action === 'create') return createWorkItem(root, target, args);
  const item = findWorkItem(root, target);
  if (action === 'promote') promoteWorkItem(item);
  else if (action === 'set') updateWorkItemIdentity(item, args);
  else if (action === 'priority') updateWorkItemPriority(item, args);
  else if (action === 'dependencies') updateWorkItemDependencies(item, args);
  else if (action === 'blocker-add') addWorkItemBlocker(item, args);
  else if (action === 'blocker-resolve') resolveWorkItemBlocker(item, args);
  else if (action === 'review-complete') return completeWorkItemReview(root, item, args);
  else fail(`Unknown work-item operation '${action}'.`);
  writeOutput(`${item.id} updated.`);
}
